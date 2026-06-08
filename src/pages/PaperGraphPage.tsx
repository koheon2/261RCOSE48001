import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_BASE = "http://localhost:8000/api";
const PIXEL_FONT = "'Press Start 2P', monospace";
const MONO_FONT = "'Share Tech Mono', monospace";

interface GraphNode {
  id: string;
  title: string | null;
  year: number | null;
  citations: number;
  fwci: number | null;
  type: string | null;
  subfield: string | null;
  topic: string | null;
  role: "seed" | "reference" | "prerequisite" | "related";
  level?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "reference" | "related";
}

interface CitationGraph {
  paper_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
  reference_count: number;
  prerequisite_count: number;
  related_count: number;
  quality_filtered: boolean;
  quality_policy: string;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function roleColor(role: GraphNode["role"]): string {
  if (role === "seed") return "#00d4ff";
  if (role === "reference") return "#fbbf24";
  if (role === "prerequisite") return "#a78bfa";
  return "#34d399";
}

function roleLabel(role: GraphNode["role"]): string {
  if (role === "seed") return "SEED";
  if (role === "reference") return "EARLIER";
  if (role === "prerequisite") return "FOUNDATION";
  return "RELATED";
}

function truncate(text: string | null, max = 72): string {
  if (!text) return "(untitled)";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function PaperGraphPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [graph, setGraph] = useState<CitationGraph | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/papers/${encodeURIComponent(id)}/citation-graph?depth=2&limit=42&related=14`)
      .then(res => {
        if (!res.ok) throw new Error(`Citation graph failed: ${res.status}`);
        return res.json();
      })
      .then((data: CitationGraph) => {
        if (!cancelled) {
          setGraph(data);
          setSelected(data.nodes.find(n => n.id === data.paper_id) ?? data.nodes[0] ?? null);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const layout = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    const years = nodes.map(n => n.year).filter((y): y is number => typeof y === "number");
    const minYear = Math.min(...years, 2000);
    const maxYear = Math.max(...years, minYear + 1);
    const width = 1160;
    const height = 680;
    const left = 70;
    const right = 70;
    const top = 70;
    const laneGap = 112;
    const lanes: Record<GraphNode["role"], number> = {
      prerequisite: top + laneGap * 0,
      reference: top + laneGap * 1.45,
      seed: top + laneGap * 2.9,
      related: top + laneGap * 4.35,
    };
    const roleCounts: Record<string, number> = {};
    const points = nodes.map((node) => {
      const year = node.year ?? maxYear;
      const x = left + ((year - minYear) / Math.max(1, maxYear - minYear)) * (width - left - right);
      const count = roleCounts[node.role] ?? 0;
      roleCounts[node.role] = count + 1;
      const offset = ((count % 7) - 3) * 14;
      const y = lanes[node.role] + offset;
      const radius = node.role === "seed"
        ? 15
        : Math.max(6, Math.min(13, 5 + Math.sqrt(Math.max(node.citations, 1)) / 28));
      return { ...node, x, y, radius };
    });
    const pointMap = new Map(points.map(p => [p.id, p]));
    return { width, height, minYear, maxYear, points, pointMap };
  }, [graph]);

  const edges = graph?.edges ?? [];

  return (
    <div style={{
      position: "absolute", top: 52, left: 0, right: 0, bottom: 0,
      background: "#06080f",
      overflow: "auto",
      padding: "30px 40px 56px",
    }}>
      <button
        onClick={() => navigate(-1)}
        style={backButtonStyle}
      >
        BACK
      </button>

      {loading && <div style={emptyStyle}>Loading citation graph...</div>}
      {error && <div style={emptyStyle}>{error}</div>}

      {!loading && graph && (
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 22 }}>
            <div>
              <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: "#00d4ff", marginBottom: 10 }}>
                CITATION LINEAGE GRAPH
              </div>
              <h1 style={{ fontFamily: PIXEL_FONT, fontSize: 16, lineHeight: 1.55, color: "#f8fafc", margin: 0 }}>
                {truncate(
                  (selected?.role === "seed" ? selected.title : graph.nodes.find(n => n.id === graph.paper_id)?.title) ?? null,
                  90,
                )}
              </h1>
              <div style={{ fontFamily: MONO_FONT, fontSize: 12, color: "#64748b", marginTop: 10 }}>
                Earlier works flow left-to-right into the seed paper. Related works are shown as a separate lane.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 92px)", gap: 10 }}>
              <Metric label="EARLIER" value={fmtNum(graph.reference_count)} color="#fbbf24" />
              <Metric label="FOUND." value={fmtNum(graph.prerequisite_count)} color="#a78bfa" />
              <Metric label="RELATED" value={fmtNum(graph.related_count)} color="#34d399" />
            </div>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 22 }}>
            <section style={{ border: "1px solid #1e293b", overflow: "hidden", background: "#020617" }}>
              <div style={{ display: "flex", gap: 14, padding: "12px 14px", borderBottom: "1px solid #1e293b", flexWrap: "wrap" }}>
                {(["prerequisite", "reference", "seed", "related"] as GraphNode["role"][]).map(role => (
                  <div key={role} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, background: roleColor(role), display: "inline-block" }} />
                    <span style={{ fontFamily: PIXEL_FONT, fontSize: 6, color: "#64748b" }}>{roleLabel(role)}</span>
                  </div>
                ))}
              </div>

              <svg
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                style={{ width: "100%", minHeight: 620, display: "block" }}
                role="img"
              >
                {[layout.minYear, Math.round((layout.minYear + layout.maxYear) / 2), layout.maxYear].map(year => {
                  const x = 70 + ((year - layout.minYear) / Math.max(1, layout.maxYear - layout.minYear)) * (layout.width - 140);
                  return (
                    <g key={year}>
                      <line x1={x} y1={42} x2={x} y2={layout.height - 34} stroke="#1e293b" strokeDasharray="4 6" />
                      <text x={x} y={28} textAnchor="middle" fill="#475569" fontFamily="monospace" fontSize="13">{year}</text>
                    </g>
                  );
                })}

                {edges.map((edge, idx) => {
                  const source = layout.pointMap.get(edge.source);
                  const target = layout.pointMap.get(edge.target);
                  if (!source || !target) return null;
                  const color = edge.type === "related" ? "#34d399" : "#64748b";
                  const midX = (source.x + target.x) / 2;
                  return (
                    <path
                      key={`${edge.source}:${edge.target}:${edge.type}:${idx}`}
                      d={`M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={edge.type === "related" ? 1.4 : 1}
                      strokeOpacity={edge.type === "related" ? 0.45 : 0.28}
                    />
                  );
                })}

                {layout.points.map(node => {
                  const color = roleColor(node.role);
                  const isSelected = selected?.id === node.id;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={() => setSelected(node)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        r={node.radius + (isSelected ? 5 : 0)}
                        fill={isSelected ? `${color}33` : "#020617"}
                        stroke={color}
                        strokeWidth={isSelected ? 3 : 2}
                      />
                      <circle r={Math.max(3, node.radius - 4)} fill={color} opacity={node.role === "seed" ? 1 : 0.85} />
                      {node.role === "seed" && (
                        <text x={0} y={-24} textAnchor="middle" fill={color} fontFamily="monospace" fontSize="12">SEED</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </section>

            <aside style={{ border: "1px solid #1e293b", padding: 16, minHeight: 520 }}>
              {selected ? (
                <>
                  <div style={{
                    fontFamily: PIXEL_FONT,
                    fontSize: 7,
                    color: roleColor(selected.role),
                    marginBottom: 10,
                  }}>
                    {roleLabel(selected.role)}
                  </div>
                  <h2 style={{ fontFamily: MONO_FONT, fontSize: 18, lineHeight: 1.35, color: "#f8fafc", margin: "0 0 12px" }}>
                    {selected.title ?? selected.id}
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <Metric label="YEAR" value={selected.year ? String(selected.year) : "----"} color="#94a3b8" />
                    <Metric label="CIT." value={fmtNum(selected.citations)} color="#fbbf24" />
                  </div>
                  <div style={metaLineStyle}>{selected.subfield ?? "unknown field"}</div>
                  <div style={metaLineStyle}>{selected.topic ?? "unknown topic"}</div>
                  <div style={metaLineStyle}>{selected.type ?? "unknown type"}</div>
                  <Link
                    to={`/papers/${encodeURIComponent(selected.id)}`}
                    style={{
                      display: "inline-block",
                      marginTop: 18,
                      color: "#00d4ff",
                      border: "1px solid #1e293b",
                      padding: "8px 10px",
                      textDecoration: "none",
                      fontFamily: PIXEL_FONT,
                      fontSize: 7,
                    }}
                  >
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
