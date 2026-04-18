import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchTopCoins, fetchTVLData, fetchFearGreed, fetchCurated, CuratedData } from './api';
import { scoreCoin, ScoreResult, CoinData, TVLData } from './scoring';
import CoinChart from './components/CoinChart';

// ── Analysis types ────────────────────────────────────────────────────

interface AnalysisData {
  generated_at: string;
  scan_time: string;
  projects_analyzed: number;
  analysis: {
    market_overview?: string;
    top_picks?: string[];
    emerging_signals?: string[];
    risk_flags?: string[];
    sector_themes?: Record<string, string>;
    error?: string;
  };
}

type SortKey = 'score' | 'symbol' | 'price' | 'marketCap' | 'change7d' | 'athDrop';
type SortDir = 'asc' | 'desc';
type Filter = 'all' | 'strong-buy' | 'alert' | 'watch' | 'watchlist';

interface AppState {
  results: ScoreResult[];
  curated: CuratedData | null;
  analysis: AnalysisData | null;
  fg: { value: number; label: string; trend: number } | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    results: [],
    curated: null,
    analysis: null,
    fg: null,
    loading: true,
    error: null,
    lastUpdated: null,
  });
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<Filter>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<ScoreResult | null>(null);
  const [taAnalysis, setTaAnalysis] = useState<any>(null);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      // Parallel fetch — all free APIs, no auth needed
      const [coins, tvl, fg, curated] = await Promise.all([
        fetchTopCoins(1, 100),
        fetchTVLData(),
        fetchFearGreed(),
        fetchCurated(),
      ]);

      // Try loading analysis (optional — may not exist yet)
      let analysis: AnalysisData | null = null;
      try {
        const res = await fetch('/analysis.json');
        if (res.ok) analysis = await res.json();
      } catch { /* analysis not available yet — that's fine */ }

      // Build a lookup from curated watchlist: id → entry
      const watchlistMap = new Map(
        curated.watchlist.map(w => [w.id, w])
      );
      const sectorMap = curated.sectors;

      // Score all coins, then overlay curated data
      const scored = coins.map(c => {
        const result = scoreCoin(c, tvl, fg.value);
        const curatedEntry = watchlistMap.get(c.id);
        if (curatedEntry) {
          const sectorInfo = sectorMap[curatedEntry.sector];
          result.sector = curatedEntry.sector;
          result.sectorLabel = sectorInfo?.label ?? curatedEntry.sector;
          result.sectorEmoji = sectorInfo?.emoji ?? '📌';
          result.thesis = curatedEntry.thesis;
          result.isWatchlist = true;
        }
        return result;
      });

      setState({
        results: scored,
        curated,
        analysis,
        fg,
        loading: false,
        error: null,
        lastUpdated: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      setState(s => ({
        ...s,
        loading: false,
        error: err.message || 'Failed to fetch data',
      }));
    }
  }, []);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  // Load trading agents analysis when a coin is selected
  useEffect(() => {
    if (!selectedCoin) {
      setTaAnalysis(null);
      return;
    }
    const loadTA = async () => {
      try {
        const res = await fetch(`/results/${selectedCoin.id}/analysis_latest.json`);
        if (res.ok) {
          const data = await res.json();
          const entries = Object.entries(data);
          if (entries.length) {
            const latest = entries[entries.length - 1][1] as any;
            setTaAnalysis(latest);
          } else {
            setTaAnalysis(null);
          }
        } else {
          setTaAnalysis(null);
        }
      } catch {
        setTaAnalysis(null);
      }
    };
    loadTA();
  }, [selectedCoin]);

  // Sort handler
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  // Stats
  const stats = useMemo(() => {
    const watchlistResults = state.results.filter(r => r.isWatchlist);
    const alerts = state.results.filter(r => r.score >= 65).length;
    const strongBuys = state.results.filter(r => r.score >= 78).length;
    const topPick = state.results.length ? state.results.reduce((a, b) => a.score > b.score ? a : b) : null;
    const avgScore = state.results.length
      ? (state.results.reduce((s, r) => s + r.score, 0) / state.results.length).toFixed(1)
      : '—';
    return { alerts, strongBuys, topPick, avgScore, watchlistCount: watchlistResults.length };
  }, [state.results]);

  // Available sectors from curated data
  const availableSectors = useMemo(() => {
    if (!state.curated) return [];
    const sectorCounts: Record<string, number> = {};
    state.results.forEach(r => {
      if (r.sector) sectorCounts[r.sector] = (sectorCounts[r.sector] || 0) + 1;
    });
    return Object.entries(state.curated.sectors)
      .filter(([key]) => sectorCounts[key])
      .map(([key, info]) => ({ key, ...info, count: sectorCounts[key] }))
      .sort((a, b) => b.count - a.count);
  }, [state.results, state.curated]);

  // Filtered + sorted results
  const displayed = useMemo(() => {
    let items = [...state.results];

    // Apply type filter
    if (filter === 'strong-buy') items = items.filter(r => r.score >= 78);
    else if (filter === 'alert') items = items.filter(r => r.score >= 65);
    else if (filter === 'watch') items = items.filter(r => r.score >= 50 && r.score < 65);
    else if (filter === 'watchlist') items = items.filter(r => r.isWatchlist);

    // Apply sector filter
    if (sectorFilter !== 'all') {
      items = items.filter(r => r.sector === sectorFilter);
    }

    // Apply sort — watchlist items get a slight boost in display priority
    items.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return items;
  }, [state.results, filter, sectorFilter, sortKey, sortDir]);

  const sortIndicator = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  function formatPrice(price: number): string {
    if (price >= 1000) return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (price >= 1) return '$' + price.toFixed(2);
    return '$' + price.toFixed(4);
  }

  function formatMcap(mcap: number): string {
    if (mcap >= 1e12) return '$' + (mcap / 1e12).toFixed(1) + 'T';
    if (mcap >= 1e9) return '$' + (mcap / 1e9).toFixed(1) + 'B';
    if (mcap >= 1e6) return '$' + (mcap / 1e6).toFixed(0) + 'M';
    return '$' + (mcap / 1e3).toFixed(0) + 'K';
  }

  function getScoreColor(score: number): string {
    if (score >= 78) return '#00ff88';
    if (score >= 65) return '#ff4466';
    if (score >= 50) return '#ffd700';
    return '#64748b';
  }

  function getPctClass(val: number): string {
    return val >= 0 ? 'positive' : 'negative';
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <div>
            <div className="logo-text">SignalHub</div>
            <div className="logo-sub">Live Crypto Intelligence</div>
          </div>
        </div>
        <div className="header-right">
          {state.curated && (
            <span className="status-pill curated-pill" title={`Watchlist from moltstreet-intelligence (${state.curated.generated_at})`}>
              🎯 {stats.watchlistCount} watchlist
            </span>
          )}
          {state.lastUpdated && (
            <span className="status-pill">
              <span className="status-dot" />
              Updated {state.lastUpdated}
            </span>
          )}
          <button className="refresh-btn" onClick={load} disabled={state.loading}>
            {state.loading ? '⟳ Scanning...' : '⟳ Refresh'}
          </button>
        </div>
      </header>

      <main className="main">
        {/* Error */}
        {state.error && (
          <div className="error">
            <strong>⚠️ {state.error}</strong>
            <p>The free APIs have rate limits. Wait a minute and try again.</p>
          </div>
        )}

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Fear & Greed</div>
            <div className="stat-value" style={{
              color: state.fg && state.fg.value < 25 ? '#ff4466' :
                     state.fg && state.fg.value < 56 ? '#ffd700' : '#00ff88'
            }}>
              {state.fg?.value ?? '—'}
            </div>
            <div className="stat-sub">{state.fg?.label ?? ''}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">F&G Trend</div>
            <div className="stat-value" style={{
              color: (state.fg?.trend ?? 0) > 0 ? '#00ff88' : '#ff4466'
            }}>
              {state.fg ? `${state.fg.trend >= 0 ? '+' : ''}${state.fg.trend}` : '—'}
            </div>
            <div className="stat-sub">points/week</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Alerts</div>
            <div className="stat-value" style={{ color: '#ff4466' }}>
              {stats.alerts}
            </div>
            <div className="stat-sub">score ≥ 65</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Strong Buys</div>
            <div className="stat-value" style={{ color: '#00ff88' }}>
              {stats.strongBuys}
            </div>
            <div className="stat-sub">score ≥ 78</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Top Pick</div>
            <div className="stat-value" style={{ color: '#00d4ff' }}>
              {stats.topPick?.symbol ?? '—'}
            </div>
            <div className="stat-sub">
              {stats.topPick ? `${stats.topPick.score} pts` : ''}
            </div>
          </div>
        </div>

        {/* AI Analysis Panel (from DeepAgents) */}
        {state.analysis && (
          <div className="analysis-panel">
            <button
              className="analysis-toggle"
              onClick={() => setShowAnalysis(!showAnalysis)}
            >
              🧠 AI Market Analysis
              <span className="analysis-meta">
                {state.analysis.projects_analyzed} projects • {state.analysis.generated_at ? new Date(state.analysis.generated_at).toLocaleTimeString() : '—'}
              </span>
              <span className="analysis-chevron">{showAnalysis ? '▼' : '▶'}</span>
            </button>
            {showAnalysis && (
              <div className="analysis-content">
                {state.analysis.analysis.market_overview && (
                  <div className="analysis-section">
                    <h3>📊 Market Overview</h3>
                    <p>{state.analysis.analysis.market_overview}</p>
                  </div>
                )}
                {state.analysis.analysis.top_picks && state.analysis.analysis.top_picks.length > 0 && (
                  <div className="analysis-section">
                    <h3>🎯 Top Picks</h3>
                    <ul>
                      {state.analysis.analysis.top_picks.map((pick, i) => (
                        <li key={i}>{pick}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {state.analysis.analysis.emerging_signals && state.analysis.analysis.emerging_signals.length > 0 && (
                  <div className="analysis-section">
                    <h3>📡 Emerging Signals</h3>
                    <ul>
                      {state.analysis.analysis.emerging_signals.map((sig, i) => (
                        <li key={i}>{sig}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {state.analysis.analysis.risk_flags && state.analysis.analysis.risk_flags.length > 0 && (
                  <div className="analysis-section risk">
                    <h3>⚠️ Risk Flags</h3>
                    <ul>
                      {state.analysis.analysis.risk_flags.map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {state.analysis.analysis.sector_themes && Object.keys(state.analysis.analysis.sector_themes).length > 0 && (
                  <div className="analysis-section">
                    <h3>🏷️ Sector Themes</h3>
                    <div className="sector-themes-grid">
                      {Object.entries(state.analysis.analysis.sector_themes).map(([sector, theme]) => (
                        <div key={sector} className="sector-theme-card">
                          <strong>{sector}</strong>
                          <span>{theme}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="filters">
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => { setFilter('all'); setSectorFilter('all'); }}>
            All ({state.results.length})
          </button>
          <button className={`filter-btn ${filter === 'watchlist' ? 'active' : ''}`} onClick={() => setFilter('watchlist')}>
            🎯 Watchlist ({stats.watchlistCount})
          </button>
          <button className={`filter-btn ${filter === 'strong-buy' ? 'active' : ''}`} onClick={() => setFilter('strong-buy')}>
            🔥 Strong Buy ({stats.strongBuys})
          </button>
          <button className={`filter-btn ${filter === 'alert' ? 'active' : ''}`} onClick={() => setFilter('alert')}>
            ⚡ Alerts ({stats.alerts})
          </button>
          <button className={`filter-btn ${filter === 'watch' ? 'active' : ''}`} onClick={() => setFilter('watch')}>
            👀 Watch ({state.results.filter(r => r.score >= 50 && r.score < 65).length})
          </button>
        </div>

        {/* Sector filters (from moltstreet-intelligence) */}
        {availableSectors.length > 0 && (
          <div className="filters sector-filters">
            <button
              className={`filter-btn ${sectorFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSectorFilter('all')}
            >
              All Sectors
            </button>
            {availableSectors.map(s => (
              <button
                key={s.key}
                className={`filter-btn ${sectorFilter === s.key ? 'active' : ''}`}
                onClick={() => setSectorFilter(s.key)}
              >
                {s.emoji} {s.label} ({s.count})
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="table-wrap">
          <div className="table-header">
            <h2 className="table-title">📊 Opportunity Scores</h2>
            <span className="table-meta">
              {displayed.length} projects • CoinGecko + DeFiLlama • Auto-refreshes every 60s
            </span>
          </div>
          {state.loading && state.results.length === 0 ? (
            <div className="loading">
              <div className="loading-spinner" />
              <p>Scanning top 100 crypto projects...</p>
              <p style={{ fontSize: '0.75rem', marginTop: 4 }}>Fetching CoinGecko + DeFiLlama + Curated Watchlist</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort('symbol')} className={sortKey === 'symbol' ? 'sorted' : ''}>
                    Symbol{sortIndicator('symbol')}
                  </th>
                  <th onClick={() => handleSort('score')} className={sortKey === 'score' ? 'sorted' : ''}>
                    Score{sortIndicator('score')}
                  </th>
                  <th onClick={() => handleSort('price')} className={sortKey === 'price' ? 'sorted' : ''}>
                    Price{sortIndicator('price')}
                  </th>
                  <th onClick={() => handleSort('marketCap')} className={sortKey === 'marketCap' ? 'sorted' : ''}>
                    MCap{sortIndicator('marketCap')}
                  </th>
                  <th onClick={() => handleSort('change7d')} className={sortKey === 'change7d' ? 'sorted' : ''}>
                    7d %{sortIndicator('change7d')}
                  </th>
                  <th onClick={() => handleSort('athDrop')} className={sortKey === 'athDrop' ? 'sorted' : ''}>
                    From ATH{sortIndicator('athDrop')}
                  </th>
                  <th>Signal</th>
                  <th className="hide-mobile">Signals</th>
                  <th className="hide-mobile">Sector</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.id} className={r.isWatchlist ? 'watchlist-row' : ''} onClick={() => setSelectedCoin(r)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="symbol-cell">
                        {r.isWatchlist && <span className="watchlist-badge" title={r.thesis}>🎯</span>}
                        <strong>{r.symbol}</strong>
                      </div>
                      {r.thesis && <div className="thesis-text">{r.thesis}</div>}
                    </td>
                    <td>
                      <div className="score-cell">
                        <span className="score-value" style={{ color: getScoreColor(r.score) }}>
                          {r.score}
                        </span>
                        <div className="score-bar">
                          <div
                            className="score-fill"
                            style={{
                              width: `${r.score}%`,
                              background: getScoreColor(r.score),
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>{formatPrice(r.price)}</td>
                    <td>{formatMcap(r.marketCap)}</td>
                    <td className={getPctClass(r.change7d)}>
                      {r.change7d >= 0 ? '+' : ''}{r.change7d.toFixed(1)}%
                    </td>
                    <td className="negative">
                      {r.athDrop.toFixed(1)}%
                    </td>
                    <td>
                      <span className={`rating rating-${r.rating.toLowerCase().replace(' ', '-')}`}>
                        {r.rating}
                      </span>
                    </td>
                    <td className="hide-mobile">
                      <div className="signals">
                        {r.signals.slice(0, 3).map((s, i) => (
                          <span key={i} className="signal-tag">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="hide-mobile">
                      {r.sectorLabel ? (
                        <span className="sector-tag">
                          {r.sectorEmoji} {r.sectorLabel}
                        </span>
                      ) : (
                        <span className="sector-tag sector-na">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Coin Detail Modal */}
      {selectedCoin && (
        <div className="modal-overlay" onClick={() => setSelectedCoin(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedCoin(null)} aria-label="Close">×</button>
            <div className="modal-header">
              <div>
                <h2>{selectedCoin.name} ({selectedCoin.symbol})</h2>
                <div className="modal-meta">
                  Score: <strong style={{ color: getScoreColor(selectedCoin.score) }}>{selectedCoin.score}</strong> — {selectedCoin.rating}
                  {selectedCoin.isWatchlist && <span className="watchlist-badge">🎯 Watchlist</span>}
                </div>
              </div>
              <div className="modal-stats">
                <div className="stat">
                  <span className="stat-label">Price</span>
                  <span className="stat-value">{formatPrice(selectedCoin.price)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Market Cap</span>
                  <span className="stat-value">{formatMcap(selectedCoin.marketCap)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">7d Change</span>
                  <span className={`stat-value ${getPctClass(selectedCoin.change7d)}`}>
                    {selectedCoin.change7d >= 0 ? '+' : ''}{selectedCoin.change7d.toFixed(1)}%
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">From ATH</span>
                  <span className="stat-value negative">{selectedCoin.athDrop.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="modal-body">
              {/* Chart */}
              <section className="chart-section">
                <CoinChart coinId={selectedCoin.id} coinName={selectedCoin.name} days={30} />
              </section>

              {/* Trading Agents Analysis (if available) */}
              {taAnalysis && (
                <section className="ta-analysis-section">
                  <h3>🤖 Crypto Trading Agents Analysis</h3>
                  <div className="ta-grid">
                    <div className="ta-card">
                      <h4>📊 Market Analyst</h4>
                      <p>{taAnalysis.market_report || 'No market report available.'}</p>
                    </div>
                    <div className="ta-card">
                      <h4>😊 Sentiment Analyst</h4>
                      <p>{taAnalysis.sentiment_report || 'No sentiment report available.'}</p>
                    </div>
                    <div className="ta-card">
                      <h4>📈 Fundamentals Analyst</h4>
                      <p>{taAnalysis.fundamentals_report || 'No fundamentals report available.'}</p>
                    </div>
                    <div className="ta-card">
                      <h4>🔗 On-Chain Analyst</h4>
                      <p>{taAnalysis.onchain_report || 'No on-chain report available.'}</p>
                    </div>
                    <div className="ta-card full-width">
                      <h4>📋 Investment Plan</h4>
                      <p>{taAnalysis.investment_plan || 'No investment plan available.'}</p>
                    </div>
                    <div className="ta-card full-width decision">
                      <h4>🏦 Final Decision</h4>
                      <pre className="decision-text">{taAnalysis.final_trade_decision || 'No decision yet.'}</pre>
                    </div>
                  </div>
                </section>
              )}

              {/* Score breakdown */}
              <section className="breakdown-section">
                <h3>Score Breakdown</h3>
                <div className="breakdown-grid">
                  {Object.entries(selectedCoin.breakdown).map(([key, value]) => (
                    <div key={key} className="breakdown-item">
                      <span className="breakdown-label">{key}</span>
                      <div className="breakdown-bar">
                        <div className="breakdown-fill" style={{ width: `${value}%` }}></div>
                      </div>
                      <span className="breakdown-value">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        SignalHub v1.1 • Data: CoinGecko + DeFiLlama + Alternative.me
        {state.curated && ` + MoltStreet Intelligence`} • Not financial advice • DYOR • Auto-refreshes every 60s
      </footer>
    </div>
  );
}
