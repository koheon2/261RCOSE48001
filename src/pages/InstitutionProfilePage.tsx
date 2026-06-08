import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_BASE = "http://localhost:8000/api";
const PIXEL_FONT = "'Press Start 2P', monospace";
const MONO_FONT = "'Share Tech Mono', monospace";

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
  return String(n);
}

function fieldColor(index: number): string {
  const colors = ["#00d4ff", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa", "#f97316", "#22c55e"];
  return colors[index % colors.length];
}

function MiniTrend({ points, color }: { points: TrendPoint[]; color: string }) {
  const values = points.map(p => p.contributions);
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 34 }}>
      {points.map(p => (
        <div
          key={p.year}
          title={`${p.year}: ${fmtNum(p.contributions)} contributions`}
          style={{
            width: 8,
            height: Math.max(3, (p.contributions / max) * 32),
            background: color,
            opacity: 0.35 + (p.contributions / max) * 0.65,
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

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/institutions/profile?name=${encodeURIComponent(name)}&years=10&top_fields=8&top_papers=6&top_authors=8`)
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
  }, [name]);

  const maxFieldContrib = useMemo(
    () => Math.max(...(profile?.top_fields ?? []).map(f => f.contributions), 1),
    [profile],
  );

  return (
    <div style={{
      position: "absolute", top: 52, left: 0, right: 0, bottom: 0,
      background: "#06080f",
      overflowY: "auto",
      padding: "30px 40px 56px",
    }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          background: "transparent",
          border: "1px solid #1e293b",
          color: "#64748b",
          fontFamily: MONO_FONT,
          fontSize: 12,
          padding: "7px 10px",
          cursor: "pointer",
          marginBottom: 18,
        }}
      >
        BACK
      </button>

      {loading && <div style={emptyStyle}>Loading institution profile...</div>}
      {error && <div style={emptyStyle}>{error}</div>}

      {!loading && profile && (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 28, marginBottom: 28 }}>
            <div>
              <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: "#00d4ff", marginBottom: 12 }}>
                INSTITUTION PROFILE
              </div>
              <h1 style={{
                fontFamily: PIXEL_FONT,
                fontSize: 18,
                lineHeight: 1.5,
                color: "#f8fafc",
                margin: 0,
                letterSpacing: "0.02em",
              }}>
                {profile.institution.name}
              </h1>
              <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
                {profile.institution.institution_ror_id && (
                  <span style={pillStyle}>ROR {profile.institution.institution_ror_id}</span>
                )}
                {profile.institution.institution_match_confidence !== null && (
                  <span style={pillStyle}>MATCH {Math.round(profile.institution.institution_match_confidence * 100)}%</span>
                )}
                <span style={pillStyle}>{profile.institution.raw_alias_count} RAW ALIASES</span>
                <span style={pillStyle}>{profile.quality_policy}</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <Metric label="CONTRIBUTIONS" value={fmtNum(profile.overall.contributions)} color="#00d4ff" />
              <Metric label="PAPERS" value={fmtNum(profile.overall.papers)} color="#34d399" />
              <Metric label="CITATIONS" value={fmtNum(profile.overall.total_citations)} color="#a78bfa" />
            </div>
          </section>

          <section style={{ marginBottom: 34 }}>
            <SectionTitle title="STRONG FIELDS" />
            <div style={{ display: "grid", gap: 8 }}>
              {profile.top_fields.map((field, idx) => {
                const color = fieldColor(idx);
                const pct = (field.contributions / maxFieldContrib) * 100;
                return (
                  <div
                    key={field.field}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 1fr) 110px 110px 140px 120px",
                      gap: 14,
                      alignItems: "center",
                      padding: "12px 14px",
                      borderBottom: "1px solid #0d1421",
                      background: idx < 3 ? `${color}08` : "transparent",
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: MONO_FONT, fontSize: 14, color: "#e2e8f0", marginBottom: 7 }}>
                        {field.field}
                      </div>
                      <div style={{ height: 6, background: "#0f172a", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
                      </div>
                    </div>
                    <NumBlock label="CONTRIB." value={fmtNum(field.contributions)} color="#00d4ff" />
                    <NumBlock label="PAPERS" value={fmtNum(field.papers)} color="#34d399" />
                    <NumBlock label="CITATIONS" value={fmtNum(field.total_citations)} color="#a78bfa" />
                    <MiniTrend points={field.trend} color={color} />
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <div>
              <SectionTitle title="KEY AUTHORS" />
              <div style={{ display: "grid", gap: 8 }}>
                {profile.top_authors.map((author, idx) => (
                  <Link
                    key={author.author_id}
                    to={`/researcher/${author.author_id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "34px 1fr 86px 86px",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: "1px solid #0d1421",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: fieldColor(idx) }}>#{idx + 1}</span>
                    <span style={{ fontFamily: MONO_FONT, fontSize: 13, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {author.name ?? author.author_id}
                    </span>
                    <NumBlock label="CONTRIB." value={fmtNum(author.contributions)} color="#00d4ff" />
                    <NumBlock label="CIT." value={fmtNum(author.total_citations)} color="#a78bfa" />
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <SectionTitle title="REPRESENTATIVE PAPERS" />
              <div style={{ display: "grid", gap: 10 }}>
                {profile.representative_papers.map(paper => (
                  <Link
                    key={paper.id}
                    to={`/papers/${paper.id}`}
                    style={{
                      display: "block",
                      padding: "12px 0",
                      borderBottom: "1px solid #0d1421",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ fontFamily: MONO_FONT, fontSize: 13, lineHeight: 1.35, color: "#dbeafe", marginBottom: 7 }}>
                      {paper.title ?? paper.id}
                    </div>
                    <div style={{ fontFamily: MONO_FONT, fontSize: 11, color: "#64748b" }}>
                      {paper.year ?? "----"} · {fmtNum(paper.citations)} citations · {paper.subfield ?? "unknown field"}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      fontFamily: PIXEL_FONT,
      fontSize: 9,
      color: "#64748b",
      marginBottom: 12,
      letterSpacing: "0.05em",
    }}>
      {title}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ borderTop: `2px solid ${color}`, paddingTop: 10 }}>
      <div style={{ fontFamily: PIXEL_FONT, fontSize: 6, color: "#475569", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: MONO_FONT, fontSize: 26, color }}>{value}</div>
    </div>
  );
}

function NumBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: PIXEL_FONT, fontSize: 5, color: "#334155", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: MONO_FONT, fontSize: 13, color, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: 11,
  color: "#94a3b8",
  border: "1px solid #1e293b",
  padding: "5px 8px",
};

const emptyStyle: React.CSSProperties = {
  fontFamily: "'Share Tech Mono', monospace",
  color: "#64748b",
  padding: "40px 0",
};
