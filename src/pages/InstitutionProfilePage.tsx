import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

interface TrendPoint {
  year: number;
  contributions: number;
  papers: number;
  total_citations: number;
  avg_paper_citations: number;
}

interface InstitutionField {
  field: string;
  contributions: number;
  papers: number;
  total_citations: number;
  avg_paper_citations: number;
  min_year: number | null;
  max_year: number | null;
  trend: TrendPoint[];
}

interface InstitutionAuthor {
  author_id: string;
  name: string | null;
  contributions: number;
  papers: number;
  total_citations: number;
  avg_paper_citations: number;
  min_year: number | null;
  max_year: number | null;
}

interface InstitutionPaper {
  id: string;
  title: string | null;
  year: number | null;
  citations: number;
  fwci: number | null;
  doi: string | null;
  open_access: boolean;
  type: string | null;
  subfield: string | null;
  topic: string | null;
}

interface InstitutionProfile {
  query: string;
  institution: {
    name: string;
    institution_ror_id: string | null;
    openalex_institution_id: string | null;
    institution_match_confidence: number | null;
    institution_normalized: boolean;
    raw_alias_count: number;
  };
  overall: {
    contributions: number;
    papers: number;
    total_citations: number;
  };
  top_fields: InstitutionField[];
  top_authors: InstitutionAuthor[];
  representative_papers: InstitutionPaper[];
  quality_filtered: boolean;
  quality_policy: string;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function fieldColor(index: number): string {
  const colors = ["#0f766e", "#2563eb", "#7c3aed", "#b45309", "#be123c", "#475569", "#0e7490", "#4d7c0f"];
  return colors[index % colors.length];
}

function MiniTrend({ points, color }: { points: TrendPoint[]; color: string }) {
  const values = points.map(p => p.contributions);
  const max = Math.max(...values, 1);
  return (
    <div style={miniTrendStyle}>
      {points.map(p => (
        <div
          key={p.year}
          title={`${p.year}: ${fmtNum(p.contributions)} contributions`}
          style={{
            width: 8,
            height: Math.max(3, (p.contributions / max) * 34),
            background: color,
            opacity: 0.32 + (p.contributions / max) * 0.68,
          }}
        />
      ))}
    </div>
  );
}

export function InstitutionProfilePage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<InstitutionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldLimit, setFieldLimit] = useState(8);
  const [paperLimit, setPaperLimit] = useState(6);
  const [authorLimit, setAuthorLimit] = useState(8);

  useEffect(() => {
    setFieldLimit(8);
    setPaperLimit(6);
    setAuthorLimit(8);
  }, [name]);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/institutions/profile?name=${encodeURIComponent(name)}&years=10&top_fields=${fieldLimit}&top_papers=${paperLimit}&top_authors=${authorLimit}`)
      .then(res => {
        if (!res.ok) throw new Error(`Institution profile failed: ${res.status}`);
        return res.json();
      })
      .then((data: InstitutionProfile) => {
        if (!cancelled) setProfile(data);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [name, fieldLimit, paperLimit, authorLimit]);

  const maxFieldContrib = useMemo(
    () => Math.max(...(profile?.top_fields ?? []).map(f => f.contributions), 1),
    [profile],
  );

  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <button onClick={() => navigate(-1)} style={backButtonStyle}>Back</button>

        {loading && <StateBlock title="Loading institution" body="Building publication-time institution profile." />}
        {error && <StateBlock title="Institution unavailable" body={error} tone="error" />}

        {!loading && profile && (
          <>
            <header style={heroStyle}>
              <div style={{ minWidth: 0 }}>
                <h1 style={titleStyle}>{profile.institution.name}</h1>
                <div style={metaRowStyle}>
                  <span>{profile.institution.institution_normalized ? "Canonical institution" : "Raw institution"}</span>
                  <span>{profile.institution.raw_alias_count} aliases merged</span>
                  <span>{profile.quality_policy}</span>
                  {profile.institution.institution_match_confidence !== null && (
                    <span>{Math.round(profile.institution.institution_match_confidence * 100)}% match</span>
                  )}
                </div>
              </div>
              <div style={metricGridStyle}>
                <Metric label="Contributions" value={fmtNum(profile.overall.contributions)} />
                <Metric label="Papers" value={fmtNum(profile.overall.papers)} />
                <Metric label="Citations" value={fmtNum(profile.overall.total_citations)} />
              </div>
            </header>

            <div style={layoutStyle}>
              <main style={{ minWidth: 0 }}>
                <section style={sectionStyle}>
                  <SectionHeader title="Strong fields" right="publication-time affiliations" />
                  <div style={fieldListStyle}>
                    {profile.top_fields.map((field, idx) => {
                      const color = fieldColor(idx);
                      const pct = (field.contributions / maxFieldContrib) * 100;
                      return (
                        <div key={field.field} style={fieldRowStyle}>
                          <div style={{ minWidth: 0 }}>
                            <div style={fieldTitleStyle}>{field.field}</div>
                            <div style={barTrackStyle}>
                              <div style={{ width: `${pct}%`, height: "100%", background: color }} />
                            </div>
                            <div style={fieldMetaStyle}>
                              {field.min_year ?? "?"}-{field.max_year ?? "?"} · avg {field.avg_paper_citations.toFixed(1)} citations / paper
                            </div>
                          </div>
                          <NumBlock label="Contrib." value={fmtNum(field.contributions)} />
                          <NumBlock label="Papers" value={fmtNum(field.papers)} />
                          <NumBlock label="Citations" value={fmtNum(field.total_citations)} />
                          <MiniTrend points={field.trend} color={color} />
                        </div>
                      );
                    })}
                  </div>
                  {fieldLimit < 20 && (
                    <button onClick={() => setFieldLimit(prev => Math.min(20, prev + 6))} style={showMoreButtonStyle}>
                      Show more fields
                    </button>
                  )}
                </section>

                <section style={sectionStyle}>
                  <SectionHeader title="Representative papers" />
                  <div style={paperListStyle}>
                    {profile.representative_papers.map(paper => (
                      <Link key={paper.id} to={`/papers/${paper.id}`} style={paperRowStyle}>
                        <span style={{ minWidth: 0 }}>
                          <span style={paperTitleStyle}>{paper.title ?? paper.id}</span>
                          <span style={paperMetaStyle}>
                            {paper.year ?? "Year unknown"} · {fmtNum(paper.citations)} citations · {paper.subfield ?? "unknown field"}
                          </span>
                        </span>
                        <span style={paperStatStyle}>{paper.fwci != null ? `FWCI ${paper.fwci.toFixed(1)}` : ""}</span>
                      </Link>
                    ))}
                  </div>
                  {paperLimit < 20 && (
                    <button onClick={() => setPaperLimit(prev => Math.min(20, prev + 6))} style={showMoreButtonStyle}>
                      Show more papers
                    </button>
                  )}
                </section>
              </main>

              <aside style={asideStyle}>
                <section style={sideCardStyle}>
                  <SectionHeader title="Institution identity" compact />
                  <InfoLine label="Query" value={profile.query} />
                  <InfoLine label="ROR" value={profile.institution.institution_ror_id ?? "Not matched"} />
                  <InfoLine label="OpenAlex" value={profile.institution.openalex_institution_id ?? "Not matched"} />
                </section>

                <section style={sideCardStyle}>
                  <SectionHeader title="Key authors" compact />
                  <div style={{ display: "grid", gap: 8 }}>
                    {profile.top_authors.map((author, idx) => (
                      <Link key={author.author_id} to={`/researcher/${author.author_id}`} style={authorRowStyle}>
                        <span style={rankStyle}>{idx + 1}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={authorNameStyle}>{author.name ?? author.author_id}</span>
                          <span style={authorMetaStyle}>
                            {fmtNum(author.contributions)} contributions · {fmtNum(author.total_citations)} citations
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                  {authorLimit < 20 && (
                    <button onClick={() => setAuthorLimit(prev => Math.min(20, prev + 6))} style={showMoreButtonStyle}>
                      Show more authors
                    </button>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, right, compact = false }: { title: string; right?: string; compact?: boolean }) {
  return (
    <div style={compact ? compactSectionHeaderStyle : sectionHeaderStyle}>
      <h2 style={compact ? compactSectionTitleStyle : sectionTitleStyle}>{title}</h2>
      {right && <span style={sectionRightStyle}>{right}</span>}
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

function NumBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={numBlockStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
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
      <h2 style={{ ...sectionTitleStyle, color: tone === "error" ? "#b91c1c" : "#0f172a" }}>{title}</h2>
      <p style={sectionRightStyle}>{body}</p>
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
  maxWidth: 1240,
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
  gridTemplateColumns: "minmax(0, 1fr) 380px",
  gap: 24,
  alignItems: "start",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)",
  marginBottom: 22,
};

const titleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 38,
  fontWeight: 790,
  lineHeight: 1.12,
  margin: 0,
};

const metaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.45,
  marginTop: 12,
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};

const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 330px",
  gap: 24,
  alignItems: "start",
};

const sectionStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  padding: 18,
  marginBottom: 16,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  marginBottom: 14,
};

const compactSectionHeaderStyle: React.CSSProperties = {
  ...sectionHeaderStyle,
  marginBottom: 10,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 22,
  fontWeight: 760,
  lineHeight: 1.2,
  margin: 0,
};

const compactSectionTitleStyle: React.CSSProperties = {
  ...sectionTitleStyle,
  fontSize: 17,
};

const sectionRightStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.4,
};

const fieldListStyle: React.CSSProperties = {
  display: "grid",
  gap: 9,
};

const fieldRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 1fr) 78px 78px 88px 82px",
  gap: 14,
  alignItems: "center",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "13px 14px",
};

const fieldTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 750,
  lineHeight: 1.3,
  marginBottom: 8,
};

const fieldMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  marginTop: 6,
};

const barTrackStyle: React.CSSProperties = {
  height: 5,
  background: "#e2e8f0",
  borderRadius: 6,
  overflow: "hidden",
};

const miniTrendStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 3,
  height: 36,
};

const paperListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const paperRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 78px",
  gap: 12,
  alignItems: "center",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  color: "#0f172a",
  padding: "13px 14px",
  textDecoration: "none",
};

const paperTitleStyle: React.CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 730,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const paperMetaStyle: React.CSSProperties = {
  display: "block",
  color: "#64748b",
  fontSize: 12,
  marginTop: 4,
};

const paperStatStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 750,
  textAlign: "right",
};

const asideStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  position: "sticky",
  top: 76,
};

const sideCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  padding: 16,
};

const authorRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px minmax(0, 1fr)",
  gap: 10,
  alignItems: "center",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 9,
  color: "#0f172a",
  padding: "10px 11px",
  textDecoration: "none",
};

const rankStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 7,
  background: "#e2e8f0",
  color: "#475569",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 760,
};

const authorNameStyle: React.CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 730,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const authorMetaStyle: React.CSSProperties = {
  display: "block",
  color: "#64748b",
  fontSize: 12,
  marginTop: 2,
};

const numBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 3,
  color: "#64748b",
  fontSize: 11,
};

const infoLineStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  borderTop: "1px solid #e2e8f0",
  color: "#64748b",
  fontSize: 12,
  padding: "10px 0",
};

const showMoreButtonStyle: React.CSSProperties = {
  marginTop: 12,
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 760,
  padding: "8px 11px",
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
