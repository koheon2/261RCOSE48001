import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getFieldColor } from "../data/researchers";
import type { Researcher } from "../data/researchers";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

function fmtNum(n: number | null | undefined): string {
  const value = Number(n ?? 0);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function percentileLike(value: number, max: number): number {
  if (!value || !max) return 0;
  return Math.max(4, Math.min(100, (Math.log1p(value) / Math.log1p(max)) * 100));
}

export function ResearcherDNA() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [researcher, setResearcher] = useState<Researcher | null>(null);
  const [related, setRelated] = useState<Researcher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/researchers/${id}`).then(r => r.json()),
      fetch(`${API_BASE}/researchers/${id}/related`).then(r => r.json()),
    ])
      .then(([rData, relData]) => {
        setResearcher(rData);
        setRelated(Array.isArray(relData) ? relData.slice(0, 8) : []);
      })
      .catch(() => {
        setResearcher(null);
        setRelated([]);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const topics = useMemo(() => {
    const raw = (researcher as any)?.topics;
    return Array.isArray(raw) ? raw.filter(Boolean).slice(0, 16) : [];
  }, [researcher]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={stateCardStyle}>연구자 프로필을 불러오는 중입니다.</div>
      </main>
    );
  }

  if (!researcher) {
    return (
      <main style={pageStyle}>
        <div style={stateCardStyle}>
          <strong>연구자를 찾을 수 없습니다.</strong>
          <button onClick={() => navigate(-1)} style={secondaryButtonStyle}>돌아가기</button>
        </div>
      </main>
    );
  }

  const fieldColor = getFieldColor(researcher.field);
  const impactWidth = percentileLike(researcher.citations, 250_000);
  const productivityWidth = percentileLike(researcher.works_count, 800);
  const hIndexWidth = percentileLike(researcher.h_index, 250);

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <button onClick={() => navigate(-1)} style={backButtonStyle}>← Back</button>

        <header style={heroStyle}>
          <div style={avatarStyle}>
            {researcher.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={eyebrowStyle}>Researcher profile</div>
            <h1 style={titleStyle}>{researcher.name}</h1>
            <p style={subtitleStyle}>
              {researcher.institution || "Institution unknown"}
              {researcher.country ? ` · ${researcher.country}` : ""}
            </p>
            <div style={chipRowStyle}>
              <span style={{ ...fieldChipStyle, borderColor: `${fieldColor}55`, color: fieldColor }}>
                {researcher.field || "Unknown field"}
              </span>
              <span style={chipStyle}>OpenAlex ID {researcher.id}</span>
            </div>
          </div>
        </header>

        <section style={metricGridStyle}>
          <Metric label="Citations" value={fmtNum(researcher.citations)} />
          <Metric label="H-index" value={fmtNum(researcher.h_index)} />
          <Metric label="Papers" value={fmtNum(researcher.works_count)} />
          <Metric label="Recent papers" value={fmtNum(researcher.recent_papers)} />
        </section>

        <section style={mainGridStyle}>
          <div style={panelStyle}>
            <SectionHeader title="Impact Snapshot" caption="현재 researcher metadata 기준의 요약 지표입니다." />
            <div style={barStackStyle}>
              <ScoreBar label="Citation impact" value={impactWidth} color="#2563eb" />
              <ScoreBar label="Research output" value={productivityWidth} color="#0f766e" />
              <ScoreBar label="H-index strength" value={hIndexWidth} color="#7c3aed" />
            </div>
          </div>

          <div style={panelStyle}>
            <SectionHeader title="Topic Signals" caption="연구자 record에 연결된 topic 힌트입니다." />
            {topics.length > 0 ? (
              <div style={topicGridStyle}>
                {topics.map((topic, index) => (
                  <span key={`${topic}-${index}`} style={topicChipStyle}>{topic}</span>
                ))}
              </div>
            ) : (
              <EmptyText text="이 연구자에 대한 topic metadata가 아직 충분하지 않습니다." />
            )}
          </div>
        </section>

        <section style={panelStyle}>
          <SectionHeader title="Related Researchers" caption="기존 related researcher API 기반 연결 후보입니다." />
          {related.length > 0 ? (
            <div style={relatedGridStyle}>
              {related.map(r => {
                const color = getFieldColor(r.field);
                return (
                  <Link key={r.id} to={`/researcher/${r.id}`} style={relatedCardStyle}>
                    <span style={{ ...dotStyle, background: color }} />
                    <strong style={relatedNameStyle}>{r.name}</strong>
                    <span style={relatedMetaStyle}>{r.institution || "Unknown institution"}</span>
                    <span style={relatedStatsStyle}>{fmtNum(r.citations)} citations · h {fmtNum(r.h_index)}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyText text="연결 연구자 후보가 없습니다." />
          )}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricCardStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <strong style={metricValueStyle}>{value}</strong>
    </div>
  );
}

function SectionHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <p style={sectionCaptionStyle}>{caption}</p>
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={barHeaderStyle}>
        <span>{label}</span>
        <strong>{Math.round(value)}</strong>
      </div>
      <div style={barTrackStyle}>
        <div style={{ ...barFillStyle, width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div style={emptyTextStyle}>{text}</div>;
}

const pageStyle: React.CSSProperties = {
  background:
    "linear-gradient(rgba(15, 23, 42, 0.045) 1px, transparent 1px), " +
    "linear-gradient(90deg, rgba(15, 23, 42, 0.045) 1px, transparent 1px), #f8fafc",
  backgroundSize: "44px 44px",
  color: "#0f172a",
  fontFamily: UI_FONT,
  position: "absolute",
  inset: "52px 0 0",
  overflowY: "auto",
  padding: "32px 28px 48px",
};

const shellStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
};

const backButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#334155",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 720,
  marginBottom: 16,
  padding: "8px 11px",
};

const heroStyle: React.CSSProperties = {
  alignItems: "center",
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #dbe3ee",
  borderRadius: 16,
  boxShadow: "0 18px 42px rgba(15,23,42,0.08)",
  display: "flex",
  gap: 22,
  padding: 26,
};

const avatarStyle: React.CSSProperties = {
  alignItems: "center",
  background: "#0f172a",
  borderRadius: 18,
  color: "#ffffff",
  display: "flex",
  flexShrink: 0,
  fontSize: 24,
  fontWeight: 820,
  height: 82,
  justifyContent: "center",
  width: 82,
};

const eyebrowStyle: React.CSSProperties = {
  color: "#0f766e",
  fontSize: 13,
  fontWeight: 760,
  letterSpacing: 0,
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 38,
  fontWeight: 820,
  lineHeight: 1.08,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 16,
  lineHeight: 1.5,
  margin: "10px 0 0",
};

const chipRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 14,
};

const chipStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #dbe3ee",
  borderRadius: 999,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 680,
  padding: "6px 9px",
};

const fieldChipStyle: React.CSSProperties = {
  ...chipStyle,
  background: "#ffffff",
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  marginTop: 18,
};

const metricCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
  padding: 18,
};

const metricLabelStyle: React.CSSProperties = {
  color: "#64748b",
  display: "block",
  fontSize: 12,
  fontWeight: 720,
  marginBottom: 8,
};

const metricValueStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 28,
  fontWeight: 820,
};

const mainGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
  gridTemplateColumns: "0.9fr 1.1fr",
  marginTop: 18,
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid #dbe3ee",
  borderRadius: 14,
  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
  padding: 22,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 800,
  margin: 0,
};

const sectionCaptionStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
  margin: "5px 0 0",
};

const barStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const barHeaderStyle: React.CSSProperties = {
  color: "#334155",
  display: "flex",
  fontSize: 13,
  fontWeight: 720,
  justifyContent: "space-between",
  marginBottom: 8,
};

const barTrackStyle: React.CSSProperties = {
  background: "#e2e8f0",
  borderRadius: 999,
  height: 9,
  overflow: "hidden",
};

const barFillStyle: React.CSSProperties = {
  borderRadius: 999,
  height: "100%",
};

const topicGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 9,
};

const topicChipStyle: React.CSSProperties = {
  background: "#eef6ff",
  border: "1px solid #cfe2ff",
  borderRadius: 999,
  color: "#1e3a8a",
  fontSize: 13,
  fontWeight: 680,
  padding: "7px 10px",
};

const relatedGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
};

const relatedCardStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  color: "#0f172a",
  display: "grid",
  gap: 5,
  padding: 14,
  position: "relative",
  textDecoration: "none",
};

const dotStyle: React.CSSProperties = {
  borderRadius: 999,
  height: 8,
  position: "absolute",
  right: 14,
  top: 14,
  width: 8,
};

const relatedNameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 780,
  paddingRight: 18,
};

const relatedMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const relatedStatsStyle: React.CSSProperties = {
  color: "#0f766e",
  fontSize: 12,
  fontWeight: 720,
};

const emptyTextStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  borderRadius: 12,
  color: "#64748b",
  fontSize: 14,
  padding: 18,
};

const stateCardStyle: React.CSSProperties = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 14,
  boxShadow: "0 16px 36px rgba(15,23,42,0.08)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  justifyContent: "center",
  margin: "80px auto 0",
  maxWidth: 520,
  minHeight: 180,
  padding: 24,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...backButtonStyle,
  marginBottom: 0,
};
