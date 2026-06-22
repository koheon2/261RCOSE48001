"""Universal search endpoint — parse intent and return routing info."""

import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.db.database import get_db
from app.models.researcher import Researcher
from app.services.query_parser import parse_query
from app.services.paper_facets import canonicalize_facet_query

router = APIRouter(prefix="/search", tags=["search"])

COUNTRY_QUERY_ALIASES = {
    "한국": "KR",
    "대한민국": "KR",
    "korea": "KR",
    "south korea": "KR",
    "미국": "US",
    "usa": "US",
    "us": "US",
    "united states": "US",
    "중국": "CN",
    "china": "CN",
    "일본": "JP",
    "japan": "JP",
}

TOPIC_QUERY_ALIASES = {
    "디퓨전": "diffusion",
    "diffusion": "diffusion",
    "확산모델": "diffusion",
    "확산 모델": "diffusion",
    "트랜스포머": "transformer",
    "transformer": "transformer",
    "llm": "LLM",
    "대규모 언어 모델": "LLM",
    "rag": "RAG",
    "검색증강": "RAG",
}

TREND_QUERY_TERMS = ("추이", "흐름", "성장", "변화", "트렌드", "trend", "progress", "growth")
AUTHOR_RANKING_TERMS = ("연구자", "researcher", "researchers", "author", "authors")
HOT_QUERY_TERMS = ("핫", "뜨는", "최근", "hot", "rising", "trending", "recent")
TOP_QUERY_TERMS = ("상위", "순위", "랭킹", "top", "leaderboard", "ranking")
INSTITUTION_PROFILE_TERMS = (
    "학교",
    "기관",
    "대학",
    "강한",
    "분야",
    "실적",
    "대표 논문",
    "프로필",
    "university",
    "institution",
    "profile",
    "strength",
    "strong",
    "papers",
)

INSTITUTION_QUERY_ALIASES = {
    "kaist": "KAIST",
    "카이스트": "KAIST",
    "korea advanced institute of science and technology": "KAIST",
    "고려대": "Korea University",
    "고려대학교": "Korea University",
    "korea university": "Korea University",
    "snu": "SNU",
    "서울대": "SNU",
    "서울대학교": "SNU",
    "seoul national university": "SNU",
    "mit": "MIT",
    "massachusetts institute of technology": "MIT",
    "stanford": "Stanford",
    "stanford university": "Stanford",
    "cmu": "Carnegie Mellon University",
    "carnegie mellon": "Carnegie Mellon University",
    "carnegie mellon university": "Carnegie Mellon University",
    "berkeley": "University of California, Berkeley",
    "uc berkeley": "University of California, Berkeley",
    "tsinghua": "Tsinghua University",
    "칭화": "Tsinghua University",
    "칭화대": "Tsinghua University",
    "oxford": "University of Oxford",
    "cambridge": "University of Cambridge",
}

COUNT_QUERY_TERMS = ("수", "몇", "몇 명", "몇 개", "how many", "count")
PAPER_QUERY_TERMS = ("논문", "paper", "papers")
PAPER_SEARCH_TERMS = ("검색", "찾아", "찾아줘", "search")
LINEAGE_QUERY_TERMS = ("계보", "lineage", "citation graph", "인용 그래프")
COMPARE_QUERY_TERMS = (" vs ", "비교", "compare", "versus", "와 ", "과 ")


async def _topic_paper_count(db: AsyncSession, topic: str) -> tuple[str, int]:
    canonical, matched_axes = canonicalize_facet_query(topic)
    result = await db.execute(
        text("""
        SELECT COALESCE(SUM(paper_count), 0) AS paper_count
        FROM paper_facet_summary
        WHERE lower(facet_value) = lower(:facet_value)
          AND (:use_axes = false OR facet_type = ANY(:axes))
        """),
        {
            "facet_value": canonical,
            "use_axes": bool(matched_axes),
            "axes": matched_axes or ["aboutness", "method", "task", "application"],
        },
    )
    return canonical, int(result.scalar_one() or 0)


def _parse_country_topic_trend(q: str) -> dict[str, str] | None:
    normalized = q.strip().lower()
    if not any(term in normalized for term in TREND_QUERY_TERMS):
        return None

    countries: list[str] = []
    for alias, code in COUNTRY_QUERY_ALIASES.items():
        if alias.isascii():
            matched = re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized) is not None
        else:
            matched = alias in normalized
        if matched and code not in countries:
            countries.append(code)

    topic = None
    for alias, canonical in TOPIC_QUERY_ALIASES.items():
        if alias.isascii():
            matched = re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized) is not None
        else:
            matched = alias in normalized
        if matched:
            topic = canonical
            break

    if len(countries) >= 2 and topic:
        return {
            "type": "country",
            "entities": ",".join(countries[:3]),
            "topic": topic,
        }
    if len(countries) == 1 and topic:
        return {
            "type": "country",
            "entity": countries[0],
            "topic": topic,
        }
    return None


def _find_country_codes(normalized: str) -> list[str]:
    countries: list[str] = []
    for alias, code in COUNTRY_QUERY_ALIASES.items():
        if alias.isascii():
            matched = re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized) is not None
        else:
            matched = alias in normalized
        if matched and code not in countries:
            countries.append(code)
    return countries


def _find_topic(normalized: str) -> str | None:
    for alias, canonical in TOPIC_QUERY_ALIASES.items():
        if alias.isascii():
            matched = re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized) is not None
        else:
            matched = alias in normalized
        if matched:
            return canonical
    return None


def _parse_author_leaderboard(q: str) -> dict[str, str] | None:
    normalized = q.strip().lower()
    if not any(term in normalized for term in AUTHOR_RANKING_TERMS):
        return None

    countries = _find_country_codes(normalized)
    topic = _find_topic(normalized)
    has_ranking_modifier = any(term in normalized for term in (*HOT_QUERY_TERMS, *TOP_QUERY_TERMS))
    if not has_ranking_modifier and not countries and not topic:
        return None

    params = {
        "type": "author",
        "sort": "hotness" if any(term in normalized for term in HOT_QUERY_TERMS) else "citations",
    }
    if countries:
        params["country"] = countries[0]
    if topic:
        params["topic"] = topic
    if any(term in normalized for term in HOT_QUERY_TERMS):
        params["year_start"] = "2024"
        params["year_end"] = "2026"
    return params


def _parse_institution_profile(q: str) -> str | None:
    normalized = q.strip().lower()
    if not normalized:
        return None

    matched_institution = None
    for alias, canonical in INSTITUTION_QUERY_ALIASES.items():
        if alias.isascii():
            matched = re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized) is not None
        else:
            matched = alias in normalized
        if matched:
            matched_institution = canonical
            break

    if not matched_institution:
        return None

    if any(term in normalized for term in INSTITUTION_PROFILE_TERMS):
        return matched_institution

    # Very short direct institution queries should also open the profile.
    if normalized in INSTITUTION_QUERY_ALIASES:
        return matched_institution

    return None


def _find_institutions(normalized: str) -> list[str]:
    institutions: list[str] = []
    for alias, canonical in INSTITUTION_QUERY_ALIASES.items():
        if alias.isascii():
            matched = re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized) is not None
        else:
            matched = alias in normalized
        if matched and canonical not in institutions:
            institutions.append(canonical)
    return institutions


def _parse_institution_comparison(q: str) -> dict[str, str] | None:
    normalized = f" {q.strip().lower()} "
    if not any(term in normalized for term in COMPARE_QUERY_TERMS):
        return None
    institutions = _find_institutions(normalized)
    if len(institutions) >= 2:
        return {
            "comparison_type": "institution",
            "entities": ",".join(institutions[:3]),
        }
    return None


def _parse_lineage(q: str) -> dict[str, str] | None:
    normalized = q.strip().lower()
    if not any(term in normalized for term in LINEAGE_QUERY_TERMS):
        return None
    topic = _find_topic(normalized)
    if topic:
        canonical, matched_axes = canonicalize_facet_query(topic)
        params = {"topic": canonical, "seed_limit": "8", "ancestor_limit": "20"}
        if matched_axes:
            params["axis"] = matched_axes[0]
        return params
    return None


def _strip_paper_query_terms(q: str) -> str:
    cleaned = q.strip()
    for term in ("논문 검색", "논문 찾아줘", "논문 찾아", "검색", "찾아줘", "찾아", "paper search", "papers", "paper", "논문"):
        cleaned = re.sub(re.escape(term), " ", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _parse_paper_route(q: str) -> dict[str, str] | None:
    normalized = q.strip().lower()
    if "attention is all you need" in normalized or "all you need is attention" in normalized:
        return {"search": "Attention is all you need"}

    has_paper_term = any(term in normalized for term in PAPER_QUERY_TERMS)
    if not has_paper_term:
        return None

    topic = _find_topic(normalized)
    wants_representative = any(
        term in normalized
        for term in ("대표", "핵심", "중요", "주요", "기반", "seminal", "representative", "core", "key")
    )
    wants_search = any(term in normalized for term in PAPER_SEARCH_TERMS)

    if topic and wants_representative:
        canonical, matched_axes = canonicalize_facet_query(topic)
        params = {"topic": canonical}
        if matched_axes:
            params["axis"] = matched_axes[0]
        return params

    if wants_search:
        query = _strip_paper_query_terms(q)
        if query:
            return {"search": query}
        return {}

    return None


def _parse_simple_stats(q: str) -> dict[str, str] | None:
    normalized = q.strip().lower()
    if not any(term in normalized for term in COUNT_QUERY_TERMS):
        return None

    countries = _find_country_codes(normalized)
    topic = _find_topic(normalized)
    has_researcher = any(term in normalized for term in AUTHOR_RANKING_TERMS)
    has_paper = any(term in normalized for term in PAPER_QUERY_TERMS)

    if countries and has_researcher:
        return {"kind": "country_researchers", "country": countries[0]}
    if topic and has_paper:
        return {"kind": "topic_papers", "topic": topic}
    return None


def _parse_country_strength(q: str) -> dict[str, str] | None:
    normalized = q.strip().lower()
    countries = _find_country_codes(normalized)
    has_institution = bool(_find_institutions(normalized))
    if countries and not has_institution and "강한" in normalized and "분야" in normalized:
        return {"country": countries[0]}
    return None


@router.get("/universal")
async def universal_search(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    """
    Parse a natural language query and return:
    - intent: researcher_search | topic_map | benchmark | stats
    - params: structured params for the destination page
    - explanation: human-readable (same language as query)
    - answer: direct answer for stats queries
    """
    normalized_q = q.strip().lower()
    institution_comparison = _parse_institution_comparison(q)
    if institution_comparison:
        return {
            "intent": "comparison",
            "params": institution_comparison,
            "explanation": "기관별 publication-time 연구 성과를 비교합니다.",
            "redirect": None,
            "answer": None,
            "answer_label": None,
        }

    simple_stats = _parse_simple_stats(q)
    if simple_stats:
        if simple_stats["kind"] == "country_researchers":
            count = await db.scalar(
                select(func.count()).select_from(Researcher).where(Researcher.country == simple_stats["country"])
            ) or 0
            return {
                "intent": "stats",
                "params": {},
                "explanation": f"{simple_stats['country']} 연구자 수를 조회합니다.",
                "redirect": None,
                "answer": int(count),
                "answer_label": f"{simple_stats['country']} 연구자",
            }
        if simple_stats["kind"] == "topic_papers":
            canonical, count = await _topic_paper_count(db, simple_stats["topic"])
            return {
                "intent": "stats",
                "params": {},
                "explanation": f"{canonical} 관련 논문 수를 조회합니다.",
                "redirect": None,
                "answer": count,
                "answer_label": f"'{canonical}' 관련 논문",
            }

    lineage_params = _parse_lineage(q)
    if lineage_params:
        return {
            "intent": "topic_map",
            "params": lineage_params,
            "explanation": f"{lineage_params['topic']} 연구 계보 그래프로 이동합니다.",
            "redirect": "/lineage",
            "answer": None,
            "answer_label": None,
        }

    paper_params = _parse_paper_route(q)
    if paper_params is not None:
        return {
            "intent": "topic_map",
            "params": paper_params,
            "explanation": "논문 탐색 페이지로 이동합니다.",
            "redirect": "/papers",
            "answer": None,
            "answer_label": None,
        }

    country_strength = _parse_country_strength(q)
    if country_strength:
        return {
            "intent": "trending",
            "params": country_strength,
            "explanation": "국가별 강점 분야 전용 분석은 아직 준비 중이라, 우선 연구 분야 트렌딩 화면으로 이동합니다.",
            "redirect": "/trending",
            "answer": None,
            "answer_label": None,
        }

    institution_profile = _parse_institution_profile(q)
    if institution_profile:
        return {
            "intent": "institution_profile",
            "params": {"name": institution_profile},
            "explanation": f"{institution_profile}의 publication-time 기준 강한 분야, 핵심 연구자, 대표 논문을 보여드립니다.",
            "redirect": f"/institutions/{institution_profile}",
            "answer": None,
            "answer_label": None,
        }

    author_leaderboard = _parse_author_leaderboard(q)
    if author_leaderboard:
        return {
            "intent": "leaderboard",
            "params": author_leaderboard,
            "explanation": "publication-time 논문 데이터 기준 연구자 순위를 보여드립니다.",
            "redirect": "/leaderboard",
            "answer": None,
            "answer_label": None,
        }

    country_topic_trend = _parse_country_topic_trend(q)
    if country_topic_trend:
        return {
            "intent": "progress",
            "params": country_topic_trend,
            "explanation": "국가별 세부 토픽 논문 추이를 비교합니다.",
            "redirect": "/progress",
            "answer": None,
            "answer_label": None,
        }

    if normalized_q.endswith(" papers"):
        topic = q.strip()[:-len(" papers")].strip()
        if topic:
            canonical, count = await _topic_paper_count(db, topic)
            return {
                "intent": "stats",
                "params": {},
                "explanation": f"{canonical} 관련 논문 수를 조회합니다.",
                "redirect": None,
                "answer": count,
                "answer_label": f"'{canonical}' 관련 논문",
            }

    parsed = await parse_query(q)
    intent = parsed.get("intent", "topic_map")

    # ── Comparison: return type + entities for frontend to fetch ────────────
    if intent == "comparison":
        return {
            "intent": "comparison",
            "params": {
                "comparison_type": parsed.get("comparison_type", "country"),
                "entities": ",".join(parsed.get("entities", [])),
            },
            "explanation": parsed.get("explanation", ""),
            "redirect": None,
            "answer": None,
        }

    # ── Stats: return count directly, no navigation ──────────────────────────
    if intent == "stats":
        field   = parsed.get("field")
        country = parsed.get("country")
        topic   = parsed.get("topic")

        count: int | None = None

        if field or country:
            # Count from our DB
            stmt = select(func.count()).select_from(Researcher)
            if field:
                stmt = stmt.where(Researcher.field == field)
            if country:
                stmt = stmt.where(Researcher.country == country)
            count = await db.scalar(stmt) or 0

        elif topic:
            canonical, count = await _topic_paper_count(db, topic)

        return {
            "intent": "stats",
            "params": {},
            "explanation": parsed.get("explanation", ""),
            "redirect": None,
            "answer": count,
            "answer_label": (
                f"{field} 분야 연구자" if field else
                f"{country} 연구자" if country else
                f"'{topic}' 관련 논문"
            ),
        }

    # ── Trending ───────────────────────────────────────────────────────────────
    if intent == "trending":
        return {
            "intent": "trending",
            "params": {},
            "explanation": parsed.get("explanation", ""),
            "redirect": "/trending",
            "answer": None,
            "answer_label": None,
        }

    # ── Progress ──────────────────────────────────────────────────────────────
    if intent == "progress":
        progress_params = {
            "type": parsed.get("progress_type", "country"),
            "entity": parsed.get("entity", ""),
        }
        if parsed.get("entities"):
            progress_params["entities"] = ",".join(parsed.get("entities", [])[:3])
            progress_params.pop("entity", None)
        if parsed.get("topic"):
            progress_params["topic"] = parsed.get("topic")
        return {
            "intent": "progress",
            "params": progress_params,
            "explanation": parsed.get("explanation", ""),
            "redirect": "/progress",
            "answer": None,
            "answer_label": None,
        }

    # ── Leaderboard ───────────────────────────────────────────────────────────
    if intent == "leaderboard":
        leaderboard_params = {"type": parsed.get("leaderboard_type", "country")}
        for key in ("country", "topic", "sort", "year_start", "year_end"):
            if parsed.get(key):
                leaderboard_params[key] = str(parsed.get(key))
        return {
            "intent": "leaderboard",
            "params": leaderboard_params,
            "explanation": parsed.get("explanation", ""),
            "redirect": "/leaderboard",
            "answer": None,
            "answer_label": None,
        }

    # ── Institution profile ──────────────────────────────────────────────────
    if intent == "institution_profile":
        name = parsed.get("institution") or parsed.get("name") or parsed.get("query")
        if name:
            return {
                "intent": "institution_profile",
                "params": {"name": str(name)},
                "explanation": parsed.get("explanation", ""),
                "redirect": f"/institutions/{name}",
                "answer": None,
                "answer_label": None,
            }

    # ── Researcher DNA ────────────────────────────────────────────────────────
    if intent == "researcher_dna":
        name = parsed.get("name", "")
        # Try to find researcher by name
        if name:
            stmt = (
                select(Researcher)
                .where(func.lower(Researcher.name).contains(name.lower()))
                .order_by(Researcher.citations.desc())
                .limit(1)
            )
            r = await db.execute(stmt)
            researcher = r.scalar_one_or_none()
            if researcher:
                return {
                    "intent": "researcher_dna",
                    "params": {"id": researcher.id},
                    "explanation": parsed.get("explanation", ""),
                    "redirect": f"/researcher/{researcher.id}",
                    "answer": None,
                    "answer_label": None,
                }
        return {
            "intent": "researcher_dna",
            "params": {"name": name},
            "explanation": parsed.get("explanation", "연구자를 찾을 수 없습니다."),
            "redirect": None,
            "answer": None,
            "answer_label": None,
        }

    # ── Researcher search → Globe ─────────────────────────────────────────────
    if intent == "researcher_search":
        params = {k: v for k, v in parsed.items()
                  if k in ("field", "country", "city", "institution", "topic", "sort") and v}
        return {
            "intent": intent,
            "params": params,
            "explanation": parsed.get("explanation", ""),
            "redirect": "/",
            "answer": None,
        }

    # ── Topic map ─────────────────────────────────────────────────────────────
    if intent == "topic_map":
        return {
            "intent": intent,
            "params": {"query": parsed.get("query", q)},
            "explanation": parsed.get("explanation", ""),
            "redirect": "/map",
            "answer": None,
        }

    # ── Benchmark ─────────────────────────────────────────────────────────────
    return {
        "intent": intent,
        "params": {"query": parsed.get("query", q)},
        "explanation": parsed.get("explanation", ""),
        "redirect": "/benchmarks",
        "answer": None,
    }
