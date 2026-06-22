import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const REFERENCE_PAGE_SIZE = 20;

interface PaperAuthor {
  author_id: string;
  name: string | null;
  institution: string | null;
  country?: string | null;
  position: number;
}

interface PaperFacet {
  facet_type: string;
  facet_value: string;
  source: string;
  confidence: number;
  rank: number;
}

interface QualityFlag {
  flag_type: string;
  severity: string;
  reason: string;
  source: string;
}

interface Affiliation {
  author_id: string;
  author_name: string | null;
  institution_name: string;
  canonical_institution_name: string;
  institution_ror_id: string | null;
  institution_match_confidence: number | null;
  country_code: string;
  position: number;
  confidence: number;
}

interface PaperDetail {
  id: string;
  title: string | null;
  year: number | null;
  citations: number;
  fwci: number | null;
  doi: string | null;
  doi_url: string | null;
  openalex_url: string | null;
  abstract: string | null;
  abstract_available: boolean;
  open_access: boolean;
  type: string | null;
  subfield: string | null;
  topic: string | null;
  authors: PaperAuthor[];
  facets: PaperFacet[];
  quality_flags: QualityFlag[];
  affiliations: Affiliation[];
  quality_filtered: boolean;
  quality_policy: string;
}

interface PaperReferenceSummary {
  paper_id: string;
  total_references: number;
  internal_references: number;
  external_references: number;
  limit?: number;
  offset?: number;
  references: Array<Partial<PaperDetail> & {
    target_openalex_id: string;
    internal: boolean;
    authors?: PaperAuthor[];
  }>;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function axisLabel(axis: string): string {
  if (axis === "aboutness") return "Field";
  if (axis === "method") return "Method";
  if (axis === "task") return "Task";
  if (axis === "application") return "Application";
  return axis;
}

function authorName(author: PaperAuthor): string {
  return author.name || author.author_id || "Unknown author";
}

export function PaperDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [references, setReferences] = useState<PaperReferenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refsLoading, setRefsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refPage, setRefPage] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReferences(null);
    setRefPage(0);

    fetch(`${API_BASE}/papers/${encodeURIComponent(id)}`)
      .then((paperRes) => {
        if (!paperRes.ok) throw new Error(`Paper fetch failed: ${paperRes.status}`);
        return paperRes.json();
      })
      .then((paperJson: PaperDetail) => {
        if (!cancelled) {
          setPaper(paperJson);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setRefsLoading(true);
    fetch(`${API_BASE}/papers/${encodeURIComponent(id)}/references?limit=${REFERENCE_PAGE_SIZE}&offset=${refPage * REFERENCE_PAGE_SIZE}`)
      .then((refsRes) => {
        if (!refsRes.ok) throw new Error(`References fetch failed: ${refsRes.status}`);
        return refsRes.json();
      })
      .then((refsJson: PaperReferenceSummary) => {
        if (!cancelled) setReferences(refsJson);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setRefsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, refPage]);

  const facetsByType = useMemo(() => {
    return (paper?.facets ?? []).reduce<Record<string, PaperFacet[]>>((acc, facet) => {
      if (!acc[facet.facet_type]) acc[facet.facet_type] = [];
      acc[facet.facet_type].push(facet);
      return acc;
    }, {});
  }, [paper]);

  const topAuthors = paper?.authors.slice(0, 4) ?? [];

  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <button onClick={() => navigate(-1)} style={backButtonStyle}>Back</button>

        {loading && <StateBlock title="Loading paper" body="Fetching paper metadata and references." />}
        {!loading && error && <StateBlock title="Paper unavailable" body={error} tone="error" />}

        {!loading && paper && (
          <>
            <header style={heroStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={eyebrowStyle}>
                  <span>{paper.year ?? "Year unknown"}</span>
                  {paper.type && <span>{paper.type}</span>}
                  {paper.open_access && <span>Open access</span>}
                  {!paper.abstract_available && <span>No abstract</span>}
                </div>
                <h1 style={titleStyle}>{paper.title || "(untitled)"}</h1>
                <div style={metaLineStyle}>
                  <span>{paper.subfield ?? "Unknown field"}</span>
                  {paper.topic && <span>{paper.topic}</span>}
                </div>
              </div>

              <div style={heroAsideStyle}>
                <Metric label="Citations" value={fmtNum(paper.citations)} />
                <Metric label="FWCI" value={paper.fwci != null ? paper.fwci.toFixed(2) : "-"} />
                <Metric label="References" value={references ? fmtNum(references.total_references) : "-"} />
              </div>
            </header>

            <div style={actionRowStyle}>
              <Link to={`/papers/${encodeURIComponent(paper.id)}/graph`} style={primaryActionStyle}>
                Citation graph
              </Link>
              {paper.doi_url && (
                <a href={paper.doi_url} target="_blank" rel="noopener noreferrer" style={secondaryActionStyle}>
                  DOI
                </a>
              )}
              {paper.openalex_url && (
                <a href={paper.openalex_url} target="_blank" rel="noopener noreferrer" style={secondaryActionStyle}>
                  OpenAlex
                </a>
              )}
            </div>

            <div style={layoutStyle}>
              <main style={{ minWidth: 0 }}>
                <section style={sectionStyle}>
                  <SectionHeader title="Abstract" />
                  <p style={abstractStyle}>{paper.abstract || "No abstract is available in the local dataset."}</p>
                </section>

                <section style={sectionStyle}>
                  <SectionHeader
                    title="Referenced papers"
                    right={references ? `${references.internal_references} local · ${references.external_references} external` : refsLoading ? "Loading references" : undefined}
                  />
                  {refsLoading && !references ? (
                    <EmptyLine text="Loading references..." />
                  ) : !references || references.references.length === 0 ? (
                    <EmptyLine text="No enriched references for this paper." />
                  ) : (
                    <>
                      <div style={listStyle}>
                        {references.references.map((ref, idx) => (
                          ref.internal && ref.id ? (
                            <Link
                              key={`${ref.target_openalex_id}:${idx}`}
                              to={`/papers/${encodeURIComponent(ref.id)}`}
                              style={referenceRowStyle}
                            >
                              <span style={{ minWidth: 0 }}>
                                <span style={rowTitleStyle}>{ref.title || ref.id}</span>
                                <span style={rowMetaStyle}>
                                  {ref.year || "Year unknown"}
                                  {ref.authors && ref.authors.length > 0
                                    ? ` · ${ref.authors.map((a) => a.name).filter(Boolean).slice(0, 2).join(", ")}`
                                    : ""}
                                </span>
                              </span>
                              <span style={rowStatStyle}>
                                {typeof ref.citations === "number" ? `${fmtNum(ref.citations)} cit` : ""}
                              </span>
                            </Link>
                          ) : (
                            <a
                              key={`${ref.target_openalex_id}:${idx}`}
                              href={`https://openalex.org/${ref.target_openalex_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={referenceRowStyle}
                            >
                              <span style={rowTitleStyle}>{ref.target_openalex_id}</span>
                              <span style={rowStatStyle}>OpenAlex</span>
                            </a>
                          )
                        ))}
                      </div>
                      <PaginationBar
                        page={refPage}
                        pageSize={REFERENCE_PAGE_SIZE}
                        total={references.total_references}
                        shown={references.references.length}
                        loading={refsLoading}
                        onPrev={() => setRefPage(prev => Math.max(0, prev - 1))}
                        onNext={() => setRefPage(prev => prev + 1)}
                      />
                    </>
                  )}
                </section>

                <section style={sectionStyle}>
                  <SectionHeader title="Authors" right={`${paper.authors.length} rows`} />
                  {paper.authors.length === 0 ? (
                    <EmptyLine text="No authors available." />
                  ) : (
                    <div style={listStyle}>
                      {paper.authors.map((author) => (
                        <div key={`${author.author_id}:${author.position}`} style={authorRowStyle}>
                          <span style={rankStyle}>{author.position + 1}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={rowTitleStyle}>{authorName(author)}</span>
                            <span style={rowMetaStyle}>{author.institution || "Institution unknown"}</span>
                          </span>
                          <span style={countryStyle}>{author.country || ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section style={sectionStyle}>
                  <SectionHeader title="Publication-time affiliations" right={`${paper.affiliations.length} rows`} />
                  {paper.affiliations.length === 0 ? (
                    <EmptyLine text="No affiliation rows available." />
                  ) : (
                    <div style={listStyle}>
                      {paper.affiliations.map((aff, idx) => (
                        <div key={`${aff.author_id}:${aff.institution_name}:${idx}`} style={affiliationRowStyle}>
                          <span style={{ minWidth: 0 }}>
                            <span style={rowTitleStyle}>{aff.author_name || aff.author_id}</span>
                            <span style={rowMetaStyle}>
                              {aff.canonical_institution_name || aff.institution_name}
                              {aff.institution_ror_id ? ` · ROR ${aff.institution_ror_id}` : ""}
                            </span>
                          </span>
                          <span style={countryStyle}>{aff.country_code}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </main>

              <aside style={asideStyle}>
                <section style={sideCardStyle}>
                  <SectionHeader title="Authors" compact />
                  {topAuthors.length === 0 ? (
                    <EmptyLine text="No author rows." />
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {topAuthors.map((author) => (
                        <div key={`${author.author_id}:top`} style={compactPersonStyle}>
                          <strong>{authorName(author)}</strong>
                          <span>{author.institution || "Institution unknown"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section style={sideCardStyle}>
                  <SectionHeader title="Facets" compact />
                  {Object.keys(facetsByType).length === 0 ? (
                    <EmptyLine text="No facets." />
                  ) : (
                    <div style={{ display: "grid", gap: 14 }}>
                      {Object.entries(facetsByType).map(([type, facets]) => (
                        <div key={type}>
                          <div style={facetTypeStyle}>{axisLabel(type)}</div>
                          <div style={chipWrapStyle}>
                            {facets.map((facet) => (
                              <Link
                                key={`${facet.facet_type}:${facet.facet_value}:${facet.source}`}
                                to={`/timeline?topic=${encodeURIComponent(facet.facet_value)}&axis=${encodeURIComponent(facet.facet_type)}`}
                                style={chipStyle}
                              >
                                {facet.facet_value}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section style={sideCardStyle}>
                  <SectionHeader title="Quality" compact />
                  <div style={policyStyle}>{paper.quality_filtered ? paper.quality_policy : "unfiltered"}</div>
                  {paper.quality_flags.length === 0 ? (
                    <div style={okStyle}>No local flags</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {paper.quality_flags.map((flag) => (
                        <div key={`${flag.flag_type}:${flag.source}`} style={flagStyle(flag.severity)}>
                          <strong>{flag.severity} · {flag.flag_type}</strong>
                          <span>{flag.reason}</span>
                        </div>
                      ))}
                    </div>
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

function EmptyLine({ text }: { text: string }) {
  return <div style={emptyLineStyle}>{text}</div>;
}

function PaginationBar({
  page,
  pageSize,
  total,
  shown,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = page * pageSize + 1;
  const end = page * pageSize + shown;
  const hasNext = end < total;
  return (
    <div style={paginationStyle}>
      <span style={paginationTextStyle}>
        Showing {shown > 0 ? `${start}-${end}` : "0"} of {fmtNum(total)}
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
  gridTemplateColumns: "minmax(0, 1fr) 330px",
  gap: 24,
  alignItems: "start",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)",
};

const eyebrowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#475569",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 12,
};

const titleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 36,
  fontWeight: 790,
  letterSpacing: 0,
  lineHeight: 1.12,
  margin: 0,
};

const metaLineStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#64748b",
  fontSize: 15,
  lineHeight: 1.5,
  marginTop: 14,
};

const heroAsideStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  margin: "16px 0 24px",
};

const primaryActionStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #0f172a",
  borderRadius: 9,
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 750,
  padding: "10px 13px",
  textDecoration: "none",
};

const secondaryActionStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 750,
  padding: "10px 13px",
  textDecoration: "none",
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
  marginBottom: 12,
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

const abstractStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 15,
  lineHeight: 1.72,
  margin: 0,
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const referenceRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 82px",
  gap: 12,
  alignItems: "center",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 9,
  color: "#0f172a",
  padding: "12px 13px",
  textDecoration: "none",
};

const authorRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) 46px",
  gap: 12,
  alignItems: "center",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 9,
  padding: "11px 12px",
};

const affiliationRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 46px",
  gap: 12,
  alignItems: "center",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 9,
  padding: "11px 12px",
};

const rowTitleStyle: React.CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 720,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const rowMetaStyle: React.CSSProperties = {
  display: "block",
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.4,
  marginTop: 3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const rowStatStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 13,
  fontWeight: 720,
  textAlign: "right",
};

const rankStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 8,
  background: "#e2e8f0",
  color: "#475569",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 760,
};

const countryStyle: React.CSSProperties = {
  color: "#64748b",
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

const compactPersonStyle: React.CSSProperties = {
  display: "grid",
  gap: 3,
  color: "#0f172a",
  fontSize: 13,
  lineHeight: 1.35,
};

const facetTypeStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 750,
  marginBottom: 7,
};

const chipWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const chipStyle: React.CSSProperties = {
  background: "#f1f5f9",
  border: "1px solid #dbe3ee",
  borderRadius: 999,
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
  padding: "5px 8px",
  textDecoration: "none",
};

const policyStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  marginBottom: 10,
};

const okStyle: React.CSSProperties = {
  color: "#0f766e",
  fontSize: 13,
  fontWeight: 720,
};

const flagStyle = (severity: string): React.CSSProperties => ({
  display: "grid",
  gap: 3,
  background: severity === "exclude" ? "#fef2f2" : "#fff7ed",
  border: `1px solid ${severity === "exclude" ? "#fecaca" : "#fed7aa"}`,
  borderRadius: 8,
  color: severity === "exclude" ? "#991b1b" : "#9a3412",
  fontSize: 12,
  lineHeight: 1.35,
  padding: 10,
});

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

const emptyLineStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 9,
  color: "#64748b",
  fontSize: 13,
  padding: 13,
};

const paginationStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 12,
};

const paginationTextStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const pageButtonStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 760,
  padding: "8px 11px",
};

const disabledPageButtonStyle: React.CSSProperties = {
  ...pageButtonStyle,
  color: "#94a3b8",
  cursor: "not-allowed",
  opacity: 0.6,
};

const stateStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  padding: 22,
};
