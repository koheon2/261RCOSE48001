import { useNavigate } from "react-router-dom";
import type { Researcher } from "../data/researchers";
import { getFieldColor } from "../data/researchers";

const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

interface InfoCardProps {
  researcher: Researcher | null;
  related: Researcher[];
  onClose: () => void;
  onSelect: (r: Researcher) => void;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export function InfoCard({ researcher, related, onClose, onSelect }: InfoCardProps) {
  const navigate = useNavigate();
  if (!researcher) return null;
  const color = getFieldColor(researcher.field);

  return (
    <div style={cardStyle}>
      <header style={{ ...headerStyle, borderTopColor: color }}>
        <div style={{ minWidth: 0 }}>
          <div style={fieldStyle}>{researcher.field ?? "Unknown field"}</div>
          <h2 style={nameStyle}>{researcher.name}</h2>
          <div style={metaStyle}>
            {researcher.institution ?? "Institution unknown"}
            {researcher.country ? ` · ${researcher.country}` : ""}
          </div>
        </div>
        <button onClick={onClose} style={closeStyle}>Close</button>
      </header>

      <div style={statsStyle}>
        <Metric label="Citations" value={fmtNum(researcher.citations)} />
        <Metric label="H-index" value={researcher.h_index.toString()} />
        <Metric label="Recent papers" value={researcher.recent_papers.toString()} />
      </div>

      <div style={actionsStyle}>
        <button onClick={() => navigate(`/researcher/${researcher.id}`)} style={primaryButtonStyle}>Open profile</button>
        {researcher.openalex_url && (
          <a href={researcher.openalex_url} target="_blank" rel="noopener noreferrer" style={secondaryButtonStyle}>
            OpenAlex
          </a>
        )}
      </div>

      {related.length > 0 && (
        <section style={relatedStyle}>
          <div style={sectionTitleStyle}>Related researchers</div>
          <div style={{ display: "grid", gap: 6 }}>
            {related.slice(0, 4).map((r) => {
              const rc = getFieldColor(r.field);
              return (
                <button key={r.id} onClick={() => onSelect(r)} style={relatedRowStyle}>
                  <span style={{ ...dotStyle, background: rc }} />
                  <span style={relatedNameStyle}>{r.name}</span>
                  <span style={relatedStatStyle}>{fmtNum(r.citations)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
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

const cardStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 24,
  left: 24,
  width: 390,
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  boxShadow: "0 16px 44px rgba(15, 23, 42, 0.22)",
  color: "#0f172a",
  fontFamily: UI_FONT,
  userSelect: "none",
  zIndex: 25,
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 12,
  borderTopWidth: 3,
  borderTopStyle: "solid",
  borderTopColor: "#0f766e",
  borderBottom: "1px solid #e2e8f0",
  padding: 16,
};

const fieldStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 750,
  marginBottom: 6,
};

const nameStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 20,
  fontWeight: 780,
  lineHeight: 1.2,
  margin: 0,
};

const metaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.4,
  marginTop: 7,
};

const closeStyle: React.CSSProperties = {
  alignSelf: "start",
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 12,
  fontWeight: 740,
  padding: "7px 9px",
};

const statsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 0,
  borderBottom: "1px solid #e2e8f0",
};

const metricStyle: React.CSSProperties = {
  padding: 13,
  borderRight: "1px solid #e2e8f0",
};

const metricLabelStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 750,
  marginBottom: 5,
};

const metricValueStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 800,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: 14,
  borderBottom: "1px solid #e2e8f0",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #0f172a",
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 750,
  padding: "9px 11px",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 750,
  padding: "9px 11px",
  textDecoration: "none",
};

const relatedStyle: React.CSSProperties = {
  padding: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 13,
  fontWeight: 760,
  marginBottom: 9,
};

const relatedRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "8px minmax(0, 1fr) 52px",
  gap: 9,
  alignItems: "center",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  padding: "8px 9px",
  textAlign: "left",
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
};

const relatedNameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 13,
  fontWeight: 690,
};

const relatedStatStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 720,
  textAlign: "right",
};
