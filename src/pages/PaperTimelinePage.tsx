import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const API_BASE = "http://localhost:8000/api";
const UI_FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const PAPER_SEARCH_PAGE_SIZE = 20;

interface TopicOption {
  facet_type: string;
  topic: string;
  paper_count: number;
  total_citations: number;
  min_year: number | null;
  max_year: number | null;
}

interface Author {
  author_id: string;
  name: string | null;
  institution: string | null;
  position: number;
}

interface Paper {
  id: string;
  title: string | null;
  year: number;
  citations: number;
  fwci: number | null;
  doi: string | null;
  abstract: string | null;
  open_access: boolean;
  type: string | null;
  authors: Author[];
}

interface YearGroup {
  year: number;
  papers: Paper[];
}

interface TimelineResponse {
  topic: string;
  query?: string;
  matched_axes?: string[];
  per_year: number;
  min_fwci: number;
  papers: Paper[];
  by_year: YearGroup[];
}

interface RepresentativeResponse {
  topic: string | null;
  query: string | null;
  matched_axes: string[];
  match_kind: string;
  sort: string;
  limit: number;
  papers: Paper[];
}

interface PaperSearchResponse {
  query: string;
  limit: number;
  offset?: number;
  papers: Paper[];
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function axisLabel(axis?: string): string {
  if (axis === "aboutness") return "Topic";
  if (axis === "method") return "Method";
  if (axis === "task") return "Task";
  if (axis === "application") return "Application";
  if (axis === "specific") return "Specific";
  return "Topic";
}

function axisColor(axis?: string): string {
  if (axis === "method") return "#2563eb";
  if (axis === "task") return "#7c3aed";
  if (axis === "application") return "#0f766e";
  if (axis === "specific") return "#ea580c";
  return "#475569";
}

function authorLine(paper: Paper): string {
  const names = paper.authors.map(a => a.name).filter(Boolean).slice(0, 3);
  if (names.length === 0) return "Authors on detail page";
  const suffix = paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : "";
  return `${names.join(", ")}${suffix}`;
}

export function PaperTimelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTopic = searchParams.get("topic") || "";
  const initialAxis = searchParams.get("axis") || "";
  const initialSearch = searchParams.get("search") || searchParams.get("q") || "";

  const [mode, setMode] = useState<"topic" | "paper">(initialSearch ? "paper" : "topic");
  const [topicQuery, setTopicQuery] = useState(initialTopic);
  const [topicSuggestions, setTopicSuggestions] = useState<TopicOption[]>([]);
  const [paperQuery, setPaperQuery] = useState(initialSearch);
  const [paperResults, setPaperResults] = useState<Paper[]>([]);
  const [paperSearchLoading, setPaperSearchLoading] = useState(false);
  const [paperPage, setPaperPage] = useState(0);
  const [paperHasNext, setPaperHasNext] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string>(initialTopic);
  const [selectedAxis, setSelectedAxis] = useState<string>(initialAxis);
  const [perYear, setPerYear] = useState(3);
  const [minFwci, setMinFwci] = useState(2.0);
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [representative, setRepresentative] = useState<RepresentativeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [representativeLoading, setRepresentativeLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicCacheRef = useRef<Map<string, TopicOption[]>>(new Map());
  const topicAbortRef = useRef<AbortController | null>(null);
  const topicRequestRef = useRef(0);
  const paperAbortRef = useRef<AbortController | null>(null);
  const paperRequestRef = useRef(0);

  const fetchTopics = useCallback(async (q: string) => {
    const query = q.trim();
    const cacheKey = query.toLowerCase();
    const cached = topicCacheRef.current.get(cacheKey);
    if (cached) {
      setTopicSuggestions(cached);
      return;
    }

    topicAbortRef.current?.abort();
    const controller = new AbortController();
    topicAbortRef.current = controller;
    const requestId = ++topicRequestRef.current;

    try {
      const url = query
        ? `${API_BASE}/papers/topics?q=${encodeURIComponent(query)}&limit=30`
        : `${API_BASE}/papers/topics?limit=30`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Topic search failed: ${res.status}`);
      const json: TopicOption[] = await res.json();
      topicCacheRef.current.set(cacheKey, json);
      if (requestId === topicRequestRef.current) setTopicSuggestions(json);
    } catch (e) {
      const error = e as Error;
      if (error.name === "AbortError") return;
      if (requestId === topicRequestRef.current) setTopicSuggestions([]);
    }
  }, []);

  const searchPapers = useCallback(async (q: string, page = 0) => {
    const query = q.trim();
    paperAbortRef.current?.abort();
    if (query.length < 2) {
      setPaperResults([]);
      setPaperHasNext(false);
      setPaperSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    paperAbortRef.current = controller;
    const requestId = ++paperRequestRef.current;
    setPaperSearchLoading(true);

    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(PAPER_SEARCH_PAGE_SIZE + 1),
        offset: String(page * PAPER_SEARCH_PAGE_SIZE),
      });
      const res = await fetch(`${API_BASE}/papers/search?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Paper search failed: ${res.status}`);
      const json: PaperSearchResponse = await res.json();
      if (requestId === paperRequestRef.current) {
        setPaperResults(json.papers.slice(0, PAPER_SEARCH_PAGE_SIZE));
        setPaperHasNext(json.papers.length > PAPER_SEARCH_PAGE_SIZE);
      }
    } catch (e) {
      const error = e as Error;
      if (error.name === "AbortError") return;
      if (requestId === paperRequestRef.current) {
        setPaperResults([]);
        setPaperHasNext(false);
      }
    } finally {
      if (requestId === paperRequestRef.current) setPaperSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics("");
  }, [fetchTopics]);

  useEffect(() => {
    const nextSearch = searchParams.get("search") || searchParams.get("q") || "";
    if (!nextSearch) return;
    setMode("paper");
    setPaperQuery(nextSearch);
    setPaperPage(0);
    searchPapers(nextSearch, 0);
  }, [searchParams, searchPapers]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      topicAbortRef.current?.abort();
      paperAbortRef.current?.abort();
    };
  }, []);

  const fetchTimeline = useCallback(async (topic: string, axis: string) => {
    if (!topic) return;
    setLoading(true);
    try {
      const axisParam = axis ? `&axis=${encodeURIComponent(axis)}` : "";
      const url = `${API_BASE}/papers/timeline?topic=${encodeURIComponent(topic)}${axisParam}&per_year=${perYear}&min_fwci=${minFwci}&year_from=2017`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Timeline fetch failed: ${res.status}`);
      const json: TimelineResponse = await res.json();
      setData(json);
    } catch (e) {
      console.error("Failed to fetch timeline:", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [perYear, minFwci]);

  const fetchRepresentative = useCallback(async (topic: string, axis: string) => {
    setRepresentativeLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "12",
        sort: "impact",
        year_from: "2017",
      });
      if (topic) params.set("topic", topic);
      if (axis) params.set("axis", axis);
      const res = await fetch(`${API_BASE}/papers/representative?${params}`);
      if (!res.ok) throw new Error(`Representative papers failed: ${res.status}`);
      const json: RepresentativeResponse = await res.json();
      setRepresentative(json);
    } catch (e) {
      console.error("Failed to fetch representative papers:", e);
      setRepresentative(null);
    } finally {
      setRepresentativeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTopic) {
      fetchTimeline(selectedTopic, selectedAxis);
      fetchRepresentative(selectedTopic, selectedAxis);
    } else {
      setData(null);
      setRepresentative(null);
    }
  }, [selectedTopic, selectedAxis, fetchTimeline, fetchRepresentative]);

  const handleTopicInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTopicQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTopics(value), 150);
  };

  const handlePaperInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPaperQuery(value);
    setPaperPage(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPapers(value, 0), 180);
  };

  const goPaperPage = (nextPage: number) => {
    const boundedPage = Math.max(0, nextPage);
    setPaperPage(boundedPage);
    searchPapers(paperQuery, boundedPage);
  };

  const handlePickTopic = (option: TopicOption) => {
    setSelectedTopic(option.topic);
    setSelectedAxis(option.facet_type);
    setTopicQuery(option.topic);
    setSearchParams({ topic: option.topic, axis: option.facet_type });
  };

  const handleClearTopic = () => {
    setSelectedTopic("");
    setSelectedAxis("");
    setTopicQuery("");
    setData(null);
    setRepresentative(null);
    setSearchParams({});
    fetchTopics("");
  };

  const selectedAxisLabel = axisLabel(data?.matched_axes?.[0] || selectedAxis);
  const selectedAxisColor = axisColor(data?.matched_axes?.[0] || selectedAxis);
  const representativePapers = representative?.papers ?? [];
  const allTimelinePapers = data?.papers ?? [];
  const peakYear = useMemo(() => {
    const groups = data?.by_year ?? [];
    if (groups.length === 0) return null;
    return groups.reduce((best, current) => current.papers.length > best.papers.length ? current : best, groups[0]);
  }, [data]);
  const totalCitations = representativePapers.reduce((sum, paper) => sum + paper.citations, 0);
  const avgFwci = representativePapers
    .map(p => p.fwci)
    .filter((v): v is number => v != null)
    .reduce((sum, v, _idx, arr) => sum + v / arr.length, 0);

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Papers Explorer</h1>
            <p style={subtitleStyle}>
              Topic mode는 survey처럼 대표 논문과 시간 흐름을 묶고, Paper mode는 특정 논문의 detail과 citation graph로 바로 이동합니다.
            </p>
          </div>
        </header>

        <section style={explorerGuideStyle}>
          <button
            onClick={() => setMode("topic")}
            style={mode === "topic" ? activeGuideCardStyle : guideCardStyle}
          >
            <span style={guideKickerStyle}>Topic exploration</span>
            <strong style={guideTitleStyle}>분야를 고르고 흐름을 봅니다</strong>
            <span style={guideBodyStyle}>대표 논문, 연도별 timeline, lineage graph 진입점을 한 화면에 정리합니다.</span>
          </button>
          <button
            onClick={() => {
              setMode("paper");
              setSelectedTopic("");
              setData(null);
              setRepresentative(null);
            }}
            style={mode === "paper" ? activeGuideCardStyle : guideCardStyle}
          >
            <span style={guideKickerStyle}>Paper lookup</span>
            <strong style={guideTitleStyle}>논문 하나를 바로 확인합니다</strong>
            <span style={guideBodyStyle}>제목, DOI, OpenAlex ID로 paper detail과 citation graph를 엽니다.</span>
          </button>
        </section>

        <section style={commandStyle}>
          <div style={{ display: "flex", gap: 6, alignSelf: "stretch", alignItems: "flex-end" }}>
            <button
              onClick={() => setMode("topic")}
              style={mode === "topic" ? activeModeButtonStyle : modeButtonStyle}
            >
              Topic exploration
            </button>
            <button
              onClick={() => {
                setMode("paper");
                setSelectedTopic("");
                setData(null);
                setRepresentative(null);
              }}
              style={mode === "paper" ? activeModeButtonStyle : modeButtonStyle}
            >
              Paper lookup
            </button>
          </div>
          <div style={{ minWidth: 320, flex: 1, position: "relative" }}>
            <label style={labelStyle}>{mode === "topic" ? "Topic" : "Paper title, DOI, or OpenAlex ID"}</label>
            {mode === "topic" ? (
              <input
                value={topicQuery}
                onChange={handleTopicInput}
                placeholder="Diffusion, Transformer, RAG..."
                style={topicInputStyle}
              />
            ) : (
              <input
                value={paperQuery}
                onChange={handlePaperInput}
                placeholder="Denoising Diffusion Probabilistic Models, 10.48550/..., W..."
                style={topicInputStyle}
                autoFocus
              />
            )}
          </div>
          {mode === "topic" && (
            <>
              <div>
                <label style={labelStyle}>Per year</label>
                <select value={perYear} onChange={(e) => setPerYear(Number(e.target.value))} style={selectStyle}>
                  {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Impact</label>
                <select value={minFwci} onChange={(e) => setMinFwci(Number(e.target.value))} style={selectStyle}>
                  {[0, 1, 2, 3, 5, 10].map(n => <option key={n} value={n}>FWCI ≥ {n}</option>)}
                </select>
              </div>
            </>
          )}
        </section>

        {mode === "paper" && (
          <section style={{ marginTop: 26 }}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>Find a paper</h2>
                <p style={sectionDescriptionStyle}>
                  논문 제목, DOI, OpenAlex ID로 바로 paper detail 또는 citation graph로 이동합니다.
                </p>
              </div>
            </div>
            {paperQuery.trim().length < 2 ? (
              <EmptyState text="Search by paper title, DOI, or OpenAlex work id." />
            ) : paperSearchLoading ? (
              <LoadingState text="Searching papers..." />
            ) : paperResults.length === 0 ? (
              <EmptyState text="No papers found." />
            ) : (
              <>
                <div style={paperListStyle}>
                  {paperResults.map((paper, index) => (
                    <PaperRow key={paper.id} paper={paper} index={paperPage * PAPER_SEARCH_PAGE_SIZE + index} />
                  ))}
                </div>
                <PaginationBar
                  page={paperPage}
                  pageSize={PAPER_SEARCH_PAGE_SIZE}
                  shown={paperResults.length}
                  hasNext={paperHasNext}
                  loading={paperSearchLoading}
                  onPrev={() => goPaperPage(paperPage - 1)}
                  onNext={() => goPaperPage(paperPage + 1)}
                />
              </>
            )}
          </section>
        )}

        {mode === "topic" && !selectedTopic && (
          <section style={{ marginTop: 26 }}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>{topicQuery ? "Matching topics" : "Start with a topic"}</h2>
                <p style={sectionDescriptionStyle}>
                  먼저 분석할 주제를 선택하세요. 선택 후 대표 논문과 timeline이 열립니다.
                </p>
              </div>
            </div>
            {topicSuggestions.length === 0 ? (
              <EmptyState text="No topics match." />
            ) : (
              <div style={topicGridStyle}>
                {topicSuggestions.map(topic => (
                  <button
                    key={`${topic.facet_type}:${topic.topic}`}
                    onClick={() => handlePickTopic(topic)}
                    style={topicCardStyle}
                  >
                    <span style={{ ...axisDotStyle, background: axisColor(topic.facet_type) }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={topicNameStyle}>{topic.topic}</span>
                      <span style={topicMetaStyle}>
                        {axisLabel(topic.facet_type)} · {fmtNum(topic.paper_count)} papers
                        {topic.min_year && topic.max_year ? ` · ${topic.min_year}-${topic.max_year}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {mode === "topic" && selectedTopic && (
          <div style={resultLayoutStyle}>
            <main style={{ minWidth: 0 }}>
              <section style={selectedTopicStyle}>
                <div>
                  <button onClick={handleClearTopic} style={backButtonStyle}>Change topic</button>
                  <h2 style={topicTitleStyle}>{data?.topic || selectedTopic}</h2>
                  <div style={selectedMetaStyle}>
                    <span style={{ ...badgeStyle, color: selectedAxisColor, borderColor: `${selectedAxisColor}55` }}>
                      {selectedAxisLabel}
                    </span>
                    <span>2017-present</span>
                    <span>FWCI ≥ {minFwci}</span>
                    <span>{perYear} papers / year</span>
                  </div>
                </div>
                <Link
                  to={`/lineage?topic=${encodeURIComponent(selectedTopic)}${selectedAxis ? `&axis=${encodeURIComponent(selectedAxis)}` : ""}&seed_limit=8&ancestor_limit=20`}
                  style={primaryLinkStyle}
                >
                  Topic lineage
                </Link>
              </section>

              {loading && <LoadingState text="Loading topic timeline..." />}

              {!loading && (
                <section style={{ marginTop: 22 }}>
                  <div style={explainerStyle}>
                    <strong>How to read this view</strong>
                    <span>Representative papers는 먼저 읽을 impact 중심 논문, Timeline은 연도별 대표 논문, Lineage는 이 주제의 seed 논문과 공통 인용 조상을 보여줍니다.</span>
                  </div>
                  <div style={sectionHeaderStyle}>
                    <div>
                      <h2 style={sectionTitleStyle}>Representative papers</h2>
                      <p style={sectionDescriptionStyle}>
                        Impact 기준으로 먼저 봐야 할 논문입니다. 각 논문에서 상세 페이지와 citation graph로 이동할 수 있습니다.
                      </p>
                    </div>
                    {representative && (
                      <span style={mutedMetaStyle}>{representative.match_kind} · {representative.sort}</span>
                    )}
                  </div>

                  {representativeLoading && <LoadingState text="Loading representative papers..." />}
                  {!representativeLoading && representativePapers.length === 0 && <EmptyState text="No representative papers found." />}
                  {!representativeLoading && representativePapers.length > 0 && (
                    <div style={paperListStyle}>
                      {representativePapers.map((paper, index) => (
                        <PaperRow key={paper.id} paper={paper} index={index} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {!loading && data && data.by_year.length > 0 && (
                <section style={{ marginTop: 34 }}>
                  <div style={sectionHeaderStyle}>
                    <div>
                      <h2 style={sectionTitleStyle}>Timeline</h2>
                      <p style={sectionDescriptionStyle}>
                        연도별로 impact 조건을 통과한 대표 논문만 간결하게 표시합니다.
                      </p>
                    </div>
                  </div>
                  <div style={timelineStyle}>
                    {data.by_year.map(group => (
                      <div key={group.year} style={yearBlockStyle}>
                        <div style={yearHeaderStyle}>
                          <span>{group.year}</span>
                          <span style={mutedMetaStyle}>{group.papers.length} papers</span>
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {group.papers.map(paper => (
                            <Link key={paper.id} to={`/papers/${encodeURIComponent(paper.id)}`} style={timelinePaperStyle}>
                              <span style={{ minWidth: 0 }}>
                                <span style={timelinePaperTitleStyle}>{paper.title || "(untitled)"}</span>
                                <span style={timelinePaperMetaStyle}>{authorLine(paper)}</span>
                              </span>
                              <span style={timelineMetricStyle}>{fmtNum(paper.citations)} cit</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {!loading && data && data.by_year.length === 0 && (
                <EmptyState text="No papers found for this topic with the current filters." />
              )}
            </main>

            <aside style={summaryPanelStyle}>
              <div style={{ position: "sticky", top: 78 }}>
                <h3 style={summaryTitleStyle}>Current analysis</h3>
                <div style={{ display: "grid", gap: 10 }}>
                  <Metric label="Timeline papers" value={fmtNum(allTimelinePapers.length)} />
                  <Metric label="Representative citations" value={fmtNum(totalCitations)} />
                  <Metric label="Peak year" value={peakYear ? String(peakYear.year) : "—"} />
                  <Metric label="Avg FWCI" value={avgFwci ? avgFwci.toFixed(1) : "—"} />
                </div>
                <div style={summaryDividerStyle} />
                <div style={summaryNoteStyle}>
                  이 화면은 full DB가 아니라 quality-filtered paper facet과 citation enrichment가 있는 범위에서 계산됩니다.
                </div>
                <Link
                  to={`/lineage?topic=${encodeURIComponent(selectedTopic)}${selectedAxis ? `&axis=${encodeURIComponent(selectedAxis)}` : ""}&seed_limit=8&ancestor_limit=20`}
                  style={{ ...primaryLinkStyle, width: "100%", justifyContent: "center", marginTop: 14 }}
                >
                  Open lineage graph
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function PaperRow({ paper, index }: { paper: Paper; index: number }) {
  return (
    <article style={paperRowStyle}>
      <div style={rankStyle}>{index + 1}</div>
      <div style={{ minWidth: 0 }}>
        <Link to={`/papers/${encodeURIComponent(paper.id)}`} style={paperTitleStyle}>
          {paper.title || "(untitled)"}
        </Link>
        <div style={paperMetaStyle}>
          {paper.year} · {authorLine(paper)}
          {paper.authors[0]?.institution ? ` · ${paper.authors[0].institution}` : ""}
        </div>
        <div style={paperTagRowStyle}>
          <span>{fmtNum(paper.citations)} citations</span>
          <span>FWCI {paper.fwci != null ? paper.fwci.toFixed(1) : "—"}</span>
          {paper.open_access && <span>Open access</span>}
          {paper.type && <span>{paper.type}</span>}
        </div>
      </div>
      <div style={paperActionsStyle}>
        <Link to={`/papers/${encodeURIComponent(paper.id)}`} style={secondaryLinkStyle}>Open</Link>
        <Link to={`/papers/${encodeURIComponent(paper.id)}/graph`} style={secondaryLinkStyle}>Graph</Link>
      </div>
    </article>
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

function EmptyState({ text }: { text: string }) {
  return <div style={emptyStyle}>{text}</div>;
}

function LoadingState({ text }: { text: string }) {
  return <div style={loadingStyle}>{text}</div>;
}

function PaginationBar({
  page,
  pageSize,
  shown,
  hasNext,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  pageSize: number;
  shown: number;
  hasNext: boolean;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div style={paginationStyle}>
      <span style={paginationTextStyle}>
        Showing results {shown > 0 ? `${page * pageSize + 1}-${page * pageSize + shown}` : "0"}
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

const pageStyle: React.CSSProperties = {
  position: "absolute",
  top: 52,
  left: 0,
  right: 0,
  bottom: 0,
  overflowY: "auto",
  background: "#f8fafc",
  color: "#0f172a",
  padding: "34px 42px 76px",
  fontFamily: UI_FONT,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  marginBottom: 24,
};

const titleStyle: React.CSSProperties = {
  fontSize: 40,
  lineHeight: 1.1,
  margin: "0 0 8px",
  fontWeight: 780,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 17,
  lineHeight: 1.5,
  color: "#64748b",
  margin: 0,
};

const commandStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  alignItems: "flex-end",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  padding: 18,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
};

const explorerGuideStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const guideCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
  textAlign: "left",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  color: "#0f172a",
  cursor: "pointer",
  fontFamily: UI_FONT,
  padding: "16px 17px",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.045)",
};

const activeGuideCardStyle: React.CSSProperties = {
  ...guideCardStyle,
  borderColor: "#0f766e",
  boxShadow: "0 10px 26px rgba(15, 118, 110, 0.12)",
};

const guideKickerStyle: React.CSSProperties = {
  color: "#0f766e",
  fontSize: 12,
  fontWeight: 800,
};

const guideTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 780,
  lineHeight: 1.25,
};

const guideBodyStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 7,
};

const modeButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#475569",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 15,
  fontWeight: 650,
  minWidth: 76,
  padding: "12px 13px",
};

const activeModeButtonStyle: React.CSSProperties = {
  ...modeButtonStyle,
  background: "#0f172a",
  border: "1px solid #0f172a",
  color: "#ffffff",
};

const topicInputStyle: React.CSSProperties = {
  width: "100%",
  background: "#f8fafc",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  fontFamily: UI_FONT,
  fontSize: 16,
  outline: "none",
  padding: "12px 13px",
};

const selectStyle: React.CSSProperties = {
  minWidth: 116,
  background: "#f8fafc",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  fontFamily: UI_FONT,
  fontSize: 15,
  outline: "none",
  padding: "12px 13px",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 16,
  marginBottom: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 24,
  lineHeight: 1.2,
  margin: "0 0 5px",
  fontWeight: 760,
};

const explainerStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  background: "#f8fafc",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  color: "#334155",
  fontSize: 13,
  lineHeight: 1.5,
  marginBottom: 16,
  padding: "13px 14px",
};

const sectionDescriptionStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#64748b",
  margin: 0,
  lineHeight: 1.45,
};

const topicGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 10,
};

const topicCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "10px 1fr",
  gap: 12,
  alignItems: "start",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 10,
  cursor: "pointer",
  padding: "15px 14px",
  textAlign: "left",
  fontFamily: UI_FONT,
};

const axisDotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 10,
  marginTop: 6,
};

const topicNameStyle: React.CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: 16,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const topicMetaStyle: React.CSSProperties = {
  display: "block",
  marginTop: 5,
  color: "#64748b",
  fontSize: 13,
};

const resultLayoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 300px",
  gap: 24,
  marginTop: 24,
  alignItems: "start",
};

const selectedTopicStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 18,
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  padding: 20,
};

const backButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#0f766e",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: 14,
  fontWeight: 700,
  padding: 0,
  marginBottom: 9,
};

const topicTitleStyle: React.CSSProperties = {
  fontSize: 34,
  lineHeight: 1.12,
  margin: "0 0 10px",
  fontWeight: 780,
};

const selectedMetaStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#64748b",
  fontSize: 14,
};

const badgeStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#dbe3ee",
  borderRadius: 999,
  padding: "1px 8px",
  fontWeight: 700,
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: "#0f172a",
  border: "1px solid #0f172a",
  borderRadius: 8,
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 700,
  padding: "10px 12px",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 10px",
  textDecoration: "none",
};

const mutedMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
};

const paperListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const paperRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0, 1fr) 116px",
  gap: 14,
  alignItems: "start",
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 10,
  padding: "16px 16px",
};

const rankStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  background: "#f1f5f9",
  color: "#64748b",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
};

const paperTitleStyle: React.CSSProperties = {
  display: "block",
  color: "#0f172a",
  fontSize: 17,
  fontWeight: 730,
  lineHeight: 1.35,
  textDecoration: "none",
};

const paperMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
  marginTop: 6,
};

const paperTagRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#475569",
  fontSize: 12,
  marginTop: 10,
};

const paperActionsStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const timelineStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const yearBlockStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 10,
  padding: 16,
};

const yearHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 20,
  fontWeight: 760,
  marginBottom: 12,
};

const timelinePaperStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 76px",
  gap: 12,
  alignItems: "center",
  borderTop: "1px solid #eef2f7",
  color: "#0f172a",
  paddingTop: 9,
  textDecoration: "none",
};

const timelinePaperTitleStyle: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 14,
  fontWeight: 650,
};

const timelinePaperMetaStyle: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#64748b",
  fontSize: 12,
  marginTop: 3,
};

const timelineMetricStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  textAlign: "right",
};

const summaryPanelStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  padding: 18,
};

const summaryTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 760,
  margin: "0 0 14px",
};

const metricStyle: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 9,
  padding: "11px 12px",
};

const metricLabelStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  marginBottom: 4,
};

const metricValueStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 22,
  fontWeight: 780,
};

const summaryDividerStyle: React.CSSProperties = {
  height: 1,
  background: "#eef2f7",
  margin: "16px 0",
};

const summaryNoteStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
};

const emptyStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: 10,
  color: "#64748b",
  fontSize: 15,
  padding: 24,
};

const loadingStyle: React.CSSProperties = {
  color: "#0f766e",
  fontSize: 15,
  padding: "24px 0",
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
