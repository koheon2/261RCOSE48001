import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = "http://localhost:8000/api";
const PIXEL_FONT = "'Press Start 2P', monospace";
const MONO_FONT = "'Share Tech Mono', monospace";

interface LineageNode {
  id: string;
  title: string | null;
  year: number | null;
  citations: number;
  fwci: number | null;
  type: string | null;
  subfield: string | null;
  topic: string | null;
  role: "seed" | "ancestor" | "foundation";
  lineage_depth: number;
  seed_reach: number;
  edge_count: number;
  lineage_score: number;
}

interface LineageEdge {
  source: string;
  target: string;
  type: "reference";
}

interface TopicLineage {
  topic: string;
  query: string;
  matched_axes: string[];
  seed_count: number;
  ancestor_count: number;
  nodes: LineageNode[];
  edges: LineageEdge[];
  scoring: string;
  year_from: number;
  quality_filtered: boolean;
  quality_policy: string;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function roleColor(role: LineageNode["role"]): string {
  if (role === "seed") return "#00d4ff";
  if (role === "ancestor") return "#fbbf24";
  return "#a78bfa";
}

function roleLabel(role: LineageNode["role"]): string {
  if (role === "seed") return "SEED PAPERS";
  if (role === "ancestor") return "COMMON ANCESTORS";
  return "FOUNDATIONS";
}

export function TopicLineagePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const topic = params.get("topic") || "diffusion";
  const axis = params.get("axis") || "";
  const [data, setData] = useState<TopicLineage | null>(null);
  const [selected, setSelected] = useState<LineageNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      topic,
      seed_limit: "24",
      ancestor_limit: "70",
      year_from: "2017",
    });
    if (axis) query.set("axis", axis);
    fetch(`${API_BASE}/papers/graphs/topic-lineage?${query}`)
      .then(res => {
        if (!res.ok) throw new Error(`Topic lineage failed: ${res.status}`);
        return res.json();
      })
      .then((json: TopicLineage) => {
        if (!cancelled) {
          setData(json);
          setSelected(json.nodes.find(n => n.role === "seed") ?? json.nodes[0] ?? null);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [topic, axis]);

  const layout = useMemo(() => {
    const nodes = data?.nodes ?? [];
    const years = nodes.map(n => n.year).filter((y): y is number => typeof y === "number");
    const minYear = Math.min(...years, 1980);
    const maxYear = Math.max(...years, minYear + 1);
    const width = 1200;
    const height = 720;
    const left = 70;
    const right = 70;
    const lanes: Record<LineageNode["role"], number> = {
      foundation: 120,
      ancestor: 315,
      seed: 540,
    };
    const roleCounts: Record<string, number> = {};
    const points = nodes.map(node => {
      const year = node.year ?? maxYear;
      const x = left + ((year - minYear) / Math.max(1, maxYear - minYear)) * (width - left - right);
      const count = roleCounts[node.role] ?? 0;
      roleCounts[node.role] = count + 1;
      const y = lanes[node.role] + ((count % 9) - 4) * 15;
      const radius = node.role === "seed"
        ? 12
        : Math.max(6, Math.min(15, 5 + Math.sqrt(Math.max(node.lineage_score, 1)) / 5));
      return { ...node, x, y, radius };
    });
    return {
      width,
      height,
      minYear,
      maxYear,
      points,
      pointMap: new Map(points.map(p => [p.id, p])),
    };
  }, [data]);

  return (
    <div style={{
      position: "absolute", top: 52, left: 0, right: 0, bottom: 0,
      background: "#06080f",
      overflow: "auto",
      padding: "30px 40px 56px",
    }}>
      <button onClick={() => navigate(-1)} style={backButtonStyle}>BACK</button>

      {loading && <div style={emptyStyle}>Building topic lineage...</div>}
      {error && <div style={emptyStyle}>{error}</div>}

      {!loading && data && (
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 22 }}>
            <div>
              <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: "#34d399", marginBottom: 10 }}>
                TOPIC LINEAGE GRAPH
              </div>
              <h1 style={{ fontFamily: PIXEL_FONT, fontSize: 18, color: "#f8fafc", lineHeight: 1.45, margin: 0 }}>
                {data.topic}
              </h1>
              <div style={{ fontFamily: MONO_FONT, fontSize: 12, color: "#64748b", marginTop: 10 }}>
                Multi-seed graph from enriched papers. Nodes are scored by seed reach, shared references, and citation impact.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 100px)", gap: 10 }}>
              <Metric label="SEEDS" value={fmtNum(data.seed_count)} color="#00d4ff" />
              <Metric label="ANCEST." value={fmtNum(data.ancestor_count)} color="#fbbf24" />
              <Metric label="EDGES" value={fmtNum(data.edges.length)} color="#a78bfa" />
            </div>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 22 }}>
            <section style={{ border: "1px solid #1e293b", background: "#020617", overflow: "hidden" }}>
              <div style={{ display: "flex", gap: 14, padding: "12px 14px", borderBottom: "1px solid #1e293b", flexWrap: "wrap" }}>
                {(["foundation", "ancestor", "seed"] as LineageNode["role"][]).map(role => (
                  <div key={role} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, background: roleColor(role), display: "inline-block" }} />
                    <span style={{ fontFamily: PIXEL_FONT, fontSize: 6, color: "#64748b" }}>{roleLabel(role)}</span>
                  </div>
                ))}
              </div>

              <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ width: "100%", minHeight: 650, display: "block" }}>
                {[layout.minYear, Math.round((layout.minYear + layout.maxYear) / 2), layout.maxYear].map(year => {
                  const x = 70 + ((year - layout.minYear) / Math.max(1, layout.maxYear - layout.minYear)) * (layout.width - 140);
                  return (
                    <g key={year}>
                      <line x1={x} y1={42} x2={x} y2={layout.height - 36} stroke="#1e293b" strokeDasharray="4 6" />
                      <text x={x} y={28} textAnchor="middle" fill="#475569" fontFamily="monospace" fontSize="13">{year}</text>
                    </g>
                  );
                })}

                {(data.edges ?? []).map((edge, idx) => {
                  const source = layout.pointMap.get(edge.source);
                  const target = layout.pointMap.get(edge.target);
                  if (!source || !target) return null;
                  const midX = (source.x + target.x) / 2;
                  return (
                    <path
                      key={`${edge.source}:${edge.target}:${idx}`}
                      d={`M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`}
                      fill="none"
                      stroke="#64748b"
                      strokeOpacity={0.25}
                      strokeWidth={1}
                    />
                  );
                })}

                {layout.points.map(node => {
                  const color = roleColor(node.role);
                  const isSelected = selected?.id === node.id;
                  return (
                    <g key={node.id} transform={`translate(${node.x}, ${node.y})`} onClick={() => setSelected(node)} style={{ cursor: "pointer" }}>
                      <circle r={node.radius + (isSelected ? 5 : 0)} fill={isSelected ? `${color}33` : "#020617"} stroke={color} strokeWidth={isSelected ? 3 : 2} />
                      <circle r={Math.max(3, node.radius - 4)} fill={color} opacity={node.role === "seed" ? 1 : 0.85} />
                    </g>
                  );
                })}
              </svg>
            </section>

            <aside style={{ border: "1px solid #1e293b", padding: 16, minHeight: 540 }}>
              {selected ? (
                <>
                  <div style={{ fontFamily: PIXEL_FONT, fontSize: 7, color: roleColor(selected.role), marginBottom: 10 }}>
                    {roleLabel(selected.role)}
                  </div>
                  <h2 style={{ fontFamily: MONO_FONT, fontSize: 18, lineHeight: 1.35, color: "#f8fafc", margin: "0 0 12px" }}>
                    {selected.title ?? selected.id}
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <Metric label="YEAR" value={selected.year ? String(selected.year) : "----"} color="#94a3b8" />
                    <Metric label="REACH" value={fmtNum(selected.seed_reach)} color="#34d399" />
                    <Metric label="CIT." value={fmtNum(selected.citations)} color="#fbbf24" />
                    <Metric label="SCORE" value={fmtNum(Math.round(selected.lineage_score))} color="#a78bfa" />
                  </div>
                  <div style={metaLineStyle}>{selected.subfield ?? "unknown field"}</div>
                  <div style={metaLineStyle}>{selected.topic ?? "unknown topic"}</div>
                  <div style={metaLineStyle}>{selected.type ?? "unknown type"}</div>
                  <Link to={`/papers/${encodeURIComponent(selected.id)}`} style={openLinkStyle}>
                    OPEN PAPER
                  </Link>
                </>
              ) : (
                <div style={emptyStyle}>Select a node.</div>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ borderTop: `2px solid ${color}`, paddingTop: 8 }}>
      <div style={{ fontFamily: PIXEL_FONT, fontSize: 5, color: "#475569", marginBottom: 7 }}>{label}</div>
      <div style={{ fontFamily: MONO_FONT, fontSize: 20, color }}>{value}</div>
    </div>
  );
}

const backButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #1e293b",
  color: "#64748b",
  fontFamily: MONO_FONT,
  fontSize: 12,
  padding: "7px 10px",
  cursor: "pointer",
  marginBottom: 18,
};

const emptyStyle: React.CSSProperties = {
  fontFamily: MONO_FONT,
  color: "#64748b",
  padding: "40px 0",
};

const metaLineStyle: React.CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: 12,
  color: "#94a3b8",
  borderTop: "1px solid #0f172a",
  padding: "9px 0",
};

const openLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 18,
  color: "#00d4ff",
  border: "1px solid #1e293b",
  padding: "8px 10px",
  textDecoration: "none",
  fontFamily: PIXEL_FONT,
  fontSize: 7,
};
