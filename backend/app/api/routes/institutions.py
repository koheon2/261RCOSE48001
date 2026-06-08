"""Institution profile and strength analysis endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/institutions", tags=["institutions"])

QUALITY_PROVENANCE = {
    "quality_filtered": True,
    "quality_policy": "conservative_v0",
}

INSTITUTION_ALIASES = {
    "kaist": "Korea Advanced Institute of Science and Technology",
    "korea advanced institute of science and technology": "Korea Advanced Institute of Science and Technology",
    "snu": "Seoul National University",
    "seoul national university": "Seoul National University",
    "mit": "Massachusetts Institute of Technology",
    "massachusetts institute of technology": "Massachusetts Institute of Technology",
    "stanford": "Stanford University",
    "stanford university": "Stanford University",
}


def _normalize_query(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _alias(value: str) -> str:
    return INSTITUTION_ALIASES.get(_normalize_query(value), value.strip())


async def _resolve_institution(db: AsyncSession, query: str):
    canonical_hint = _alias(query)
    result = await db.execute(
        text("""
        WITH candidates AS (
            SELECT
                stats.institution_name,
                stats.contributions,
                stats.papers,
                stats.total_citations,
                1 AS rank
            FROM publication_institution_stats stats
            WHERE lower(stats.institution_name) = lower(:query)

            UNION ALL

            SELECT
                stats.institution_name,
                stats.contributions,
                stats.papers,
                stats.total_citations,
                2 AS rank
            FROM institution_name_matches inm
            JOIN publication_institution_stats stats
              ON stats.institution_name = inm.canonical_name
            WHERE inm.status = 'matched'
              AND (
                  lower(inm.raw_institution_name) = lower(:query)
                  OR lower(inm.canonical_name) = lower(:query)
                  OR lower(inm.institution_ror_id) = lower(:query)
                  OR lower(inm.openalex_institution_id) = lower(:query)
              )

            UNION ALL

            SELECT
                stats.institution_name,
                stats.contributions,
                stats.papers,
                stats.total_citations,
                3 AS rank
            FROM publication_institution_stats stats
            WHERE lower(stats.institution_name) LIKE '%' || lower(:query) || '%'
        )
        SELECT institution_name, contributions, papers, total_citations
        FROM candidates
        ORDER BY rank, contributions DESC
        LIMIT 1
        """),
        {"query": canonical_hint},
    )
    return result.first()


@router.get("/profile")
async def institution_profile(
    name: str = Query(..., min_length=2, description="Institution name, alias, ROR id, or OpenAlex institution id"),
    years: int = Query(10, ge=1, le=50),
    top_fields: int = Query(8, ge=1, le=20),
    top_papers: int = Query(6, ge=0, le=20),
    top_authors: int = Query(8, ge=0, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Return institution-level strengths, field trends, authors, and representative papers."""
    resolved = await _resolve_institution(db, name)
    if not resolved:
        raise HTTPException(status_code=404, detail="Institution not found")

    institution_name = resolved.institution_name

    metadata = (
        await db.execute(
            text("""
            SELECT
                MAX(institution_ror_id) FILTER (
                    WHERE institution_ror_id IS NOT NULL
                      AND institution_ror_id <> ''
                ) AS institution_ror_id,
                MAX(openalex_institution_id) FILTER (
                    WHERE openalex_institution_id IS NOT NULL
                      AND openalex_institution_id <> ''
                ) AS openalex_institution_id,
                MAX(confidence) AS institution_match_confidence,
                COUNT(DISTINCT raw_institution_name)::bigint AS raw_alias_count
            FROM institution_name_matches
            WHERE status = 'matched'
              AND canonical_name = :institution_name
            """),
            {"institution_name": institution_name},
        )
    ).one()

    field_rows = (
        await db.execute(
            text("""
            SELECT
                subfield,
                contributions,
                papers,
                total_citations,
                avg_paper_citations,
                min_year,
                max_year,
                institution_ror_id,
                institution_match_confidence,
                institution_normalized
            FROM publication_institution_field_stats
            WHERE institution_name = :institution_name
            ORDER BY contributions DESC, papers DESC
            LIMIT :limit
            """),
            {"institution_name": institution_name, "limit": top_fields},
        )
    ).fetchall()

    trend_rows = (
        await db.execute(
            text("""
            WITH selected_fields AS (
                SELECT subfield
                FROM publication_institution_field_stats
                WHERE institution_name = :institution_name
                ORDER BY contributions DESC, papers DESC
                LIMIT :top_fields
            ),
            year_bounds AS (
                SELECT COALESCE(MAX(year), EXTRACT(YEAR FROM CURRENT_DATE)::int) AS max_year
                FROM publication_institution_field_year_stats
                WHERE institution_name = :institution_name
            )
            SELECT
                y.subfield,
                y.year,
                y.contributions,
                y.papers,
                y.total_citations,
                y.avg_paper_citations
            FROM publication_institution_field_year_stats y
            JOIN selected_fields sf ON sf.subfield = y.subfield
            CROSS JOIN year_bounds b
            WHERE y.institution_name = :institution_name
              AND y.year >= b.max_year - :years + 1
            ORDER BY y.subfield, y.year
            """),
            {"institution_name": institution_name, "top_fields": top_fields, "years": years},
        )
    ).fetchall()

    author_rows = []
    if top_authors:
        author_rows = (
            await db.execute(
                text("""
                WITH raw_names AS (
                    SELECT raw_institution_name AS institution_name
                    FROM institution_name_matches
                    WHERE status = 'matched'
                      AND canonical_name = :institution_name
                    UNION
                    SELECT :institution_name AS institution_name
                )
                SELECT
                    paa.author_id,
                    MAX(paa.author_name) AS author_name,
                    COUNT(*)::bigint AS contributions,
                    COUNT(DISTINCT paa.paper_id)::bigint AS papers,
                    COALESCE(SUM(p.citations), 0)::bigint AS total_citations,
                    COALESCE(AVG(p.citations), 0)::float AS avg_paper_citations,
                    MIN(paa.publication_year) AS min_year,
                    MAX(paa.publication_year) AS max_year
                FROM paper_author_affiliations paa
                JOIN raw_names rn ON rn.institution_name = paa.institution_name
                JOIN papers p ON p.id = paa.paper_id
                WHERE paa.author_id IS NOT NULL
                  AND paa.author_id <> ''
                  AND NOT EXISTS (
                      SELECT 1
                      FROM paper_quality_flags pqf
                      WHERE pqf.paper_id = p.id
                        AND pqf.severity = 'exclude'
                  )
                GROUP BY paa.author_id
                ORDER BY contributions DESC, total_citations DESC
                LIMIT :limit
                """),
                {"institution_name": institution_name, "limit": top_authors},
            )
        ).fetchall()

    paper_rows = []
    if top_papers:
        paper_rows = (
            await db.execute(
                text("""
                WITH raw_names AS (
                    SELECT raw_institution_name AS institution_name
                    FROM institution_name_matches
                    WHERE status = 'matched'
                      AND canonical_name = :institution_name
                    UNION
                    SELECT :institution_name AS institution_name
                ),
                candidate_papers AS (
                    SELECT DISTINCT paa.paper_id
                    FROM paper_author_affiliations paa
                    JOIN raw_names rn ON rn.institution_name = paa.institution_name
                    LIMIT 50000
                )
                SELECT
                    p.id,
                    p.title,
                    p.year,
                    p.citations,
                    p.fwci,
                    p.doi,
                    p.open_access,
                    p.type,
                    p.subfield,
                    p.topic
                FROM candidate_papers cp
                JOIN papers p ON p.id = cp.paper_id
                WHERE lower(COALESCE(p.type, '')) IN (
                    'article',
                    'preprint',
                    'proceedings-article',
                    'review'
                )
                  AND NOT EXISTS (
                    SELECT 1
                    FROM paper_quality_flags pqf
                    WHERE pqf.paper_id = p.id
                      AND pqf.severity = 'exclude'
                )
                ORDER BY p.citations DESC NULLS LAST, p.year DESC NULLS LAST, p.id
                LIMIT :limit
                """),
                {"institution_name": institution_name, "limit": top_papers},
            )
        ).fetchall()

    trend_by_field: dict[str, list[dict]] = {}
    for row in trend_rows:
        trend_by_field.setdefault(row.subfield, []).append({
            "year": int(row.year),
            "contributions": int(row.contributions or 0),
            "papers": int(row.papers or 0),
            "total_citations": int(row.total_citations or 0),
            "avg_paper_citations": float(row.avg_paper_citations or 0),
        })

    return {
        "query": name,
        "institution": {
            "name": institution_name,
            "institution_ror_id": metadata.institution_ror_id,
            "openalex_institution_id": metadata.openalex_institution_id,
            "institution_match_confidence": (
                round(float(metadata.institution_match_confidence), 3)
                if metadata.institution_match_confidence is not None else None
            ),
            "institution_normalized": bool(metadata.institution_ror_id),
            "raw_alias_count": int(metadata.raw_alias_count or 0),
        },
        "overall": {
            "contributions": int(resolved.contributions or 0),
            "papers": int(resolved.papers or 0),
            "total_citations": int(resolved.total_citations or 0),
        },
        "top_fields": [
            {
                "field": row.subfield,
                "contributions": int(row.contributions or 0),
                "papers": int(row.papers or 0),
                "total_citations": int(row.total_citations or 0),
                "avg_paper_citations": float(row.avg_paper_citations or 0),
                "min_year": row.min_year,
                "max_year": row.max_year,
                "institution_ror_id": row.institution_ror_id,
                "institution_match_confidence": (
                    round(float(row.institution_match_confidence), 3)
                    if row.institution_match_confidence is not None else None
                ),
                "institution_normalized": bool(row.institution_normalized),
                "trend": trend_by_field.get(row.subfield, []),
            }
            for row in field_rows
        ],
        "top_authors": [
            {
                "author_id": row.author_id,
                "name": row.author_name,
                "contributions": int(row.contributions or 0),
                "papers": int(row.papers or 0),
                "total_citations": int(row.total_citations or 0),
                "avg_paper_citations": float(row.avg_paper_citations or 0),
                "min_year": row.min_year,
                "max_year": row.max_year,
            }
            for row in author_rows
        ],
        "representative_papers": [
            {
                "id": row.id,
                "title": row.title,
                "year": row.year,
                "citations": int(row.citations or 0),
                "fwci": float(row.fwci) if row.fwci is not None else None,
                "doi": row.doi,
                "open_access": bool(row.open_access),
                "type": row.type,
                "subfield": row.subfield,
                "topic": row.topic,
            }
            for row in paper_rows
        ],
        **QUALITY_PROVENANCE,
    }
