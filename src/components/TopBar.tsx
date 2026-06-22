import { useLocation, useNavigate } from "react-router-dom";
import type { Researcher } from "../data/researchers";
import { UniversalSearchBox } from "./UniversalSearchBox";

const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

interface Props {
  onSelect: (r: Researcher) => void;
  visibleCount: number;
}

const navItems = [
  { label: "Papers", path: "/timeline" },
  { label: "Leaderboard", path: "/leaderboard?type=institution" },
  { label: "Lineage", path: "/lineage" },
  { label: "Globe", path: "/globe" },
] as const;

export function TopBar({ onSelect: _onSelect, visibleCount }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <header style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 52,
      zIndex: 20,
      background: "rgba(255,255,255,0.96)",
      borderBottom: "1px solid #dbe3ee",
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "0 22px",
      color: "#0f172a",
    }}>
      <button
        onClick={() => navigate("/")}
        style={{
          background: "transparent",
          border: "none",
          color: "#0f172a",
          cursor: "pointer",
          flexShrink: 0,
          fontFamily: UI_FONT,
          fontSize: 20,
          fontWeight: 760,
          padding: 0,
        }}
      >
        Researcher<span style={{ color: "#0f766e" }}>Hub</span>
      </button>

      {!isHome && (
        <div style={{ flex: "1 1 auto", maxWidth: 620, minWidth: 260 }}>
          <UniversalSearchBox
            variant="compact"
            placeholder="Ask: KAIST 강한 분야, Diffusion 대표 논문, 한국 vs 미국 AI 추이"
          />
        </div>
      )}

      {isHome && <div style={{ flex: "1 1 auto" }} />}

      <nav style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}>
        {navItems.map(item => {
          const path = item.path.split("?")[0];
          const active = location.pathname === path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                background: active ? "#ecfdf5" : "transparent",
                border: active ? "1px solid #99f6e4" : "1px solid transparent",
                borderRadius: 8,
                color: active ? "#0f766e" : "#475569",
                cursor: "pointer",
                fontFamily: UI_FONT,
                fontWeight: active ? 700 : 560,
                fontSize: 14,
                padding: "7px 10px",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {location.pathname === "/globe" && (
        <div style={{
          color: "#64748b",
          flexShrink: 0,
          fontFamily: UI_FONT,
          fontSize: 12,
          minWidth: 78,
          textAlign: "right",
        }}>
          {visibleCount > 0 ? `${visibleCount.toLocaleString()} nodes` : "loading"}
        </div>
      )}
    </header>
  );
}
