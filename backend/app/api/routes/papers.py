"""Major-paper timeline per facet-backed topic."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.paper_facets import FACET_TYPES, canonicalize_facet_query, normalize_facet_text

router = APIRouter(prefix="/papers", tags=["papers"])

SPECIFIC_AXIS = "specific"
AXIS_PATTERN = "^(aboutness|method|task|application|specific)$"
PAPER_SEARCH_VECTOR = (
    "to_tsvector('english'::regconfig, "
    "coalesce(p.title, '') || ' ' || coalesce(p.topic, '') || ' ' || coalesce(p.abstract, ''))"
)

QUALITY_PROVENANCE = {
    "quality_filtered": True,
    "quality_policy": "conservative_v0",
}


def _axis_filter(axis: str | None = None) -> list[str]:
    if axis and axis != SPECIFIC_AXIS:
        return [axis]
    return list(FACET_TYPES)


async def _specific_topic_option(
    db: AsyncSession,
    query: str,
) -> dict[str, object] | None:
    if len(query.strip()) < 3:
        return None

    result = await db.execute(
        text(f"""
        WITH search_query AS (
            SELECT websearch_to_tsquery('english', :query) AS tsq
        )
        SELECT
            COUNT(*)::bigint AS paper_count,
            COALESCE(SUM(p.citations), 0)::bigint AS total_citations,
            MIN(p.year) AS min_year,
            MAX(p.year) AS max_year
        FROM papers p
        CROSS JOIN search_query sq
        WHERE {PAPER_SEARCH_VECTOR} @@ sq.tsq
          AND p.year IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM paper_quality_flags pqf
              WHERE pqf.paper_id = p.id
                AND pqf.severity = 'exclude'
          )
        """),
        {"query": query},
    )
    row = result.one()
    paper_count = int(row.paper_count or 0)
    if paper_count == 0:
        return None

    return {
        "facet_type": SPECIFIC_AXIS,
        "topic": query.strip(),
        "paper_count": paper_count,
        "total_citations": int(row.total_citations or 0),
        "min_year": row.min_year,
        "max_year": row.max_year,
    }


async def _timeline_response(
    db: AsyncSession,
    *,
    topic: str,
    query: str,
    matched_axes: list[str],
    per_year: int,
    min_fwci: float,
    papers: list,
) -> dict:
    if not papers:
        return {
            "topic": topic,
            "query": query,
            "matched_axes": matched_axes,
            "per_year": per_year,
            "min_fwci": min_fwci,
            "papers": [],
            "by_year": [],
            **QUALITY_PROVENANCE,
        }

    paper_ids = [p.id for p in papers]
    author_rows = await db.execute(
        text("""
        SELECT paper_id, author_id, author_name, institution_name, position
        FROM paper_authors
        WHERE paper_id = ANY(:ids)
          AND position <= 2
        ORDER BY paper_id, position
        """),
        {"ids": paper_ids},
    )
    authors_by_paper: dict[str, list[dict]] = {}
    for a in author_rows.fetchall():
        authors_by_paper.setdefault(a.paper_id, []).append({
            "author_id": a.author_id,
            "name": a.author_name,
            "institution": a.institution_name,
            "position": a.position,
        })

    items = [
        {
            "id": p.id,
            "title": p.title,
            "year": p.year,
            "citations": int(p.citations or 0),
            "fwci": float(p.fwci) if p.fwci is not None else None,
            "doi": p.doi,
            "abstract": None,
            "open_access": bool(p.open_access),
            "type": p.type,
            "authors": authors_by_paper.get(p.id, []),
        }
        for p in papers
    ]

    by_year: dict[int, list[dict]] = {}
    for it in items:
        by_year.setdefault(it["year"], []).append(it)
    grouped = [
        {"year": y, "papers": by_year[y]}
        for y in sorted(by_year.keys())
    ]

    return {
        "topic": topic,
        "query": query,
        "matched_axes": matched_axes,
        "per_year": per_year,
        "min_fwci": min_fwci,
        "papers": items,
        "by_year": grouped,
        **QUALITY_PROVENANCE,
    }


@router.get("/topics")
async def list_topics(
    q: str | None = Query(None, description="Substring filter on topic name"),
    axis: str | None = Query(None, pattern=AXIS_PATTERN),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Return facet topics with paper counts, sorted by match quality and size."""
    query = q.strip() if q and q.strip() else ""
    axes = _axis_filter(axis)
    params: dict[str, object] = {
        "axes": axes,
        "limit": limit,
    }
    where = "WHERE s.facet_type = ANY(:axes) AND s.paper_count > 0"
    order = "s.paper_count DESC, s.facet_value ASC"

    if query:
        canonical, matched_axes = canonicalize_facet_query(query)
        if matched_axes and axis is None:
            axes = matched_axes
            params["axes"] = axes
        params.update(
            {
                "q": query.lower(),
                "canonical": canonical.lower(),
                "q_prefix": f"{query.lower()}%",
                "q_contains": f"%{query.lower()}%",
            }
        )
        where += """
          AND (
            LOWER(s.facet_value) = :canonical
            OR LOWER(s.facet_value) LIKE :q_contains
          )
        """
        order = """
        CASE
            WHEN LOWER(s.facet_value) = :canonical THEN 0
            WHEN LOWER(s.facet_value) = :q THEN 1
            WHEN LOWER(s.facet_value) LIKE :q_prefix THEN 2
            ELSE 3
        END,
        s.paper_count DESC,
        s.facet_value ASC
        """

    rows = []
    if axis != SPECIFIC_AXIS:
        result = await db.execute(
            text(f"""
            WITH years AS (
                SELECT
                    facet_type,
                    facet_value,
                    MIN(year) AS min_year,
                    MAX(year) AS max_year
                FROM paper_facet_year_summary
                WHERE facet_type = ANY(:axes)
                GROUP BY facet_type, facet_value
            )
            SELECT
                s.facet_type,
                s.facet_value AS topic,
                s.paper_count,
                s.total_citations,
                years.min_year,
                years.max_year
            FROM paper_facet_summary s
            LEFT JOIN years
              ON years.facet_type = s.facet_type
             AND years.facet_value = s.facet_value
            {where}
            ORDER BY {order}
            LIMIT :limit
            """),
            params,
        )
        rows = [
            {
                "facet_type": r.facet_type,
                "topic": r.topic,
                "paper_count": int(r.paper_count),
                "total_citations": int(r.total_citations or 0),
                "min_year": r.min_year,
                "max_year": r.max_year,
            }
            for r in result.fetchall()
        ]

    if query:
        exact_curated_match = any(
            normalize_facet_text(str(row["topic"])) == normalize_facet_text(query)
            for row in rows
        )
        should_offer_specific = (
            axis == SPECIFIC_AXIS
            or (not exact_curated_match and (" " in query or "-" in query or not rows))
        )
        if should_offer_specific:
            specific = await _specific_topic_option(db, query)
            if specific:
                rows = [specific, *rows]

    return rows[:limit]


@router.get("/timeline")
async def get_topic_timeline(
    topic: str = Query(..., min_length=1),
    axis: str | None = Query(None, pattern=AXIS_PATTERN),
    per_year: int = Query(3, ge=1, le=10),
    min_fwci: float = Query(2.0, ge=0.0, description="FWCI floor; null FWCI rows are still kept"),
    year_from: int | None = Query(None),
    year_to: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Major papers per year for a topic.
    Ranking: top-N citations per year, filtered to fwci >= min_fwci (null fwci allowed).
    """
    canonical_topic, matched_axes = canonicalize_facet_query(topic)
    axes = _axis_filter(axis) if axis else (matched_axes or list(FACET_TYPES))
    params: dict[str, object] = {
        "topic": canonical_topic,
        "axes": axes,
        "per_year": per_year,
        "min_fwci": min_fwci,
    }

    year_clause = ""
    if year_from is not None:
        year_clause += " AND p.year >= :year_from"
        params["year_from"] = year_from
    if year_to is not None:
        year_clause += " AND p.year <= :year_to"
        params["year_to"] = year_to

    if axis == SPECIFIC_AXIS:
        specific_sql = f"""
        WITH search_query AS MATERIALIZED (
            SELECT websearch_to_tsquery('english', :query) AS tsq
        ),
        ranked AS (
            SELECT
                p.id, p.title, p.year, p.citations, p.fwci, p.doi, p.open_access, p.type,
                ROW_NUMBER() OVER (
                    PARTITION BY p.year
                    ORDER BY
                        ts_rank_cd({PAPER_SEARCH_VECTOR}, sq.tsq) DESC,
                        p.citations DESC NULLS LAST,
                        p.fwci DESC NULLS LAST,
                        p.id
                ) AS rn
            FROM papers p
            CROSS JOIN search_query sq
            WHERE {PAPER_SEARCH_VECTOR} @@ sq.tsq
              AND p.year IS NOT NULL
              AND (p.fwci IS NULL OR p.fwci >= :min_fwci)
              {year_clause}
              AND NOT EXISTS (
                  SELECT 1
                  FROM paper_quality_flags pqf
                  WHERE pqf.paper_id = p.id
                    AND pqf.severity = 'exclude'
              )
        )
        SELECT id, title, year, citations, fwci, doi, open_access, type
        FROM ranked
        WHERE rn <= :per_year
        ORDER BY year ASC, citations DESC NULLS LAST
        """
        result = await db.execute(
            text(specific_sql),
            {
                **params,
                "query": topic,
            },
        )
        return await _timeline_response(
            db,
            topic=topic,
            query=topic,
            matched_axes=[SPECIFIC_AXIS],
            per_year=per_year,
            min_fwci=min_fwci,
            papers=result.fetchall(),
        )

    resolved = await db.execute(
        text("""
        SELECT facet_type, facet_value
        FROM paper_facet_summary
        WHERE LOWER(facet_value) = LOWER(:facet_value)
          AND facet_type = ANY(:axes)
        ORDER BY paper_count DESC
        LIMIT 1
        """),
        {"facet_value": canonical_topic, "axes": axes},
    )
    resolved_row = resolved.first()
    if resolved_row:
        canonical_topic = resolved_row.facet_value
        if axis or not matched_axes:
            matched_axes = [resolved_row.facet_type]
            axes = matched_axes
            params["axes"] = axes
        params["topic"] = canonical_topic
    elif not matched_axes:
        result = await db.execute(
            text(f"""
            WITH search_query AS MATERIALIZED (
                SELECT websearch_to_tsquery('english', :query) AS tsq
            ),
            ranked AS (
                SELECT
                    p.id, p.title, p.year, p.citations, p.fwci, p.doi, p.open_access, p.type,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.year
                        ORDER BY
                            ts_rank_cd({PAPER_SEARCH_VECTOR}, sq.tsq) DESC,
                            p.citations DESC NULLS LAST,
                            p.fwci DESC NULLS LAST,
                            p.id
                    ) AS rn
                FROM papers p
                CROSS JOIN search_query sq
                WHERE {PAPER_SEARCH_VECTOR} @@ sq.tsq
                  AND p.year IS NOT NULL
                  AND (p.fwci IS NULL OR p.fwci >= :min_fwci)
                  {year_clause}
                  AND NOT EXISTS (
                      SELECT 1
                      FROM paper_quality_flags pqf
                      WHERE pqf.paper_id = p.id
                        AND pqf.severity = 'exclude'
                  )
            )
            SELECT id, title, year, citations, fwci, doi, open_access, type
            FROM ranked
            WHERE rn <= :per_year
            ORDER BY year ASC, citations DESC NULLS LAST
            """),
            {
                **params,
                "query": topic,
            },
        )
        return await _timeline_response(
            db,
            topic=topic,
            query=topic,
            matched_axes=[SPECIFIC_AXIS],
            per_year=per_year,
            min_fwci=min_fwci,
            papers=result.fetchall(),
        )

    sql = f"""
    WITH matched_papers AS MATERIALIZED (
        SELECT DISTINCT paper_id
        FROM paper_facets
        WHERE facet_value = :topic
          AND facet_type = ANY(:axes)
    ),
    ranked AS (
        SELECT
            p.id, p.title, p.year, p.citations, p.fwci, p.doi, p.open_access, p.type,
            ROW_NUMBER() OVER (
                PARTITION BY p.year
                ORDER BY p.citations DESC NULLS LAST, p.fwci DESC NULLS LAST, p.id
            ) AS rn
        FROM matched_papers mp
        JOIN papers p ON p.id = mp.paper_id
        WHERE p.year IS NOT NULL
          AND (p.fwci IS NULL OR p.fwci >= :min_fwci)
          {year_clause}
          AND NOT EXISTS (
              SELECT 1
              FROM paper_quality_flags pqf
              WHERE pqf.paper_id = p.id
                AND pqf.severity = 'exclude'
          )
    )
    SELECT id, title, year, citations, fwci, doi, open_access, type
    FROM ranked
    WHERE rn <= :per_year
    ORDER BY year ASC, citations DESC NULLS LAST
    """

    result = await db.execute(text(sql), params)
    return await _timeline_response(
        db,
        topic=canonical_topic,
        query=topic,
        matched_axes=matched_axes,
        per_year=per_year,
        min_fwci=min_fwci,
        papers=result.fetchall(),
    )
