import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ComparisonPanel } from "./ComparisonPanel";

interface UniversalResult {
  intent: "researcher_search" | "topic_map" | "benchmark" | "stats" | "comparison" | "trending" | "progress" | "leaderboard" | "researcher_dna" | "institution_profile";
  params: Record<string, string>;
  explanation: string;
  redirect: string | null;
  answer: number | null;
  answer_label: string | null;
}

interface Props {
  variant?: "hero" | "compact";
  placeholder?: string;
  initialValue?: string;
}

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

export function UniversalSearchBox({
  variant = "compact",
  placeholder,
  initialValue = "",
}: Props) {
  const [query, setQuery] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UniversalResult | null>(null);
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const isHero = variant === "hero";

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/search/universal?q=${encodeURIComponent(q)}`);
      const data: UniversalResult = await res.json();
      setResult(data);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (data.intent === "comparison") {
        const { comparison_type, entities } = data.params;
        fetch(`${API_BASE}/compare?type=${comparison_type}&entities=${encodeURIComponent(entities)}`)
          .then(r => r.json())
          .then(cd => {
            setComparisonData(cd);
            setResult(null);
            setQuery("");
          })
          .catch(() => {});
      } else if (data.intent === "stats") {
        timeoutRef.current = setTimeout(() => {
          setQuery("");
          setResult(null);
        }, 6000);
      } else if (data.redirect) {
        timeoutRef.current = setTimeout(() => {
          const params = new URLSearchParams(data.params).toString();
          navigate(data.redirect + (params ? `?${params}` : ""));
          setQuery("");
          setResult(null);
        }, isHero ? 900 : 650);
      }
    } catch {
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }, [isHero, navigate]);

  const boxStyle: React.CSSProperties = isHero
    ? {
        background: "#ffffff",
        border: `1px solid ${loading ? "#7c3aed" : result ? "#0f766e" : "#cbd5e1"}`,
        borderRadius: 16,
        boxShadow: "0 14px 38px rgba(15, 23, 42, 0.11)",
        display: "flex",
        alignItems: "center",
        minHeight: 72,
        padding: "0 12px 0 18px",
      }
    : {
        background: "#f8fafc",
        border: `1px solid ${loading ? "#7c3aed" : result ? "#0f766e" : "#cbd5e1"}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        height: 36,
        padding: "0 8px 0 10px",
      };

  return (
    <>
      {comparisonData && (
        <ComparisonPanel
          data={comparisonData}
          onClose={() => setComparisonData(null)}
        />
      )}
      <div style={{ position: "relative", width: "100%" }}>
        <div style={boxStyle}>
          <span style={{
            color: loading ? "#7c3aed" : "#0f766e",
            flexShrink: 0,
            fontFamily: UI_FONT,
            fontSize: isHero ? 15 : 12,
            fontWeight: 760,
            marginRight: isHero ? 12 : 8,
          }}>
            Ask
          </span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") runSearch(query);
            }}
            placeholder={placeholder ?? (isHero
              ? "KAIST가 강한 AI 분야는?"
              : "Ask about AI research...")}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: "#0f172a",
              flex: 1,
              fontFamily: UI_FONT,
              fontSize: isHero ? 22 : 14,
              fontWeight: isHero ? 520 : 450,
              outline: "none",
              padding: isHero ? "18px 8px" : "8px 4px",
              minWidth: 0,
            }}
          />
          <button
            onClick={() => runSearch(query)}
            disabled={loading || !query.trim()}
            style={{
              background: query.trim() ? "#0f172a" : "#e2e8f0",
              border: "none",
              borderRadius: isHero ? 12 : 7,
              color: query.trim() ? "#ffffff" : "#94a3b8",
              cursor: query.trim() ? "pointer" : "default",
              flexShrink: 0,
              fontFamily: UI_FONT,
              fontSize: isHero ? 15 : 12,
              fontWeight: 700,
              padding: isHero ? "13px 16px" : "7px 9px",
            }}
          >
            {loading ? "..." : "Enter"}
          </button>
        </div>

        {result && (
          <div style={{
            position: "absolute",
            top: `calc(100% + ${isHero ? 10 : 6}px)`,
            left: 0,
            right: 0,
            background: "#ffffff",
            border: "1px solid #dbe3ee",
            borderRadius: isHero ? 12 : 8,
            boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
            padding: isHero ? "16px 18px" : "12px 14px",
            zIndex: 40,
          }}>
            {result.intent === "stats" ? (
              <>
                <div style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 700, color: "#0f766e", marginBottom: 8 }}>
                  Answer
                </div>
                {result.answer != null ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: UI_FONT, fontSize: isHero ? 28 : 24, color: "#0f172a", fontWeight: 760 }}>
                      {result.answer.toLocaleString()}
                    </span>
                    <span style={{ fontFamily: UI_FONT, fontSize: 12, color: "#0f766e" }}>
                      {result.answer_label}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontFamily: UI_FONT, fontSize: 12, color: "#64748b" }}>조회 실패</div>
                )}
                <div style={{ fontFamily: UI_FONT, fontSize: 13, color: "#64748b", marginTop: 6 }}>
                  {result.explanation}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: UI_FONT, fontSize: 13, fontWeight: 700, color: "#0f766e", marginBottom: 6 }}>
                  {result.intent.replace("_", " ")} → {(result.redirect ?? "/").replace("/", "") || "home"}
                </div>
                <div style={{ fontFamily: UI_FONT, fontSize: 13, color: "#475569" }}>
                  {result.explanation}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
