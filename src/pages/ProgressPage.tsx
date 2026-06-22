import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CSSProperties } from "react";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const LINE_COLORS = ["#2563eb", "#16a34a", "#9333ea"];

const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸", KR: "🇰🇷", CN: "🇨🇳", JP: "🇯🇵", DE: "🇩🇪", GB: "🇬🇧",
  FR: "🇫🇷", CA: "🇨🇦", AU: "🇦🇺", IN: "🇮🇳", SG: "🇸🇬", CH: "🇨🇭",
  NL: "🇳🇱", SE: "🇸🇪", IL: "🇮🇱", BR: "🇧🇷", IT: "🇮🇹", TW: "🇹🇼",
};

interface TrendPoint {
  year: number;
  researcher_count: number;
  contributions?: number;
  avg_citations: number;
}

interface ProgressData {
  type: string;
  entity: string;
  topic?: string;
  matched_axis?: string | null;
  trend: TrendPoint[];
  current: { researcher_count: number; contributions?: number; avg_citations: number };
}

type ProgressType = "country" | "field";
type Metric = "researcher_count" | "avg_citations";

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function metricLabel(type: ProgressType, metric: Metric) {
  if (metric === "avg_citations") return "Avg citations";
  return type === "country" ? "Contributions" : "Papers";
}

export function ProgressPage() {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState("");
  const [type, setType] = useState<ProgressType>("country");
  const [series, setSeries] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState<Metric>("researcher_count");
  const [topicFilter, setTopicFilter] = useState("");
  const [years, setYears] = useState(10);
  const lastAutoQuery = useRef<string | null>(null);

  const fetchProgressData = useCallback(async (
    rawEntity: string,
    rawType: ProgressType,
    rawTopic = "",
  ): Promise<ProgressData | null> => {
    if (!rawEntity.trim()) return null;
    const entity = rawType === "country" ? rawEntity.trim().toUpperCase() : rawEntity.trim();
    const params = new URLSearchParams({
      type: rawType,
      entity,
      years: String(years),
    });
    if (rawType === "country" && rawTopic.trim()) params.set("topic", rawTopic.trim());
    const res = await fetch(`${API_BASE}/progress?${params}`);
    const data: ProgressData = await res.json();
    return data.trend.length > 0 ? data : null;
  }, [years]);

  const fetchEntity = useCallback(async (rawEntity: string, rawType: ProgressType, replace = false) => {
    if (!rawEntity.trim()) return;
    setLoading(true);
    try {
      const data = await fetchProgressData(rawEntity, rawType, topicFilter);
      if (!data) return;
      setSeries(prev => {
        const next = replace ? [] : prev;
        if (next.some(s => s.type === data.type && s.entity.toLowerCase() === data.entity.toLowerCase())) {
          return next;
        }
        return [...next, data].slice(0, 3);
      });
    } catch (e) {
      console.error("Failed to fetch progress:", e);
    } finally {
      setLoading(false);
      setInput("");
    }
  }, [fetchProgressData, topicFilter]);

  const fetchEntities = useCallback(async (rawEntities: string[], rawType: ProgressType, rawTopic = "") => {
    const entities = rawEntities.map(e => e.trim()).filter(Boolean).slice(0, 3);
    if (!entities.length) return;
    setLoading(true);
    try {
      const results = await Promise.all(entities.map(entity => fetchProgressData(entity, rawType, rawTopic)));
      setSeries(results.filter((item): item is ProgressData => item !== null));
    } catch (e) {
      console.error("Failed to fetch progress:", e);
    } finally {
      setLoading(false);
      setInput("");
    }
  }, [fetchProgressData]);

  useEffect(() => {
    const typeParam = searchParams.get("type");
    const entityParam = searchParams.get("entity");
    const entitiesParam = searchParams.get("entities");
    const topicParam = searchParams.get("topic") ?? "";
    const nextType: ProgressType = typeParam === "field" ? "field" : "country";
    if (typeParam === "field" || typeParam === "country") setType(nextType);
    setTopicFilter(nextType === "country" ? topicParam : "");

    const rawEntities = entitiesParam ? entitiesParam.split(",") : entityParam ? [entityParam] : [];
    if (!rawEntities.length) return;

    const autoKey = `${nextType}:${rawEntities.join(",")}:${topicParam}:${years}`;
    if (autoKey === lastAutoQuery.current) return;
    lastAutoQuery.current = autoKey;
    fetchEntities(rawEntities, nextType, topicParam);
  }, [searchParams, fetchEntities, years]);

  const addEntity = useCallback(async () => {
    if (!input.trim() || series.length >= 3) return;
    await fetchEntity(input, type);
  }, [fetchEntity, input, type, series.length]);

  const allPoints = series.flatMap(s => s.trend);
  const allVals = allPoints.map(p => p[metric]);
  const maxVal = Math.max(...allVals, 1);
  const minYear = allPoints.length > 0 ? Math.min(...allPoints.map(p => p.year)) : 2017;
  const maxYear = allPoints.length > 0 ? Math.max(...allPoints.map(p => p.year)) : 2026;
  const yearSpan = Math.max(maxYear - minYear, 1);
  const chartW = 860;
  const chartH = 340;
  const pad = { top: 20, right: 28, bottom: 38, left: 72 };
  const innerW = chartW - pad.left - pad.right;
  const innerH = chartH - pad.top - pad.bottom;
  const toX = (year: number) => pad.left + ((year - minYear) / yearSpan) * innerW;
  const toY = (val: number) => pad.top + innerH - (val / maxVal) * innerH;

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <div style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Publication-year trend</div>
            <h1 style={titleStyle}>Research Progress</h1>
            <p style={subtitleStyle}>
              Compare countries or paper facets over time using publication-time data.
            </p>
          </div>
          <div style={heroMetaStyle}>
            <strong>{series.length || 0}</strong>
            <span>active series</span>
          </div>
        </div>

        <div style={controlBarStyle}>
          <div style={segmentedStyle}>
            {(["country", "field"] as const).map(option => (
              <button
                key={option}
                onClick={() => setType(option)}
                style={type === option ? segmentActiveStyle : segmentStyle}
              >
                {option === "country" ? "Countries" : "Fields"}
              </button>
            ))}
          </div>

          <div style={inputGroupStyle}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addEntity(); }}
              placeholder={type === "country" ? "KR, US, CN..." : "transformer, diffusion..."}
              style={inputStyle}
            />
            <button
              onClick={addEntity}
              disabled={loading || series.length >= 3}
              style={{
                ...primaryButtonStyle,
                opacity: loading || series.length >= 3 ? 0.55 : 1,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              Add
            </button>
          </div>

          <div style={segmentedStyle}>
            {([
              { key: "researcher_count" as const, label: metricLabel(type, "researcher_count") },
              { key: "avg_citations" as const, label: "Avg citations" },
            ]).map(option => (
              <button
                key={option.key}
                onClick={() => setMetric(option.key)}
                style={metric === option.key ? segmentActiveStyle : segmentStyle}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div style={rangeRowStyle}>
          <div style={hintTextStyle}>
            {type === "country"
              ? "Country trends use publication-year author-affiliation contributions."
              : "Field trends use publication-year paper counts from weak paper facets."}
            {topicFilter ? ` Filtered to ${topicFilter}.` : ""}
          </div>
          <label style={rangeLabelStyle}>
            <span>{years} years</span>
            <input
              type="range"
              min={3}
              max={20}
              value={years}
              onChange={e => setYears(Number(e.target.value))}
            />
          </label>
        </div>

        {series.length > 0 && (
          <div style={chipRowStyle}>
            {series.map((s, i) => (
              <button
                key={`${s.type}-${s.entity}`}
                onClick={() => setSeries(prev => prev.filter((_, idx) => idx !== i))}
                style={{ ...chipStyle, borderColor: `${LINE_COLORS[i]}55`, color: LINE_COLORS[i] }}
              >
                {s.type === "country" && COUNTRY_FLAGS[s.entity] ? `${COUNTRY_FLAGS[s.entity]} ` : ""}
                {s.entity}
                <span style={{ color: "#94a3b8" }}>×</span>
              </button>
            ))}
          </div>
        )}

        {series.length === 0 ? (
          <div style={emptyStyle}>{loading ? "Loading trend..." : "Add a country or field to draw the trend."}</div>
        ) : (
          <section style={chartCardStyle}>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} style={chartStyle}>
              {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                const y = toY(maxVal * frac);
                return (
                  <g key={frac}>
                    <line x1={pad.left} y1={y} x2={pad.left + innerW} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                    <text x={pad.left - 10} y={y + 4} textAnchor="end" fill="#64748b" fontFamily={UI_FONT} fontSize={11}>
                      {fmtNum(maxVal * frac)}
                    </text>
                  </g>
                );
              })}

              {Array.from({ length: yearSpan + 1 }, (_, i) => minYear + i)
                .filter((_, i) => i % Math.ceil((yearSpan + 1) / 8) === 0 || yearSpan < 8)
                .map(year => (
                  <text key={year} x={toX(year)} y={chartH - 12} textAnchor="middle" fill="#64748b" fontFamily={UI_FONT} fontSize={11}>
                    {year}
                  </text>
                ))}

              {series.map((s, si) => {
                const color = LINE_COLORS[si];
                const pts = s.trend.map(t => ({ x: toX(t.year), y: toY(t[metric]) }));
                const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
                const areaPath = `${path} L${pts[pts.length - 1]?.x ?? 0},${pad.top + innerH} L${pts[0]?.x ?? 0},${pad.top + innerH} Z`;
                return (
                  <g key={s.entity}>
                    <path d={areaPath} fill={color} opacity={0.07} />
                    <path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke={color} strokeWidth={2} />)}
                  </g>
                );
              })}
            </svg>
          </section>
        )}

        {series.length > 0 && (
          <section style={summaryGridStyle}>
            {series.map((s, i) => (
              <article key={s.entity} style={summaryCardStyle}>
                <div style={{ ...summaryColorStyle, background: LINE_COLORS[i] }} />
                <div style={summaryNameStyle}>
                  {s.type === "country" && COUNTRY_FLAGS[s.entity] ? `${COUNTRY_FLAGS[s.entity]} ` : ""}
                  {s.entity}
                </div>
                <div style={summaryMetricsStyle}>
                  <div>
                    <span>{metricLabel(type, "researcher_count")}</span>
                    <strong>{fmtNum(s.current.researcher_count)}</strong>
                  </div>
                  <div>
                    <span>Avg citations</span>
                    <strong>{fmtNum(s.current.avg_citations)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
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
const heroMetaStyle: CSSProperties = {
  alignSelf: "flex-start",
  minWidth: 150,
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
};
const segmentedStyle: CSSProperties = { display: "flex", gap: 4, padding: 4, background: "#f1f5f9", borderRadius: 12 };
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
const inputGroupStyle: CSSProperties = { display: "flex", flex: "1 1 260px", minWidth: 240 };
const inputStyle: CSSProperties = {
  flex: 1,
  border: "1px solid #dbe3ee",
  borderRight: "none",
  borderRadius: "12px 0 0 12px",
  color: "#0f172a",
  fontFamily: UI_FONT,
  fontSize: 14,
  outline: "none",
  padding: "10px 12px",
};
const primaryButtonStyle: CSSProperties = {
  border: "1px solid #2563eb",
  borderRadius: "0 12px 12px 0",
  background: "#2563eb",
  color: "#fff",
  fontFamily: UI_FONT,
  fontSize: 14,
  fontWeight: 780,
  padding: "0 16px",
};
const rangeRowStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, margin: "14px 0 18px" };
const hintTextStyle: CSSProperties = { color: "#64748b", fontSize: 13 };
const rangeLabelStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, color: "#475569", fontSize: 13, fontWeight: 720 };
const chipRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 };
const chipStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#dbe3ee",
  borderRadius: 999,
  background: "#fff",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 740,
  padding: "8px 11px",
};
const emptyStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minHeight: 300,
  border: "1px dashed #cbd5e1",
  borderRadius: 18,
  background: "#fff",
  color: "#64748b",
  fontSize: 15,
};
const chartCardStyle: CSSProperties = { border: "1px solid #dbe3ee", background: "#fff", borderRadius: 18, padding: 18, boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)" };
const chartStyle: CSSProperties = { width: "100%", height: "auto", display: "block" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 18 };
const summaryCardStyle: CSSProperties = { position: "relative", border: "1px solid #dbe3ee", background: "#fff", borderRadius: 16, padding: 16, overflow: "hidden" };
const summaryColorStyle: CSSProperties = { position: "absolute", top: 0, left: 0, bottom: 0, width: 4 };
const summaryNameStyle: CSSProperties = { fontSize: 16, fontWeight: 820, marginBottom: 12 };
const summaryMetricsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
