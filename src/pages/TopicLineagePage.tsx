import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

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
  if (role === "seed") return "#0f766e";
  if (role === "ancestor") return "#2563eb";
  return "#7c3aed";
}

function roleFill(role: LineageNode["role"]): string {
  if (role === "seed") return "#ccfbf1";
  if (role === "ancestor") return "#dbeafe";
  return "#ede9fe";
}

function roleLabel(role: LineageNode["role"]): string {
  if (role === "seed") return "Seed papers";
  if (role === "ancestor") return "Common ancestors";
  return "Foundations";
}

function roleHelp(role: LineageNode["role"]): string {
  if (role === "seed") return "현재 topic slice에서 대표 seed로 뽑힌 논문입니다. 이 논문들이 lineage graph의 출발점입니다.";
  if (role === "ancestor") return "여러 seed 논문이 공통으로 인용하거나 기대는 cited work입니다. 주제 내부의 연결 축을 잡는 데 유용합니다.";
  return "더 오래되고 reach/score가 높은 기반 논문입니다. 특정 분야가 어떤 선행 연구 위에 쌓였는지 보는 기준입니다.";
}

function truncate(text: string | null, max = 86): string {
  if (!text) return "(untitled)";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

export function TopicLineagePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const topic = params.get("topic");
  const axis = params.get("axis") || "";
  const seedLimit = params.get("seed_limit") || "8";
  const ancestorLimit = params.get("ancestor_limit") || "20";
  const [data, setData] = useState<TopicLineage | null>(null);
  const [selected, setSelected] = useState<LineageNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState("");

  useEffect(() => {
    if (!topic) {
      setData(null);
      setSelected(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      topic,
      seed_limit: seedLimit,
      ancestor_limit: ancestorLimit,
      year_from: "2017",
    });
    if (axis) query.set("axis", axis);
    fetch(`${API_BASE}/papers/graphs/topic-lineage?${query}`, { signal: controller.signal })
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
        if (!cancelled) {
          setError(err.name === "AbortError" ? "This topic is too broad for the current lineage query." : err.message);
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [topic, axis, seedLimit, ancestorLimit]);

  const layout = useMemo(() => {
    const nodes = data?.nodes ?? [];
    const years = nodes.map(n => n.year).filter((y): y is number => typeof y === "number");
    const minYear = Math.min(...years, 1980);
    const maxYear = Math.max(...years, minYear + 1);
    const width = 1180;
    const height = 640;
    const left = 74;
    const right = 70;
    const lanes: Record<LineageNode["role"], number> = {
      foundation: 130,
      ancestor: 315,
      seed: 505,
    };
    const roleCounts: Record<string, number> = {};
    const points = nodes.map(node => {
      const year = node.year ?? maxYear;
      const x = left + ((year - minYear) / Math.max(1, maxYear - minYear)) * (width - left - right);
      const count = roleCounts[node.role] ?? 0;
      roleCounts[node.role] = count + 1;
      const y = lanes[node.role] + ((count % 9) - 4) * 14;
      const radius = node.role === "seed"
        ? 13
        : Math.max(7, Math.min(16, 6 + Math.sqrt(Math.max(node.lineage_score, 1)) / 5.5));
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
    <div style={pageStyle}>
      <div style={contentStyle}>
        <button onClick={() => navigate(-1)} style={backButtonStyle}>Back</button>

        {!topic && (
          <section style={emptyLandingStyle}>
            <div style={eyebrowStyle}>Topic Lineage</div>
            <h1 style={titleStyle}>Choose a topic to build a citation lineage</h1>
            <p style={subtitleStyle}>
              Start from a method or task, then we collect representative seed papers and shared citation ancestors.
            </p>
            <div style={lineageSearchStyle}>
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && topicInput.trim()) {
                    navigate(`/lineage?topic=${encodeURIComponent(topicInput.trim())}&seed_limit=8&ancestor_limit=20`);
                  }
                }}
                placeholder="RAG, diffusion, transformer..."
                style={lineageInputStyle}
              />
              <button
                onClick={() => {
                  if (topicInput.trim()) {
                    navigate(`/lineage?topic=${encodeURIComponent(topicInput.trim())}&seed_limit=8&ancestor_limit=20`);
                  }
                }}
                style={lineageButtonStyle}
              >
                Build lineage
              </button>
            </div>
            <div style={exampleRowStyle}>
              {["RAG", "Diffusion", "Transformer"].map(example => (
                <button
                  key={example}
                  onClick={() => navigate(`/lineage?topic=${encodeURIComponent(example.toLowerCase())}&seed_limit=8&ancestor_limit=20`)}
                  style={exampleButtonStyle}
                >
                  {example}
                </button>
              ))}
            </div>
          </section>
        )}

        {loading && <StateBlock title="Building lineage" body="Loading topic seeds and shared citation ancestors." />}
        {error && <StateBlock title="Lineage unavailable" body={error} tone="error" />}

        {topic && !loading && data && (
          <>
            <header style={heroStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={eyebrowStyle}>Topic Lineage</div>
                <h1 style={titleStyle}>{data.topic}</h1>
                <p style={subtitleStyle}>
                  {data.matched_axes.length > 0 ? data.matched_axes.join(", ") : "all axes"} · since {data.year_from} · {data.quality_filtered ? data.quality_policy : "unfiltered"}
                </p>
              </div>
              <div style={metricGridStyle}>
                <Metric label="Seeds" value={fmtNum(data.seed_count)} />
                <Metric label="Ancestors" value={fmtNum(data.ancestor_count)} />
                <Metric label="Edges" value={fmtNum(data.edges.length)} />
              </div>
            </header>

            <section style={lineageGuideStyle}>
              {(["seed", "ancestor", "foundation"] as LineageNode["role"][]).map(role => (
                <LineageGuideCard key={role} role={role} />
              ))}
            </section>

            <div style={layoutStyle}>
              <main style={graphCardStyle}>
                <div style={toolbarStyle}>
                  {(["foundation", "ancestor", "seed"] as LineageNode["role"][]).map(role => (
                    <button
                      key={role}
                      style={legendItemStyle}
                      onClick={() => {
                        const node = data.nodes.find(n => n.role === role);
                        if (node) setSelected(node);
                      }}
                    >
                      <span style={{ ...legendDotStyle, background: roleColor(role) }} />
                      {roleLabel(role)}
                    </button>
                  ))}
                  <Link to={`/timeline?topic=${encodeURIComponent(data.topic)}${axis ? `&axis=${encodeURIComponent(axis)}` : ""}`} style={toolbarLinkStyle}>
                    Papers
                  </Link>
                </div>

                <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={svgStyle}>
                  <rect x={0} y={0} width={layout.width} height={layout.height} fill="#ffffff" />
                  {[layout.minYear, Math.round((layout.minYear + layout.maxYear) / 2), layout.maxYear].map(year => {
                    const x = 74 + ((year - layout.minYear) / Math.max(1, layout.maxYear - layout.minYear)) * (layout.width - 144);
                    return (
                      <g key={year}>
                        <line x1={x} y1={44} x2={x} y2={layout.height - 36} stroke="#dbe3ee" strokeDasharray="4 7" />
                        <text x={x} y={29} textAnchor="middle" fill="#64748b" fontFamily="system-ui" fontSize="13">{year}</text>
                      </g>
                    );
                  })}

                  {(["Foundations", "Ancestors", "Seeds"] as const).map((label, idx) => (
                    <text key={label} x={24} y={[130, 315, 505][idx] + 4} fill="#94a3b8" fontFamily="system-ui" fontSize="13" fontWeight="700">
                      {label}
                    </text>
                  ))}

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
                        stroke="#94a3b8"
                        strokeOpacity={0.24}
                        strokeWidth={1}
                      />
                    );
                  })}

                  {layout.points.map(node => {
                    const color = roleColor(node.role);
                    const isSelected = selected?.id === node.id;
                    return (
                      <g key={node.id} transform={`translate(${node.x}, ${node.y})`} onClick={() => setSelected(node)} style={{ cursor: "pointer" }}>
                        <circle r={node.radius + (isSelected ? 6 : 0)} fill={isSelected ? roleFill(node.role) : "#ffffff"} stroke={color} strokeWidth={isSelected ? 3 : 2} />
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
                    <p style={sideHelpStyle}>{roleHelp(selected.role)}</p>
                    <h2 style={sideTitleStyle}>{truncate(selected.title, 120)}</h2>
                    <div style={sideMetricsStyle}>
                      <Metric label="Year" value={selected.year ? String(selected.year) : "-"} />
                      <Metric label="Reach" value={fmtNum(selected.seed_reach)} />
                      <Metric label="Citations" value={fmtNum(selected.citations)} />
                      <Metric label="Score" value={fmtNum(Math.round(selected.lineage_score))} />
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

function LineageGuideCard({ role }: { role: LineageNode["role"] }) {
  return (
    <div style={lineageGuideCardStyle}>
      <span style={{ ...legendDotStyle, background: roleColor(role) }} />
      <div style={{ minWidth: 0 }}>
        <strong style={lineageGuideTitleStyle}>{roleLabel(role)}</strong>
        <p style={lineageGuideTextStyle}>{roleHelp(role)}</p>
      </div>
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
  fontSize: 36,
  fontWeight: 790,
  lineHeight: 1.12,
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

const lineageGuideStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const lineageGuideCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "16px minmax(0, 1fr)",
  gap: 10,
  alignItems: "start",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  padding: "14px 15px",
};

const lineageGuideTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  display: "block",
  fontSize: 14,
  fontWeight: 790,
  lineHeight: 1.3,
};

const lineageGuideTextStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
  margin: "5px 0 0",
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

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
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

const toolbarLinkStyle: React.CSSProperties = {
  marginLeft: "auto",
  background: "#0f172a",
  border: "1px solid #0f172a",
  borderRadius: 999,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 740,
  padding: "7px 11px",
  textDecoration: "none",
};

const svgStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 620,
  display: "block",
};

const emptyLandingStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 18,
  boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
  padding: 34,
  maxWidth: 860,
};

const lineageSearchStyle: React.CSSProperties = {
  display: "flex",
  gap: 0,
  marginTop: 24,
  maxWidth: 620,
};

const lineageInputStyle: React.CSSProperties = {
  flex: 1,
  border: "1px solid #cbd5e1",
  borderRight: "none",
  borderRadius: "12px 0 0 12px",
  color: "#0f172a",
  fontFamily: UI_FONT,
  fontSize: 15,
  outline: "none",
  padding: "12px 14px",
};

const lineageButtonStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #0f172a",
  borderRadius: "0 12px 12px 0",
  color: "#ffffff",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 15,
  fontWeight: 780,
  padding: "0 18px",
};

const exampleRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 16,
};

const exampleButtonStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #dbe3ee",
  borderRadius: 999,
  color: "#334155",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 740,
  padding: "8px 12px",
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

const sideHelpStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
  margin: "0 0 14px",
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
