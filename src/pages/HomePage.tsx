import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UniversalSearchBox } from "../components/UniversalSearchBox";

const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

interface StoryStep {
  key: string;
  title: string;
  lead: string;
  body: string;
  path: string;
  action: string;
  stats: Array<[string, string]>;
  accents: string[];
}

const steps: StoryStep[] = [
  {
    key: "institution",
    title: "기관이 강한 분야를 먼저 봅니다.",
    lead: "KAIST, MIT, Stanford 같은 기관의 연구 포트폴리오를 바로 비교합니다.",
    body: "publication-time affiliation, ROR 정규화, quality filter를 거쳐 현재 소속이 아니라 논문 발표 당시 기준으로 기관의 강점을 계산합니다.",
    path: "/institutions/KAIST",
    action: "KAIST profile",
    stats: [["AI papers", "15.7K"], ["Top field", "Machine Learning"], ["Citations", "1.2M"]],
    accents: ["#0f766e", "#14b8a6", "#99f6e4"],
  },
  {
    key: "papers",
    title: "세부 토픽의 대표 논문과 시간 흐름을 찾습니다.",
    lead: "Diffusion, Transformer, RAG처럼 사용자가 묻는 단위로 논문을 묶습니다.",
    body: "paper facets를 기준으로 대표 논문, 연도별 추이, 인용 영향도를 함께 보여줘 survey 초안을 훑듯이 분야를 파악할 수 있습니다.",
    path: "/timeline?topic=Diffusion&axis=method",
    action: "Diffusion papers",
    stats: [["Topic", "Diffusion"], ["Since", "2017"], ["Sort", "Impact"]],
    accents: ["#2563eb", "#60a5fa", "#bfdbfe"],
  },
  {
    key: "lineage",
    title: "핵심 논문의 계보를 그래프로 봅니다.",
    lead: "단순 top-k 추천이 아니라 여러 논문의 공통 기반 연구를 드러냅니다.",
    body: "citation edge를 이용해 seed paper, common ancestor, foundation paper를 나눠 보여주고 분야가 어떤 논문 위에서 성장했는지 설명합니다.",
    path: "/lineage?topic=rag&axis=method",
    action: "Lineage graph",
    stats: [["Topic", "RAG"], ["Seeds", "8"], ["Mode", "Multi-seed"]],
    accents: ["#7c3aed", "#a78bfa", "#ddd6fe"],
  },
  {
    key: "globe",
    title: "마지막으로 연구 생태계를 지도에서 훑습니다.",
    lead: "국가와 도시 단위의 연구자 분포를 시각적으로 확인합니다.",
    body: "Globe는 첫 화면이 아니라 탐색 모드입니다. 분석 결과를 본 뒤 전체 분포를 확인하는 보조 시각화로 사용합니다.",
    path: "/globe",
    action: "Research globe",
    stats: [["Researchers", "3.2M"], ["Mode", "Global"], ["View", "Map"]],
    accents: ["#ea580c", "#fb923c", "#fed7aa"],
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = steps[activeIndex];
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);

  const sectionMarkers = useMemo(
    () => steps.map((step, index) => ({ key: step.key, index })),
    [],
  );

  const handleScroll = () => {
    const viewportAnchor = window.innerHeight * 0.38;
    let nextIndex = 0;
    sectionRefs.current.forEach((node, index) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.top <= viewportAnchor) nextIndex = index;
    });
    if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
  };

  return (
    <main
      className="home-page"
      onScroll={handleScroll}
      style={{
        position: "absolute",
        top: 52,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: "auto",
        color: "#0f172a",
      }}
    >
      <section style={{
        position: "relative",
        zIndex: 1,
        minHeight: "calc(100vh - 52px)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 430px",
        gap: 48,
        alignItems: "center",
        maxWidth: 1220,
        margin: "0 auto",
        padding: "64px 48px 48px",
      }}>
        <div>
          <div style={{
            fontFamily: UI_FONT,
            fontSize: 13,
            fontWeight: 700,
            color: "#0f766e",
            marginBottom: 18,
            letterSpacing: 0,
          }}>
            RESEARCHERHUB
          </div>
          <h1 style={{
            fontFamily: UI_FONT,
            fontSize: 68,
            fontWeight: 780,
            lineHeight: 0.98,
            color: "#0f172a",
            margin: "0 0 24px",
            maxWidth: 760,
          }}>
            AI research intelligence map
          </h1>
          <p style={{
            fontFamily: UI_FONT,
            fontSize: 21,
            lineHeight: 1.55,
            color: "#475569",
            maxWidth: 760,
            margin: "0 0 28px",
          }}>
            논문, 연구자, 기관, 인용 관계를 연결해 AI 연구 흐름을 탐색합니다.
            검색 결과를 나열하는 대신 연구 생태계의 구조와 변화를 보여줍니다.
          </p>
          <div style={{ maxWidth: 760 }}>
            <UniversalSearchBox
              variant="hero"
              placeholder="한국과 미국의 Diffusion 연구 흐름 비교해줘"
            />
          </div>
        </div>

        <HeroAnalysisPanel onOpen={(path) => navigate(path)} />
      </section>

      <section style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 1220,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 480px",
        gap: 48,
        padding: "12px 48px 90px",
      }}>
        <div>
          {steps.map((step, index) => (
            <article
              key={step.key}
              ref={(node) => { sectionRefs.current[index] = node; }}
              style={{
                minHeight: "76vh",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                borderTop: "1px solid #dbe3ee",
                padding: "64px 0",
              }}
            >
              <div style={{
                fontFamily: UI_FONT,
                fontSize: 13,
                fontWeight: 700,
                color: step.accents[0],
                marginBottom: 18,
                letterSpacing: 0,
              }}>
                {String(index + 1).padStart(2, "0")} / {steps.length.toString().padStart(2, "0")}
              </div>
              <h2 style={{
                fontFamily: UI_FONT,
                fontSize: 44,
                fontWeight: 760,
                lineHeight: 1.12,
                color: "#0f172a",
                margin: "0 0 18px",
                maxWidth: 680,
              }}>
                {step.title}
              </h2>
              <p style={{
                fontFamily: UI_FONT,
                fontSize: 20,
                lineHeight: 1.45,
                color: "#334155",
                margin: "0 0 14px",
                maxWidth: 720,
              }}>
                {step.lead}
              </p>
              <p style={{
                fontFamily: UI_FONT,
                fontSize: 16,
                lineHeight: 1.6,
                color: "#64748b",
                margin: "0 0 24px",
                maxWidth: 700,
              }}>
                {step.body}
              </p>
              <button
                onClick={() => navigate(step.path)}
                style={{
                  ...secondaryButtonStyle,
                  width: "fit-content",
                  borderColor: step.accents[0],
                  color: step.accents[0],
                }}
              >
                Open {step.action}
              </button>
            </article>
          ))}
        </div>

        <aside style={{
          position: "sticky",
          top: 84,
          height: "calc(100vh - 116px)",
          display: "flex",
          alignItems: "center",
        }}>
          <div style={{
            width: "100%",
            background: "#ffffff",
            border: "1px solid #dbe3ee",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
            padding: 22,
          }}>
            <div style={{
              display: "flex",
              gap: 8,
              marginBottom: 18,
            }}>
              {sectionMarkers.map(marker => (
                <button
                  key={marker.key}
                  onClick={() => sectionRefs.current[marker.index]?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  aria-label={`Go to ${marker.key}`}
                  style={{
                    height: 7,
                    flex: 1,
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    background: marker.index === activeIndex ? active.accents[0] : "#e2e8f0",
                  }}
                />
              ))}
            </div>
            <DynamicPreview step={active} />
          </div>
        </aside>
      </section>
    </main>
  );
}

function HeroAnalysisPanel({ onOpen }: { onOpen: (path: string) => void }) {
  const analyses = [
    {
      title: "KAIST가 강한 AI 분야",
      body: "기관의 강점 분야, 대표 논문, 핵심 연구자를 한 번에 봅니다.",
      path: "/institutions/KAIST",
      color: "#0f766e",
    },
    {
      title: "Diffusion 대표 논문",
      body: "세부 토픽의 대표 논문과 연도별 흐름을 탐색합니다.",
      path: "/timeline?topic=Diffusion&axis=method",
      color: "#2563eb",
    },
    {
      title: "RAG 연구 계보",
      body: "분야를 만든 기반 논문과 공통 인용 구조를 확인합니다.",
      path: "/lineage?topic=rag&axis=method",
      color: "#7c3aed",
    },
  ];

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #dbe3ee",
      borderRadius: 12,
      padding: 24,
      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    }}>
      <div style={{
        fontFamily: UI_FONT,
        fontSize: 14,
        fontWeight: 760,
        color: "#0f172a",
        marginBottom: 14,
      }}>
        추천 분석
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {analyses.map((item) => (
          <button
            key={item.path}
            onClick={() => onOpen(item.path)}
            style={{
              background: "#f8fafc",
              border: "1px solid #dbe3ee",
              borderRadius: 10,
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "10px 1fr",
              gap: 12,
              padding: "15px 14px",
              textAlign: "left",
            }}
          >
            <span style={{
              width: 10,
              height: 10,
              borderRadius: 10,
              background: item.color,
              marginTop: 5,
            }} />
            <span>
              <span style={{
                display: "block",
                fontFamily: UI_FONT,
                fontSize: 16,
                fontWeight: 720,
                color: "#0f172a",
                marginBottom: 5,
              }}>
                {item.title}
              </span>
              <span style={{
                display: "block",
                fontFamily: UI_FONT,
                fontSize: 13,
                lineHeight: 1.45,
                color: "#64748b",
              }}>
                {item.body}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div style={{
        marginTop: 18,
        borderTop: "1px solid #dbe3ee",
        paddingTop: 18,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
      }}>
        {[
          ["Researchers", "3.2M"],
          ["Papers", "23M"],
          ["Relations", "35M"],
        ].map(([label, value]) => (
          <div key={label} style={{
            background: "#ffffff",
            border: "1px solid #dbe3ee",
            borderRadius: 9,
            padding: "11px 9px",
          }}>
            <div style={{
              fontFamily: UI_FONT,
              fontSize: 12,
              color: "#64748b",
              marginBottom: 5,
            }}>
              {label}
            </div>
            <div style={{
            fontFamily: UI_FONT,
              fontSize: 19,
              fontWeight: 760,
            color: "#0f172a",
          }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DynamicPreview({ step }: { step: StoryStep }) {
  const [primary, secondary, pale] = step.accents;
  return (
    <div>
      <div style={{
        fontFamily: UI_FONT,
        fontSize: 13,
        fontWeight: 700,
        color: primary,
        marginBottom: 14,
        letterSpacing: 0,
      }}>
        LIVE VIEW
      </div>
      <div style={{
        border: "1px solid #dbe3ee",
        borderRadius: 10,
        background: "#f8fafc",
        overflow: "hidden",
      }}>
        <div style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
          borderBottom: "1px solid #dbe3ee",
          background: "#ffffff",
        }}>
          <span style={{ width: 9, height: 9, borderRadius: 9, background: primary }} />
          <span style={{ width: 9, height: 9, borderRadius: 9, background: secondary }} />
          <span style={{ width: 9, height: 9, borderRadius: 9, background: pale }} />
          <span style={{ marginLeft: "auto", fontFamily: UI_FONT, fontSize: 12, color: "#64748b" }}>{step.key}</span>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{
            fontFamily: UI_FONT,
            fontWeight: 720,
            fontSize: 23,
            lineHeight: 1.2,
            color: "#0f172a",
            marginBottom: 18,
          }}>
            {step.action}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
            {step.stats.map(([label, value]) => (
              <div key={label} style={{
                background: "#ffffff",
                border: "1px solid #dbe3ee",
                borderRadius: 8,
                padding: "10px 9px",
              }}>
                <div style={{ fontFamily: UI_FONT, fontSize: 12, color: "#64748b", marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: UI_FONT, fontSize: 19, fontWeight: 720, color: primary }}>{value}</div>
              </div>
            ))}
          </div>
          <PreviewGraphic stepKey={step.key} primary={primary} secondary={secondary} pale={pale} />
        </div>
      </div>
    </div>
  );
}

function PreviewGraphic({ stepKey, primary, secondary, pale }: { stepKey: string; primary: string; secondary: string; pale: string }) {
  if (stepKey === "lineage") {
    return (
      <svg viewBox="0 0 420 210" style={{ width: "100%", display: "block" }}>
        {[40, 120, 220, 330].map((x) => (
          <line key={x} x1={x} y1={24} x2={x} y2={190} stroke="#dbe3ee" strokeDasharray="4 6" />
        ))}
        <path d="M64 160 C130 140, 150 112, 210 96 C260 82, 282 72, 342 58" fill="none" stroke={primary} strokeWidth="2" />
        <path d="M84 136 C150 132, 176 126, 250 122 C292 120, 324 116, 364 100" fill="none" stroke={secondary} strokeWidth="2" opacity="0.8" />
        {[[64,160,pale],[84,136,pale],[210,96,secondary],[250,122,secondary],[342,58,primary],[364,100,primary]].map(([x,y,c], i) => (
          <circle key={i} cx={x as number} cy={y as number} r={i > 3 ? 11 : 8} fill={c as string} stroke="#ffffff" strokeWidth="2" />
        ))}
      </svg>
    );
  }

  if (stepKey === "globe") {
    return (
      <div style={{
        height: 210,
        border: "1px solid #dbe3ee",
        borderRadius: 10,
        background: `radial-gradient(circle at 50% 48%, ${pale} 0 30%, #ffffff 31% 36%, #e2e8f0 37% 38%, #f8fafc 39%)`,
        position: "relative",
      }}>
        {[[32,52],[58,38],[66,64],[45,72],[70,28]].map(([left, top], i) => (
          <span key={i} style={{
            position: "absolute",
            left: `${left}%`,
            top: `${top}%`,
            width: i === 0 ? 14 : 9,
            height: i === 0 ? 14 : 9,
            borderRadius: 14,
            background: i === 0 ? primary : secondary,
            border: "2px solid #ffffff",
          }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 9 }}>
      {[0.94, 0.72, 0.56, 0.42].map((width, index) => (
        <div key={index} style={{
          height: 34,
          border: "1px solid #dbe3ee",
          borderRadius: 8,
          background: "#ffffff",
          overflow: "hidden",
        }}>
          <div style={{
            width: `${width * 100}%`,
            height: "100%",
            background: index === 0 ? primary : index === 1 ? secondary : pale,
            opacity: index === 3 ? 0.72 : 1,
          }} />
        </div>
      ))}
    </div>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontWeight: 650,
  fontSize: 16,
  padding: "12px 16px",
};
