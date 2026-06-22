import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { CSSProperties } from "react";
import { FIELD_COLORS, getFieldColor } from "../data/researchers";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const PAGE_SIZE = 20;

type LeaderboardType = "country" | "institution" | "researcher" | "author";

interface LeaderboardEntry {
  rank: number;
  key: string;
  name: string;
  researcher_count?: number;
  contributions?: number;
  papers?: number;
  total_citations?: number;
  avg_h_index?: number;
  institution?: string;
  country?: string;
  field?: string;
  citations?: number;
  h_index?: number;
  works_count?: number;
  recent_contributions?: number;
  hotness_score?: number;
  min_year?: number;
  max_year?: number;
}

interface LeaderboardData {
  type: string;
  field: string | null;
  entries: LeaderboardEntry[];
}

const FIELD_OPTIONS = ["", ...Object.keys(FIELD_COLORS)];

function fmtNum(n: number | undefined): string {
  const value = n ?? 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function typeLabel(type: LeaderboardType) {
  if (type === "country") return "Countries";
  if (type === "institution") return "Institutions";
  if (type === "author") return "Hot authors";
  return "Researchers";
}

function scoreFor(entry: LeaderboardEntry, type: LeaderboardType) {
  if (type === "author") return entry.hotness_score ?? entry.citations ?? 0;
  if (type === "researcher") return entry.citations ?? 0;
  return entry.total_citations ?? 0;
}

export function LeaderboardPage() {
  const [searchParams] = useSearchParams();
  const [type, setType] = useState<LeaderboardType>("country");
  const [field, setField] = useState("");
  const [country, setCountry] = useState("");
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState("citations");
  const [yearStart, setYearStart] = useState(2017);
  const [yearEnd, setYearEnd] = useState(2026);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type,
        limit: String(PAGE_SIZE + 1),
        offset: String(page * PAGE_SIZE),
      });
      if (field && type !== "author") params.set("field", field);
      if (type === "author") {
        if (country) params.set("country", country.toUpperCase());
        if (topic) params.set("topic", topic);
        params.set("sort", sort);
        params.set("year_start", String(Math.min(yearStart, yearEnd)));
        params.set("year_end", String(Math.max(yearStart, yearEnd)));
      }
      const res = await fetch(`${API_BASE}/leaderboard?${params}`);
      setData(await res.json());
    } catch (e) {
      console.error("Failed to fetch leaderboard:", e);
      setData({ type, field: field || null, entries: [] });
    } finally {
      setLoading(false);
    }
  }, [type, field, country, topic, sort, yearStart, yearEnd, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setPage(0);
  }, [type, field, country, topic, sort, yearStart, yearEnd]);

  useEffect(() => {
    const typeParam = searchParams.get("type");
    const fieldParam = searchParams.get("field");
    const countryParam = searchParams.get("country");
    const topicParam = searchParams.get("topic");
    const sortParam = searchParams.get("sort");
    const yearStartParam = searchParams.get("year_start");
    const yearEndParam = searchParams.get("year_end");
    if (typeParam === "country" || typeParam === "institution" || typeParam === "researcher" || typeParam === "author") {
      setType(typeParam);
    }
    setField(fieldParam ?? "");
    setCountry(countryParam ?? "");
    setTopic(topicParam ?? "");
    setSort(sortParam ?? "citations");
    if (yearStartParam) setYearStart(Number(yearStartParam));
    if (yearEndParam) setYearEnd(Number(yearEndParam));
  }, [searchParams]);

  const rawEntries = data?.entries ?? [];
  const hasNext = rawEntries.length > PAGE_SIZE;
  const entries = rawEntries.slice(0, PAGE_SIZE);
  const maxScore = Math.max(...entries.map(e => scoreFor(e, type)), 1);

  const handleRowClick = (entry: LeaderboardEntry) => {
    if (type === "researcher" || type === "author") {
      navigate(`/researcher/${entry.key}`);
    } else if (type === "institution") {
      navigate(`/institutions/${encodeURIComponent(entry.name || entry.key)}`);
    } else {
      navigate(`/progress?type=country&entity=${encodeURIComponent(entry.key || entry.name)}`);
    }
  };

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <div style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Publication-time ranking</div>
            <h1 style={titleStyle}>{typeLabel(type)} Leaderboard</h1>
            <p style={subtitleStyle}>
              Ranked from quality-filtered paper, affiliation, and citation summaries.
            </p>
          </div>
          <div style={heroStatStyle}>
            <strong>{page * PAGE_SIZE + 1}-{page * PAGE_SIZE + entries.length}</strong>
            <span>rank range</span>
          </div>
        </div>

        <div style={controlBarStyle}>
          <div style={segmentedStyle}>
            {(["country", "institution", "researcher", "author"] as const).map(option => (
              <button
                key={option}
                onClick={() => setType(option)}
                style={type === option ? segmentActiveStyle : segmentStyle}
              >
                {typeLabel(option)}
              </button>
            ))}
          </div>

          {type !== "author" && (
            <label style={filterLabelStyle}>
              Field
              <select value={field} onChange={e => setField(e.target.value)} style={selectStyle}>
                <option value="">All fields</option>
                {FIELD_OPTIONS.filter(Boolean).map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          )}

          {type === "author" && (
            <div style={authorFiltersStyle}>
              <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} placeholder="Country" maxLength={2} style={smallInputStyle} />
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic e.g. diffusion" style={{ ...smallInputStyle, width: 170 }} />
              <select value={sort} onChange={e => setSort(e.target.value)} style={selectStyle}>
                <option value="citations">Citations</option>
                <option value="hotness">Hotness</option>
                <option value="contributions">Contributions</option>
                <option value="papers">Papers</option>
              </select>
              <label style={rangeLabelStyle}>
                <span>{Math.min(yearStart, yearEnd)}-{Math.max(yearStart, yearEnd)}</span>
                <input type="range" min={2017} max={2026} value={yearStart} onChange={e => setYearStart(Number(e.target.value))} />
                <input type="range" min={2017} max={2026} value={yearEnd} onChange={e => setYearEnd(Number(e.target.value))} />
              </label>
            </div>
          )}
        </div>

        <section style={tableCardStyle}>
          <div style={tableHeaderStyle}>
            <span>Rank</span>
            <span>{type === "author" ? "Author" : typeLabel(type).replace("Hot ", "")}</span>
            <span>{type === "researcher" || type === "author" ? "Institution" : "Papers"}</span>
            <span>{type === "country" || type === "institution" ? "Contributions" : "Citations"}</span>
            <span>Score</span>
          </div>

          {loading && <div style={emptyStyle}>Loading leaderboard...</div>}
          {!loading && entries.length === 0 && <div style={emptyStyle}>No leaderboard rows for this filter.</div>}

          {!loading && entries.map(entry => {
            const score = scoreFor(entry, type);
            const barPct = Math.min(100, (score / maxScore) * 100);
            const accent = entry.rank === 1 ? "#ca8a04" : entry.rank === 2 ? "#64748b" : entry.rank === 3 ? "#b45309" : "#2563eb";
            const fieldColor = getFieldColor(entry.field ?? null);
            return (
              <button key={`${entry.rank}-${entry.key}`} onClick={() => handleRowClick(entry)} style={rowStyle}>
                <span style={{ ...rankStyle, color: accent }}>#{entry.rank}</span>
                <span style={nameCellStyle}>
                  {type === "researcher" && <span style={{ ...fieldDotStyle, background: fieldColor }} />}
                  <strong>{entry.name}</strong>
                  {entry.field && <small>{entry.field}</small>}
                  {entry.country && <small>{entry.country}</small>}
                </span>
                <span style={mutedCellStyle}>
                  {type === "researcher" || type === "author"
                    ? entry.institution ?? "Unknown"
                    : fmtNum(entry.papers)}
                </span>
                <span style={numericCellStyle}>
                  {type === "country" || type === "institution"
                    ? fmtNum(entry.contributions ?? entry.researcher_count)
                    : fmtNum(entry.citations)}
                </span>
                <span style={scoreCellStyle}>
                  <span style={scoreBarTrackStyle}>
                    <span style={{ ...scoreBarStyle, width: `${barPct}%`, background: accent }} />
                  </span>
                  <span style={scoreValueStyle}>{fmtNum(score)}</span>
                </span>
              </button>
            );
          })}
        </section>

        <PaginationBar
          page={page}
          pageSize={PAGE_SIZE}
          shown={entries.length}
          hasNext={hasNext}
          loading={loading}
          onPrev={() => setPage(prev => Math.max(0, prev - 1))}
          onNext={() => setPage(prev => prev + 1)}
        />
      </section>
    </main>
  );
}

function PaginationBar({
  page,
  pageSize,
  shown,
  hasNext,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  pageSize: number;
  shown: number;
  hasNext: boolean;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div style={paginationStyle}>
      <span style={paginationTextStyle}>
        Showing ranks {shown > 0 ? `${page * pageSize + 1}-${page * pageSize + shown}` : "0"}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onPrev} disabled={page === 0 || loading} style={page === 0 || loading ? disabledPageButtonStyle : pageButtonStyle}>
          Previous
        </button>
        <button onClick={onNext} disabled={!hasNext || loading} style={!hasNext || loading ? disabledPageButtonStyle : pageButtonStyle}>
          Next
        </button>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  position: "absolute",
  top: 52,
  left: 0,
  right: 0,
  bottom: 0,
  overflowY: "auto",
  background: "#f8fafc",
  color: "#0f172a",
  fontFamily: UI_FONT,
  padding: "32px 24px 48px",
};
const shellStyle: CSSProperties = { maxWidth: 1180, margin: "0 auto" };
const heroStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 24 };
const eyebrowStyle: CSSProperties = { color: "#2563eb", fontSize: 13, fontWeight: 760, textTransform: "uppercase" };
const titleStyle: CSSProperties = { fontSize: 38, lineHeight: 1.05, margin: "8px 0 10px", letterSpacing: 0 };
const subtitleStyle: CSSProperties = { color: "#64748b", fontSize: 16, margin: 0 };
const heroStatStyle: CSSProperties = {
  alignSelf: "flex-start",
  minWidth: 132,
  border: "1px solid #dbe3ee",
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  display: "grid",
  gap: 4,
};
const controlBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
  padding: 14,
  border: "1px solid #dbe3ee",
  background: "#fff",
  borderRadius: 16,
  marginBottom: 18,
};
const segmentedStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4, padding: 4, background: "#f1f5f9", borderRadius: 12 };
const segmentStyle: CSSProperties = {
  border: "none",
  borderRadius: 9,
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 720,
  padding: "8px 11px",
};
const segmentActiveStyle: CSSProperties = { ...segmentStyle, background: "#fff", color: "#0f172a", boxShadow: "0 1px 4px rgba(15, 23, 42, 0.12)" };
const filterLabelStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13, fontWeight: 720 };
const selectStyle: CSSProperties = {
  border: "1px solid #dbe3ee",
  borderRadius: 10,
  background: "#fff",
  color: "#0f172a",
  fontFamily: UI_FONT,
  fontSize: 13,
  outline: "none",
  padding: "8px 10px",
};
const authorFiltersStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 };
const smallInputStyle: CSSProperties = {
  width: 92,
  border: "1px solid #dbe3ee",
  borderRadius: 10,
  background: "#fff",
  color: "#0f172a",
  fontFamily: UI_FONT,
  fontSize: 13,
  outline: "none",
  padding: "8px 10px",
};
const rangeLabelStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 13, fontWeight: 720 };
const tableCardStyle: CSSProperties = { border: "1px solid #dbe3ee", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)" };
const tableHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "80px minmax(240px, 1.5fr) minmax(150px, 1fr) 130px minmax(180px, 1fr)",
  gap: 14,
  padding: "13px 18px",
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
};
const rowStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "80px minmax(240px, 1.5fr) minmax(150px, 1fr) 130px minmax(180px, 1fr)",
  gap: 14,
  alignItems: "center",
  border: "none",
  borderBottom: "1px solid #eef2f7",
  background: "#fff",
  cursor: "pointer",
  fontFamily: UI_FONT,
  padding: "14px 18px",
  textAlign: "left",
};
const rankStyle: CSSProperties = { fontSize: 15, fontWeight: 850 };
const nameCellStyle: CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", gap: 3, color: "#0f172a", fontSize: 15 };
const mutedCellStyle: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#64748b", fontSize: 13 };
const numericCellStyle: CSSProperties = { color: "#0f172a", fontSize: 14, fontWeight: 760 };
const scoreCellStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 58px", gap: 10, alignItems: "center" };
const scoreBarTrackStyle: CSSProperties = { height: 8, borderRadius: 999, background: "#eef2f7", overflow: "hidden" };
const scoreBarStyle: CSSProperties = { display: "block", height: "100%", borderRadius: 999 };
const scoreValueStyle: CSSProperties = { color: "#64748b", fontSize: 13, fontWeight: 720, textAlign: "right" };
const fieldDotStyle: CSSProperties = { width: 8, height: 8, borderRadius: 999, display: "inline-block" };
const emptyStyle: CSSProperties = { padding: 42, textAlign: "center", color: "#64748b", fontSize: 15 };
const paginationStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 14,
};
const paginationTextStyle: CSSProperties = { color: "#64748b", fontSize: 13, fontWeight: 700 };
const pageButtonStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 14,
  fontWeight: 760,
  padding: "9px 13px",
};
const disabledPageButtonStyle: CSSProperties = {
  ...pageButtonStyle,
  color: "#94a3b8",
  cursor: "not-allowed",
  opacity: 0.6,
};
