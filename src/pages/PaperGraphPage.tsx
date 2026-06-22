import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

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
  if (role === "seed") return "#0f766e";
  if (role === "reference") return "#2563eb";
  if (role === "prerequisite") return "#7c3aed";
  return "#ea580c";
}

function roleFill(role: GraphNode["role"]): string {
  if (role === "seed") return "#ccfbf1";
  if (role === "reference") return "#dbeafe";
  if (role === "prerequisite") return "#ede9fe";
  return "#ffedd5";
}

function roleLabel(role: GraphNode["role"]): string {
  if (role === "seed") return "Seed";
  if (role === "reference") return "Referenced";
  if (role === "prerequisite") return "Foundation";
  return "Related";
}

function truncate(text: string | null, max = 86): string {
  if (!text) return "(untitled)";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
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
    const width = 1180;
    const height = 640;
    const left = 70;
    const right = 70;
    const lanes: Record<GraphNode["role"], number> = {
      prerequisite: 110,
      reference: 250,
      seed: 395,
      related: 525,
    };
    const roleCounts: Record<string, number> = {};
    const points = nodes.map((node) => {
      const year = node.year ?? maxYear;
      const x = left + ((year - minYear) / Math.max(1, maxYear - minYear)) * (width - left - right);
      const count = roleCounts[node.role] ?? 0;
      roleCounts[node.role] = count + 1;
      const offset = ((count % 7) - 3) * 13;
      const y = lanes[node.role] + offset;
      const radius = node.role === "seed"
        ? 16
        : Math.max(7, Math.min(15, 6 + Math.sqrt(Math.max(node.citations, 1)) / 30));
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
  }, [graph]);

  const seed = graph?.nodes.find(n => n.id === graph.paper_id) ?? null;

  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <button onClick={() => navigate(-1)} style={backButtonStyle}>Back</button>

        {loading && <StateBlock title="Loading citation graph" body="Building local citation context." />}
        {error && <StateBlock title="Citation graph unavailable" body={error} tone="error" />}

        {!loading && graph && (
          <>
            <header style={heroStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={eyebrowStyle}>Citation Graph</div>
                <h1 style={titleStyle}>{truncate(seed?.title ?? selected?.title ?? null, 110)}</h1>
                <p style={subtitleStyle}>
                  {graph.quality_filtered ? graph.quality_policy : "unfiltered"} · depth {graph.depth} · {graph.nodes.length} nodes
                </p>
              </div>
              <div style={metricGridStyle}>
                <Metric label="Referenced" value={fmtNum(graph.reference_count)} />
                <Metric label="Foundation" value={fmtNum(graph.prerequisite_count)} />
                <Metric label="Related" value={fmtNum(graph.related_count)} />
              </div>
            </header>

            <div style={layoutStyle}>
              <main style={graphCardStyle}>
                <div style={legendStyle}>
                  {(["prerequisite", "reference", "seed", "related"] as GraphNode["role"][]).map(role => (
                    <button
                      key={role}
                      style={legendItemStyle}
                      onClick={() => {
                        const node = graph.nodes.find(n => n.role === role);
                        if (node) setSelected(node);
                      }}
                    >
                      <span style={{ ...legendDotStyle, background: roleColor(role) }} />
                      {roleLabel(role)}
                    </button>
                  ))}
                </div>

                <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={svgStyle} role="img">
                  <rect x={0} y={0} width={layout.width} height={layout.height} fill="#ffffff" />
                  {[layout.minYear, Math.round((layout.minYear + layout.maxYear) / 2), layout.maxYear].map(year => {
                    const x = 70 + ((year - layout.minYear) / Math.max(1, layout.maxYear - layout.minYear)) * (layout.width - 140);
                    return (
                      <g key={year}>
                        <line x1={x} y1={42} x2={x} y2={layout.height - 36} stroke="#dbe3ee" strokeDasharray="4 7" />
                        <text x={x} y={28} textAnchor="middle" fill="#64748b" fontFamily="system-ui" fontSize="13">{year}</text>
                      </g>
                    );
                  })}

                  {(["Foundation", "Referenced", "Seed", "Related"] as const).map((label, idx) => (
                    <text key={label} x={22} y={[110, 250, 395, 525][idx] + 4} fill="#94a3b8" fontFamily="system-ui" fontSize="13" fontWeight="700">
                      {label}
                    </text>
                  ))}

                  {(graph.edges ?? []).map((edge, idx) => {
                    const source = layout.pointMap.get(edge.source);
                    const target = layout.pointMap.get(edge.target);
                    if (!source || !target) return null;
                    const color = edge.type === "related" ? "#ea580c" : "#94a3b8";
                    const midX = (source.x + target.x) / 2;
                    return (
                      <path
                        key={`${edge.source}:${edge.target}:${edge.type}:${idx}`}
                        d={`M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={edge.type === "related" ? 1.4 : 1}
                        strokeOpacity={edge.type === "related" ? 0.34 : 0.28}
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
                          r={node.radius + (isSelected ? 6 : 0)}
                          fill={isSelected ? roleFill(node.role) : "#ffffff"}
                          stroke={color}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                        <circle r={Math.max(4, node.radius - 5)} fill={color} opacity={node.role === "seed" ? 1 : 0.88} />
                      </g>
                    );
                  })}
                </svg>
              </main>

              <aside style={asideStyle}>
                {selected ? (
                  <>
                    <div style={{ ...roleBadgeStyle, color: roleColor(selected.role), borderColor: `${roleColor(selected.role)}55` }}>
                      {roleLabel(selected.role)}
                    </div>
                    <h2 style={sideTitleStyle}>{selected.title ?? selected.id}</h2>
                    <div style={sideMetricsStyle}>
                      <Metric label="Year" value={selected.year ? String(selected.year) : "-"} />
                      <Metric label="Citations" value={fmtNum(selected.citations)} />
                    </div>
                    <InfoLine label="Field" value={selected.subfield ?? "Unknown field"} />
                    <InfoLine label="Topic" value={selected.topic ?? "Unknown topic"} />
                    <InfoLine label="Type" value={selected.type ?? "Unknown type"} />
                    <div style={sideActionsStyle}>
                      <Link to={`/papers/${encodeURIComponent(selected.id)}`} style={primaryActionStyle}>Open paper</Link>
                      <Link to={`/papers/${encodeURIComponent(selected.id)}/graph`} style={secondaryActionStyle}>Graph</Link>
                    </div>
                  </>
                ) : (
                  <StateBlock title="Select a node" body="Click a paper in the graph." />
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoLineStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StateBlock({ title, body, tone = "neutral" }: { title: string; body: string; tone?: "neutral" | "error" }) {
  return (
    <div style={stateStyle}>
      <h2 style={{ ...sideTitleStyle, color: tone === "error" ? "#b91c1c" : "#0f172a" }}>{title}</h2>
      <p style={subtitleStyle}>{body}</p>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  position: "absolute",
  top: 52,
  left: 0,
  right: 0,
  bottom: 0,
  overflowY: "auto",
  background: "#f8fafc",
  color: "#0f172a",
  padding: "30px 42px 76px",
  fontFamily: UI_FONT,
};

const contentStyle: React.CSSProperties = {
  maxWidth: 1320,
  margin: "0 auto",
};

const backButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#0f766e",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 14,
  fontWeight: 750,
  padding: 0,
  marginBottom: 16,
};

const heroStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: 24,
  alignItems: "start",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)",
  marginBottom: 20,
};

const eyebrowStyle: React.CSSProperties = {
  color: "#0f766e",
  fontSize: 14,
  fontWeight: 800,
  marginBottom: 10,
};

const titleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 34,
  fontWeight: 790,
  lineHeight: 1.15,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.5,
  margin: "10px 0 0",
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};

const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 330px",
  gap: 20,
  alignItems: "start",
};

const graphCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 14,
  overflow: "hidden",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  borderBottom: "1px solid #e2e8f0",
  padding: "12px 14px",
};

const legendItemStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 999,
  color: "#334155",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 720,
  padding: "6px 10px",
};

const legendDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
};

const svgStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 620,
  display: "block",
};

const asideStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 14,
  padding: 18,
  position: "sticky",
  top: 76,
};

const roleBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#dbe3ee",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  padding: "4px 9px",
  marginBottom: 12,
};

const sideTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 20,
  fontWeight: 770,
  lineHeight: 1.28,
  margin: 0,
};

const sideMetricsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  margin: "16px 0",
};

const sideActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 16,
};

const primaryActionStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #0f172a",
  borderRadius: 9,
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 750,
  padding: "9px 12px",
  textDecoration: "none",
};

const secondaryActionStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 750,
  padding: "9px 12px",
  textDecoration: "none",
};

const infoLineStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  borderTop: "1px solid #e2e8f0",
  color: "#64748b",
  fontSize: 12,
  padding: "10px 0",
};

const metricStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 12,
};

const metricLabelStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 760,
  marginBottom: 5,
};

const metricValueStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 22,
  fontWeight: 800,
};

const stateStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  padding: 22,
};
