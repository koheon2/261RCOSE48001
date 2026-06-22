import { useEffect, useMemo } from "react";

const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const ENTITY_COLORS = ["#0f766e", "#2563eb", "#7c3aed"];

interface Metric { [key: string]: number | string }

interface CompEntity {
  key: string;
  name: string;
  emoji: string;
  metrics: Metric;
  top_researcher?: { name: string; citations: number; institution?: string } | null;
  top_cluster?: string;
  matched_axis?: string;
  field?: string | null;
  institution?: string | null;
  id?: string | null;
}

interface ComparisonData {
  comparison_type: "country" | "topic" | "institution" | "researcher";
  entities: CompEntity[];
}

interface Props {
  data: ComparisonData;
  onClose: () => void;
}

const METRIC_CONFIG: Record<string, { label: string; format: (v: number) => string }> = {
  researchers: { label: "Researchers", format: fmtBig },
  contributions: { label: "Contributions", format: fmtBig },
  papers: { label: "Papers", format: fmtBig },
  total_citations: { label: "Total citations", format: fmtBig },
  avg_citations: { label: "Avg citations", format: fmtBig },
  avg_paper_citations: { label: "Avg paper citations", format: fmtBig },
  avg_h_index: { label: "Avg h-index", format: v => v.toFixed(1) },
  citations: { label: "Citations", format: fmtBig },
  h_index: { label: "H-index", format: v => String(Math.round(v)) },
  works_count: { label: "Publications", format: fmtBig },
  clusters: { label: "Topic clusters", format: v => String(Math.round(v)) },
};

function fmtBig(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}

function typeLabel(t: string) {
  return {
    country: "Country comparison",
    topic: "Topic comparison",
    institution: "Institution comparison",
    researcher: "Researcher comparison",
  }[t] ?? "Comparison";
}

function metricLabel(metricKey: string, comparisonType: ComparisonData["comparison_type"]) {
  if (metricKey === "researchers" && (comparisonType === "country" || comparisonType === "institution")) {
    return "Contributions";
  }
  return METRIC_CONFIG[metricKey]?.label ?? metricKey;
}

function numericMetric(entity: CompEntity, key: string): number {
  const value = entity.metrics[key];
  return typeof value === "number" ? value : 0;
}

function bestEntity(entities: CompEntity[], key: string): CompEntity | null {
  if (entities.length === 0) return null;
  return entities.reduce((best, current) => numericMetric(current, key) > numericMetric(best, key) ? current : best, entities[0]);
}

function comparisonInsight(type: ComparisonData["comparison_type"], entities: CompEntity[]) {
  if (entities.length === 0) {
    return { title: "Readout", body: "No comparison data is available for this query." };
  }

  const paperLeader = bestEntity(entities, "papers") ?? bestEntity(entities, "contributions");
  const contributionLeader = bestEntity(entities, "contributions") ?? paperLeader;
  const citationLeader = bestEntity(entities, "avg_paper_citations") ?? bestEntity(entities, "total_citations");

  if (type === "country") {
    return {
      title: "Publication-time readout",
      body: `${contributionLeader?.name ?? "The leading country"} has the largest author-affiliation contribution count in this slice. ${citationLeader?.name ?? "The citation leader"} leads on paper citation intensity. Counts use publication-year affiliations, not current researcher locations.`,
    };
  }

  if (type === "institution") {
    return {
      title: "Institution readout",
      body: `${contributionLeader?.name ?? "The leading institution"} has the broadest publication-time output in this comparison. ${citationLeader?.name ?? "The citation leader"} has the stronger average paper citation signal. Institution names are normalized where ROR/OpenAlex matching is available.`,
    };
  }

  if (type === "topic") {
    const axes = Array.from(new Set(entities.map(e => e.matched_axis).filter(Boolean))).join(", ") || "paper facets";
    return {
      title: "Topic readout",
      body: `${paperLeader?.name ?? "The leading topic"} has the largest matched paper set. Matching is based on facet labels across ${axes}; citation values are paper-level metrics, not researcher h-index proxies.`,
    };
  }

  return {
    title: "Researcher readout",
    body: `${citationLeader?.name ?? entities[0].name} currently leads on the strongest available impact metric in this comparison. Researcher metrics come from the researcher profile table.`,
  };
}

export function ComparisonPanel({ data, onClose }: Props) {
  const { comparison_type, entities } = data;
  const colors = entities.map((_, i) => ENTITY_COLORS[i] ?? "#475569");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const metricKeys = useMemo(() => {
    const hasContributions = entities.some(e => typeof e.metrics.contributions === "number");
    const hasAvgPaperCitations = entities.some(e => typeof e.metrics.avg_paper_citations === "number");
    return Object.keys(entities[0]?.metrics ?? {}).filter(k => {
      if ((comparison_type === "country" || comparison_type === "institution" || comparison_type === "topic") && k === "researchers" && hasContributions) return false;
      if ((comparison_type === "country" || comparison_type === "institution" || comparison_type === "topic") && k === "avg_citations" && hasAvgPaperCitations) return false;
      if ((comparison_type === "country" || comparison_type === "institution" || comparison_type === "topic") && k === "avg_h_index") return false;
      const v = entities[0]?.metrics[k];
      return typeof v === "number" && k in METRIC_CONFIG;
    });
  }, [comparison_type, entities]);

  const winnerIndex = useMemo(() => {
    const wins = entities.map(() => 0);
    metricKeys.forEach(key => {
      const values = entities.map(e => typeof e.metrics[key] === "number" ? e.metrics[key] as number : 0);
      const max = Math.max(...values);
      values.forEach((value, index) => {
        if (value === max) wins[index] += 1;
      });
    });
    return wins.indexOf(Math.max(...wins));
  }, [entities, metricKeys]);

  const insight = useMemo(() => comparisonInsight(comparison_type, entities), [comparison_type, entities]);

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle}>
        <header style={headerStyle}>
          <div>
            <h2 style={titleStyle}>{typeLabel(comparison_type)}</h2>
            <p style={subtitleStyle}>
              {entities.map(e => e.name).join(" vs ")}
            </p>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>Close</button>
        </header>

        <section style={entityGridStyle}>
          {entities.map((entity, index) => (
            <div key={entity.key} style={{ ...entityCardStyle, borderTopColor: colors[index] }}>
              <div style={entityNameStyle}>{entity.emoji} {entity.name}</div>
              {comparison_type === "researcher" && (
                <div style={entityMetaStyle}>{entity.field ?? "-"} · {entity.institution ?? "-"}</div>
              )}
              {comparison_type === "topic" && (
                <div style={entityMetaStyle}>
                  axis {entity.matched_axis ?? "-"}{entity.top_cluster ? ` · ${entity.top_cluster}` : ""}
                </div>
              )}
              {(comparison_type === "country" || comparison_type === "institution") && (
                <div style={entityMetaStyle}>top field {(entity.metrics.top_field as string) ?? "-"}</div>
              )}
            </div>
          ))}
        </section>

        <section style={insightStyle}>
          <div style={smallLabelStyle}>{insight.title}</div>
          <p style={insightTextStyle}>{insight.body}</p>
        </section>

        <section style={metricTableStyle}>
          {metricKeys.map(key => {
            const values = entities.map(e => typeof e.metrics[key] === "number" ? e.metrics[key] as number : 0);
            const max = Math.max(...values, 1);
            const best = values.indexOf(Math.max(...values));
            const config = METRIC_CONFIG[key];
            return (
              <div key={key} style={metricRowStyle}>
                <div style={metricNameStyle}>{metricLabel(key, comparison_type)}</div>
                <div style={metricCellsStyle}>
                  {entities.map((entity, index) => {
                    const value = values[index];
                    const pct = (value / max) * 100;
                    return (
                      <div key={entity.key} style={metricCellStyle}>
                        <div style={metricValueLineStyle}>
                          <span style={{ color: index === best ? colors[index] : "#334155" }}>
                            {config.format(value)}
                          </span>
                          {index === best && <strong style={{ color: colors[index] }}>best</strong>}
                        </div>
                        <div style={barTrackStyle}>
                          <div style={{ width: `${pct}%`, height: "100%", background: colors[index] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {(comparison_type === "country" || comparison_type === "institution") && entities.some(e => e.top_researcher) && (
          <section style={contributorGridStyle}>
            {entities.map((entity, index) => entity.top_researcher && (
              <div key={entity.key} style={contributorCardStyle}>
                <div style={smallLabelStyle}>Top contributor</div>
                <strong style={{ color: colors[index] }}>{entity.top_researcher.name}</strong>
                <span>{fmtBig(entity.top_researcher.citations)} citations</span>
              </div>
            ))}
          </section>
        )}

        {winnerIndex >= 0 && (
          <footer style={footerStyle}>
            <span>Overall lead</span>
            <strong style={{ color: colors[winnerIndex] }}>{entities[winnerIndex]?.name}</strong>
          </footer>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "rgba(15, 23, 42, 0.36)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const panelStyle: React.CSSProperties = {
  width: "min(96vw, 980px)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  boxShadow: "0 18px 50px rgba(15, 23, 42, 0.22)",
  color: "#0f172a",
  fontFamily: UI_FONT,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "flex-start",
  borderBottom: "1px solid #e2e8f0",
  padding: "22px 24px",
};

const titleStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 780,
  lineHeight: 1.2,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.45,
  margin: "6px 0 0",
};

const closeButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 740,
  padding: "8px 10px",
};

const entityGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  padding: 18,
};

const entityCardStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#e2e8f0",
  borderTopWidth: 3,
  borderTopStyle: "solid",
  borderTopColor: "#0f766e",
  borderRadius: 10,
  padding: 14,
  background: "#f8fafc",
};

const entityNameStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 17,
  fontWeight: 760,
  lineHeight: 1.3,
};

const entityMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.4,
  marginTop: 6,
};

const insightStyle: React.CSSProperties = {
  margin: "0 18px 14px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "13px 14px",
};

const insightTextStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.55,
  margin: "5px 0 0",
};

const metricTableStyle: React.CSSProperties = {
  display: "grid",
  gap: 0,
  borderTop: "1px solid #e2e8f0",
};

const metricRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px minmax(0, 1fr)",
  gap: 18,
  borderBottom: "1px solid #e2e8f0",
  padding: "15px 18px",
};

const metricNameStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 13,
  fontWeight: 760,
  paddingTop: 3,
};

const metricCellsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const metricCellStyle: React.CSSProperties = {
  minWidth: 0,
};

const metricValueLineStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "#334155",
  fontSize: 14,
  fontWeight: 760,
  marginBottom: 7,
};

const barTrackStyle: React.CSSProperties = {
  height: 6,
  background: "#e2e8f0",
  borderRadius: 6,
  overflow: "hidden",
};

const contributorGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  padding: 18,
  borderBottom: "1px solid #e2e8f0",
};

const contributorCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  color: "#64748b",
  fontSize: 13,
  padding: 13,
};

const smallLabelStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 740,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 14,
  padding: "16px 18px",
};
