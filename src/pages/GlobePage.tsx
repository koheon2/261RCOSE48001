import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { CesiumGlobe } from "../components/CesiumGlobe";
import { InfoCard }    from "../components/InfoCard";
import type { Researcher } from "../data/researchers";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

type TileStyle = "dark" | "light" | "voyager";

interface Props {
  selected:    Researcher | null;
  onSelect:    (r: Researcher | null) => void;
  visibleCount: number;
  onCountChange: (n: number) => void;
}

export function GlobePage({ selected, onSelect, visibleCount, onCountChange }: Props) {
  const [activeField, setActiveField]   = useState<string | null>(null);
  const [tileStyle]                     = useState<TileStyle>("voyager");
  const [related, setRelated]           = useState<Researcher[]>([]);
  const [filterCountry, setFilterCountry] = useState<string | null>(null);
  const [focusCity, setFocusCity]       = useState<string | null>(null);
  const [filterLabel, setFilterLabel]   = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [highlightedResearchers, setHighlightedResearchers] = useState<Researcher[]>([]);

  // Parse URL params: highlight, field, country, city
  useEffect(() => {
    const hlParam  = searchParams.get("highlight");
    const field    = searchParams.get("field");
    const country  = searchParams.get("country");
    const city     = searchParams.get("city");

    if (hlParam) {
      setHighlightIds(hlParam.split(",").filter(Boolean));
    } else {
      setHighlightIds([]);
      setHighlightedResearchers([]);
    }

    if (field)   setActiveField(field);
    if (country) setFilterCountry(country.toUpperCase());
    if (city)    setFocusCity(city);

    // Build human-readable filter label
    const parts = [];
    if (field)   parts.push(field);
    if (city)    parts.push(city);
    else if (country) parts.push(country.toUpperCase());
    setFilterLabel(parts.length > 0 ? parts.join(" · ") : null);
  }, [searchParams]);

  // Fetch highlighted researchers from backend
  useEffect(() => {
    if (highlightIds.length === 0) {
      setHighlightedResearchers([]);
      return;
    }
    fetch(`${API_BASE}/researchers/by-openalex-ids?ids=${highlightIds.join(",")}`)
      .then(r => r.json())
      .then((data: Researcher[]) => setHighlightedResearchers(data))
      .catch(() => setHighlightedResearchers([]));
  }, [highlightIds]);

  // Clear all filters
  const clearAll = useCallback(() => {
    setHighlightIds([]);
    setHighlightedResearchers([]);
    setActiveField(null);
    setFilterCountry(null);
    setFocusCity(null);
    setFilterLabel(null);
    setSearchParams({});
  }, [setSearchParams]);

  useEffect(() => {
    if (!selected) { setRelated([]); return; }
    fetch(`${API_BASE}/researchers/${selected.id}/related`)
      .then((r) => r.json())
      .then(setRelated)
      .catch(() => setRelated([]));
  }, [selected?.id]);

  return (
    <>
      <div style={globeBackdropStyle} />
      <CesiumGlobe
        selected={selected}
        related={related}
        onSelect={onSelect}
        activeField={activeField}
        filterCountry={filterCountry}
        focusCity={focusCity}
        tileStyle={tileStyle}
        onCountChange={onCountChange}
        highlightIds={highlightIds}
        highlightedResearchers={highlightedResearchers}
      />

      <InfoCard
        researcher={selected}
        related={related}
        onClose={() => onSelect(null)}
        onSelect={onSelect}
      />

      <div style={mapHeaderStyle}>
        <div>
          <h1 style={mapTitleStyle}>Researcher Globe</h1>
          <div style={mapMetaStyle}>
            {visibleCount.toLocaleString()} visible researchers
            {filterLabel ? ` · ${filterLabel}` : ""}
            {highlightedResearchers.length > 0 ? ` · ${highlightedResearchers.length} highlighted` : ""}
          </div>
        </div>
        {(filterLabel || highlightedResearchers.length > 0) && (
          <button onClick={clearAll} style={clearButtonStyle}>Clear</button>
        )}
      </div>

      {!selected && highlightedResearchers.length === 0 && (
        <div style={hintStyle}>
          Click a researcher · Drag to rotate · Scroll to zoom
        </div>
      )}
    </>
  );
}

const mapHeaderStyle: React.CSSProperties = {
  position: "absolute",
  top: 64,
  left: 24,
  zIndex: 20,
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  background: "rgba(255, 255, 255, 0.92)",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  boxShadow: "0 12px 34px rgba(15, 23, 42, 0.18)",
  color: "#0f172a",
  fontFamily: UI_FONT,
  padding: "14px 16px",
  minWidth: 280,
};

const globeBackdropStyle: React.CSSProperties = {
  position: "absolute",
  inset: "52px 0 0",
  pointerEvents: "none",
  zIndex: 0,
  background:
    "radial-gradient(circle at 50% 48%, rgba(15, 23, 42, 0.12) 0 24%, rgba(15, 23, 42, 0.045) 35%, transparent 56%), " +
    "linear-gradient(115deg, transparent 0 46%, rgba(15, 118, 110, 0.035) 46% 46.22%, transparent 46.22% 100%), " +
    "linear-gradient(rgba(15, 23, 42, 0.045) 1px, transparent 1px), " +
    "linear-gradient(90deg, rgba(15, 23, 42, 0.045) 1px, transparent 1px), #f8fafc",
  backgroundSize: "100% 100%, 100% 100%, 44px 44px, 44px 44px, auto",
};

const mapTitleStyle: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.2,
  fontWeight: 780,
  margin: 0,
};

const mapMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.4,
  marginTop: 5,
};

const clearButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 740,
  padding: "7px 9px",
};

const hintStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 20,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(255, 255, 255, 0.9)",
  border: "1px solid #dbe3ee",
  borderRadius: 999,
  color: "#475569",
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 650,
  padding: "8px 12px",
  pointerEvents: "none",
  whiteSpace: "nowrap",
  zIndex: 10,
};
