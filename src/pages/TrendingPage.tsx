import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { CSSProperties } from "react";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const PAGE_SIZE = 20;

interface TrendingTopic {
  rank: number;
  topic_id: string;
  topic_name: string;
  paper_count: number;
  contributions: number;
  researcher_count: number;
  total_citations: number;
  dominant_axis: string;
  growth_pct: number;
  emoji: string;
}

type TrendingAxis = "aboutness" | "method" | "task" | "application";

const AXIS_OPTIONS: { key: TrendingAxis; label: string; helper: string }[] = [
  { key: "aboutness", label: "Fields", helper: "large research areas" },
  { key: "method", label: "Methods", helper: "models and techniques" },
  { key: "task", label: "Tasks", helper: "research problems" },
  { key: "application", label: "Applications", helper: "deployment domains" },
];

function fmtNum(n: number | undefined): string {
  const value = n ?? 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function growthTone(pct: number) {
  if (pct >= 50) return "#16a34a";
  if (pct >= 20) return "#2563eb";
  if (pct >= 0) return "#64748b";
  return "#dc2626";
}

export function TrendingPage() {
  const [searchParams] = useSearchParams();
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [axis, setAxis] = useState<TrendingAxis>("aboutness");
  const [page, setPage] = useState(0);
  const navigate = useNavigate();

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        axis,
        limit: String(PAGE_SIZE + 1),
        offset: String(page * PAGE_SIZE),
      });
      const res = await fetch(`${API_BASE}/trending?${params}`);
      setTopics(await res.json());
      setLastRefresh(Date.now());
    } catch (e) {
      console.error("Failed to fetch trending:", e);
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [axis, page]);

  useEffect(() => {
    fetchTrending();
    const interval = setInterval(fetchTrending, 30_000);
    return () => clearInterval(interval);
  }, [fetchTrending]);

  useEffect(() => {
    const axisParam = searchParams.get("axis");
    if (axisParam === "aboutness" || axisParam === "method" || axisParam === "task" || axisParam === "application") {
      setAxis(axisParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setPage(0);
  }, [axis]);

  const visibleTopics = topics.slice(0, PAGE_SIZE);
  const hasNext = topics.length > PAGE_SIZE;
  const maxPapers = Math.max(...visibleTopics.map(t => t.paper_count), 1);
  const currentAxis = AXIS_OPTIONS.find(option => option.key === axis) ?? AXIS_OPTIONS[0];

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <div style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Recent paper growth</div>
            <h1 style={titleStyle}>Trending Research</h1>
            <p style={subtitleStyle}>
              Growth is calculated from quality-filtered paper facets, not random UI estimates.
            </p>
          </div>
          <div style={refreshStyle}>
            <span>Last updated</span>
            <strong>{new Date(lastRefresh).toLocaleTimeString()}</strong>
          </div>
        </div>

        <div style={axisGridStyle}>
          {AXIS_OPTIONS.map(option => (
            <button
              key={option.key}
              onClick={() => setAxis(option.key)}
              style={axis === option.key ? axisButtonActiveStyle : axisButtonStyle}
            >
              <strong>{option.label}</strong>
              <span>{option.helper}</span>
            </button>
          ))}
        </div>

        <section style={contentCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>{currentAxis.label}</h2>
              <p style={sectionSubtitleStyle}>Top facets by recent growth and paper volume.</p>
            </div>
            <span style={countPillStyle}>
              ranks {visibleTopics.length ? `${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + visibleTopics.length}` : "0"}
            </span>
          </div>

          <div style={tableHeaderStyle}>
            <span>Rank</span>
            <span>Topic</span>
            <span>Papers</span>
            <span>Citations</span>
            <span>Growth</span>
          </div>

          {loading && <div style={emptyStyle}>Loading trending topics...</div>}
          {!loading && visibleTopics.length === 0 && <div style={emptyStyle}>No trending rows for this axis.</div>}

          {!loading && visibleTopics.map(topic => {
            const paperPct = Math.min(100, (topic.paper_count / maxPapers) * 100);
            const tone = growthTone(topic.growth_pct);
            return (
              <button
                key={topic.topic_id}
                onClick={() => navigate(`/papers?topic=${encodeURIComponent(topic.topic_name)}`)}
                style={rowStyle}
              >
                <span style={rankStyle}>#{topic.rank}</span>
                <span style={topicCellStyle}>
                  <span style={emojiStyle}>{topic.emoji}</span>
                  <span>
                    <strong>{topic.topic_name}</strong>
                    <small>{topic.dominant_axis}</small>
                  </span>
                </span>
                <span style={metricCellStyle}>
                  <strong>{fmtNum(topic.paper_count)}</strong>
                  <span style={barTrackStyle}><span style={{ ...barStyle, width: `${paperPct}%` }} /></span>
                </span>
                <span style={numberCellStyle}>{fmtNum(topic.total_citations)}</span>
                <span style={growthCellStyle}>
                  <span style={{ ...growthPillStyle, color: tone, background: `${tone}12` }}>
                    {topic.growth_pct >= 0 ? "+" : ""}{topic.growth_pct}%
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        <PaginationBar
          page={page}
          pageSize={PAGE_SIZE}
          shown={visibleTopics.length}
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
const refreshStyle: CSSProperties = {
  alignSelf: "flex-start",
  border: "1px solid #dbe3ee",
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  display: "grid",
  gap: 4,
  minWidth: 150,
};
const axisGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 };
const axisButtonStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#dbe3ee",
  borderRadius: 16,
  background: "#fff",
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  padding: 16,
  textAlign: "left",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
};
const axisButtonActiveStyle: CSSProperties = { ...axisButtonStyle, borderColor: "#2563eb", boxShadow: "0 14px 34px rgba(37, 99, 235, 0.13)" };
const contentCardStyle: CSSProperties = { border: "1px solid #dbe3ee", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)" };
const sectionHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 18, padding: "18px 20px", borderBottom: "1px solid #eef2f7" };
const sectionTitleStyle: CSSProperties = { fontSize: 20, margin: 0 };
const sectionSubtitleStyle: CSSProperties = { color: "#64748b", fontSize: 13, margin: "4px 0 0" };
const countPillStyle: CSSProperties = { alignSelf: "center", border: "1px solid #dbe3ee", borderRadius: 999, color: "#64748b", fontSize: 13, fontWeight: 760, padding: "7px 10px" };
const tableHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "78px minmax(260px, 1.5fr) 180px 140px 130px",
  gap: 14,
  padding: "12px 20px",
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
  gridTemplateColumns: "78px minmax(260px, 1.5fr) 180px 140px 130px",
  gap: 14,
  alignItems: "center",
  border: "none",
  borderBottom: "1px solid #eef2f7",
  background: "#fff",
  cursor: "pointer",
  fontFamily: UI_FONT,
  padding: "14px 20px",
  textAlign: "left",
};
const rankStyle: CSSProperties = { color: "#2563eb", fontSize: 15, fontWeight: 850 };
const topicCellStyle: CSSProperties = { display: "grid", gridTemplateColumns: "34px 1fr", gap: 10, alignItems: "center", minWidth: 0 };
const emojiStyle: CSSProperties = { width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 10, background: "#f1f5f9", fontSize: 18 };
const metricCellStyle: CSSProperties = { display: "grid", gap: 6, color: "#0f172a", fontSize: 14 };
const numberCellStyle: CSSProperties = { color: "#475569", fontSize: 14, fontWeight: 740 };
const growthCellStyle: CSSProperties = { display: "flex", justifyContent: "flex-start" };
const growthPillStyle: CSSProperties = { borderRadius: 999, fontSize: 13, fontWeight: 820, padding: "6px 9px" };
const barTrackStyle: CSSProperties = { height: 7, borderRadius: 999, background: "#eef2f7", overflow: "hidden" };
const barStyle: CSSProperties = { display: "block", height: "100%", background: "#2563eb", borderRadius: 999 };
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
