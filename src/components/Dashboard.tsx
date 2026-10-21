
import React, { useState, useEffect, useMemo, useRef, memo } from 'react'
import { formatNumber } from '../utils'

interface DashboardData {
  t: string; // Ticker
  p: number; // Price
  c1d: number; // 1 Day Change %
  p1d?: number; // 1 Day Diff
  c1w: number; // 1 Week Change %
  p1w?: number; // 1 Week Diff
  c1m: number; // 1 Month Change %
  p1m?: number; // 1 Month Diff
  c1y: number; // 1 Year Change %
  p1y?: number; // 1 Year Diff
  ca: number; // All Time Change %
  pa?: number; // All Time Diff
  sl: number[]; // Sparkline data
  v: number; // Volume
  source?: string;
  observedAt?: string | null;
  asOfDate?: string;
}

export interface LivePriceData {
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  direction: 'up' | 'down' | 'neutral';
  source: string;
  timestamp: number;
  freshness?: 'recent' | 'stale' | 'closed';
  observationAgeSeconds?: number | null;
}

interface DashboardProps {
  onTickerSelect: (ticker: string) => void;
  updateStatus?: 'idle' | 'updating' | 'completed' | 'error';
  livePrices?: Record<string, LivePriceData>;
  onVisibleTickersChange?: (tickers: string[]) => void;
  // Keyboard shortcut support
  sortTrigger?: { field: string; timestamp: number } | null;
  selectByRankTrigger?: number | null; // 1-10, where 10 is represented as 0
}

// Module-level cache to persist data across view switches
let cachedDashboardData: DashboardData[] | null = null;

// PHASE 2: Memoized Sparkline to prevent re-renders
const Sparkline = memo<{ data: number[], color: string }>(({ data, color }) => {
  if (!data || data.length < 2) return null;
  
  const width = 100;
  const height = 30;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
});

// Helper functions extracted for reuse
const getChangeColor = (val: number) => {
  if (val > 0) return 'positive';
  if (val < 0) return 'negative';
  return 'neutral';
};

// PHASE 2: Memoized table row component
interface DashboardRowProps {
  item: DashboardData;
  hasLive: boolean;
  flash: 'up' | 'down' | null;
  onSelect: (ticker: string) => void;
  favorite: boolean;
  onToggleFavorite: (ticker: string) => void;
}

const DashboardRow = memo<DashboardRowProps>(
  ({ item, hasLive, flash, onSelect, favorite, onToggleFavorite }) => {
    const flashClass = flash === 'up' ? 'price-pulse-up' : flash === 'down' ? 'price-pulse-down' : '';
    
    const renderChangeCell = (percent: number, diff: number, extraClass = '') => {
      const colorClass = getChangeColor(percent);
      return (
        <td className={`text-right change-cell ${extraClass} ${flash ? flashClass : ''}`}>
          <div className="change-val">{diff > 0 ? '+' : ''}{formatNumber(diff, 0)}</div>
          <div className={`change-pct ${colorClass}`}>
            {percent > 0 ? '+' : ''}{percent.toFixed(2)}%
          </div>
        </td>
      );
    };

    return (
      <tr className={`ticker-row ${hasLive ? 'streaming-active' : ''}`}>
        <td className="watchlist-cell">
          <button
            type="button"
            className={`watchlist-star ${favorite ? 'selected' : ''}`}
            aria-pressed={favorite}
            aria-label={favorite ? `Remove ${item.t} from watchlist` : `Add ${item.t} to watchlist`}
            title={favorite ? 'Remove from watchlist' : 'Add to watchlist'}
            onClick={() => onToggleFavorite(item.t)}
          >{favorite ? '★' : '☆'}</button>
        </td>
        <td className={`ticker-cell primary-col ${hasLive ? 'live' : ''}`}>{item.t}</td>
        <td className={`text-right price-cell primary-col ${flashClass}`}>{formatNumber(item.p, 0)}</td>
        
        {renderChangeCell(item.c1d, item.p1d || 0, 'primary-col')}
        {renderChangeCell(item.c1w, item.p1w || 0, 'desktop-only')}
        {renderChangeCell(item.c1m, item.p1m || 0, 'desktop-only')}
        {renderChangeCell(item.c1y, item.p1y || 0, 'desktop-only')}
        {renderChangeCell(item.ca, item.pa || 0,  'wide-desktop-only')}

        <td className="text-center sparkline-cell desktop-only">
          <Sparkline 
            data={item.sl} 
            color={item.c1m >= 0 ? '#00fb4c' : '#ff3b3b'} 
          />
        </td>
        <td className="text-right volume-cell desktop-only">
          {(item.v / 1000000).toFixed(1)}M
        </td>
        <td className="quote-asof desktop-only" title={`Source: ${item.source || 'unknown'} · Observed: ${item.observedAt || item.asOfDate || 'unknown'}`}>
          {item.asOfDate || '—'}
          {item.observedAt && <span className="asof-source">1M</span>}
        </td>
        <td className="text-center primary-col">
          <button className="action-btn" onClick={() => onSelect(item.t)}>
            VIEW
          </button>
        </td>
      </tr>
    );
  }
);

export const Dashboard: React.FC<DashboardProps> = ({ 
  onTickerSelect, 
  updateStatus, 
  livePrices = {}, 
  onVisibleTickersChange,
  sortTrigger,
  selectByRankTrigger,
}) => {
  // Initialize from cache if available
  const [data, setData] = useState<DashboardData[]>(cachedDashboardData || []);
  const [loading, setLoading] = useState(cachedDashboardData === null);
  const [sortField, setSortField] = useState<keyof DashboardData>('c1d');
  const [sortDesc, setSortDesc] = useState(true);
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [loadError, setLoadError] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('idx-watchlist-v1') || '[]');
      return Array.isArray(saved) ? saved.filter((item): item is string =>
        typeof item === 'string' && /^[A-Z]{4}$/.test(item)).slice(0, 500) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('idx-watchlist-v1', JSON.stringify(favorites)); } catch { /* storage disabled */ }
  }, [favorites]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const toggleFavorite = (ticker: string) => {
    setFavorites(previous => previous.includes(ticker)
      ? previous.filter(item => item !== ticker) : [...previous, ticker]);
  };
  
  // Flash animation state - tracks which cells should flash and in which direction
  const [flashState, setFlashState] = useState<Record<string, 'up' | 'down' | null>>({});
  
  // Track if we need to force refresh (only on updateStatus completed)
  const shouldRefresh = useRef(false);

  // Re-fetch when updateStatus changes to 'completed'
  useEffect(() => {
    if (updateStatus === 'completed') {
      shouldRefresh.current = true;
      // Trigger re-fetch
      fetchDashboardData();
    }
  }, [updateStatus]);

  const fetchDashboardData = async () => {
    // Don't show loading if we have cached data
    if (cachedDashboardData === null) setLoading(true);
    
    try {
      const res = await fetch('/data/dashboard.json?t=' + Date.now());
      if (!res.ok) throw new Error(`Could not load dashboard (${res.status})`);
      const json: unknown = await res.json();
      if (!Array.isArray(json)) throw new Error('Unexpected dashboard data');
      cachedDashboardData = json as DashboardData[];
      setData(json as DashboardData[]);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Dashboard unavailable');
      console.error("Failed to load dashboard data", e);
    } finally {
      setLoading(false);
      shouldRefresh.current = false;
    }
  };

  // Initial fetch only if no cached data
  useEffect(() => {
    if (cachedDashboardData === null) {
      fetchDashboardData();
    }
  }, []);

  // Merge live prices with cached data for display
  const mergedData = useMemo(() => {
    return data.map(item => {
      const live = livePrices[item.t];
      if (!live || live.freshness === 'stale') return item;
      
      // Calculate updated daily change based on live price
      const newC1d = live.prevClose > 0 
        ? ((live.price - live.prevClose) / live.prevClose) * 100 
        : item.c1d;
      const newP1d = live.price - live.prevClose;
      
      return {
        ...item,
        p: live.price,
        c1d: newC1d,
        p1d: newP1d,
        v: live.volume > 0 ? live.volume : item.v,
      };
    });
  }, [data, livePrices]);

  const sortedData = useMemo(() => {
    return [...mergedData].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        // Handle array for sparkline (not sortable essentially, but prevents crash)
        if (valA == null || valB == null) return valA == null && valB == null ? 0 : valA == null ? 1 : -1;
        if (Array.isArray(valA) || Array.isArray(valB)) return 0;
        
        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });
  }, [mergedData, sortField, sortDesc]);

  const filteredData = useMemo(() => sortedData.filter(item =>
    item.t.toLowerCase().includes(query.trim().toLowerCase()) &&
    (!favoritesOnly || favoriteSet.has(item.t))
  ), [sortedData, query, favoritesOnly, favoriteSet]);

  useEffect(() => setPage(0), [query, favoritesOnly, sortField, sortDesc]);

  const pageCount = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleData = useMemo(() => filteredData.slice(
    safePage * pageSize, (safePage + 1) * pageSize
  ), [filteredData, safePage]);

  // Trigger flash animation when live prices change
  useEffect(() => {
    const newFlashes: Record<string, 'up' | 'down' | null> = {};
    Object.entries(livePrices).forEach(([ticker, priceData]) => {
      if (priceData.direction !== 'neutral') {
        newFlashes[ticker] = priceData.direction;
      }
    });
    
    if (Object.keys(newFlashes).length > 0) {
      setFlashState(prev => ({ ...prev, ...newFlashes }));
      
      // Clear flash after animation duration
      const timer = setTimeout(() => {
        setFlashState(prev => {
          const next = { ...prev };
          Object.keys(newFlashes).forEach(t => { next[t] = null; });
          return next;
        });
      }, 400);
      
      return () => clearTimeout(timer);
    }
  }, [livePrices]);

  const handleSort = (field: keyof DashboardData) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const renderSortArrow = (field: keyof DashboardData) => {
    if (sortField !== field) return null;
    return <span className="sort-arrow">{sortDesc ? '▼' : '▲'}</span>;
  };

  /* Render only the active page to keep the dashboard responsive. */
  
  // Notify parent of visible tickers for streaming optimization
  useEffect(() => {
    if (onVisibleTickersChange) {
      const tickers = visibleData.map(d => d.t);
      // Debounce slightly to avoid rapid updates during sort
      const timer = setTimeout(() => {
        onVisibleTickersChange(tickers);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [visibleData, onVisibleTickersChange]);

  // Handle keyboard-triggered sorting
  useEffect(() => {
    if (!sortTrigger) return;
    
    const fieldMap: Record<string, keyof DashboardData> = {
      'p': 'p',      // Price
      'd': 'c1d',    // Daily
      'w': 'c1w',    // Weekly
      'm': 'c1m',    // Monthly
      'y': 'c1y',    // Yearly
      'x': 'ca',     // Max/All
      't': 't',      // Ticker
      'v': 'v',      // Volume
    };
    
    const field = fieldMap[sortTrigger.field];
    if (field) {
      handleSort(field);
    }
  }, [sortTrigger]);

  // Handle keyboard-triggered selection by rank
  useEffect(() => {
    if (selectByRankTrigger === null || selectByRankTrigger === undefined) return;
    
    // 0 = 10th, 1-9 = 1st-9th
    const index = selectByRankTrigger === 0 ? 9 : selectByRankTrigger - 1;
    const ticker = visibleData[index];
    if (ticker) {
      onTickerSelect(ticker.t);
    }
  }, [selectByRankTrigger, visibleData, onTickerSelect]);

  if (loading) return <div className="loading">Loading Market Data...</div>;
  if (loadError && data.length === 0) {
    return <div className="loading" role="alert">Dashboard unavailable: {loadError}.
      Run <code>python scripts/bootstrap.py</code> to initialize local ticker data.
    </div>;
  }

  return (
    <div className="dashboard-container">
        <div className="dashboard-header">
            <h2>MARKET OVERVIEW</h2>
            <div className="dashboard-stats">
                <label>
                  <span className="sr-only">Filter tickers</span>
                  <input className="dashboard-search" type="search" placeholder="Filter ticker (e.g. BBCA)"
                    value={query} onChange={event => setQuery(event.target.value)} />
                </label>
                <button type="button" className={`watchlist-toggle ${favoritesOnly ? 'active' : ''}`}
                  aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>
                  ★ Watchlist ({favorites.length})
                </button>
                <span>{filteredData.length} of {data.length} symbols</span>
            </div>
        </div>
        
        <div className="table-container">
            <table className="bloomberg-table">
                <thead>
                    <tr>
                        <th aria-label="Watchlist">★</th>
                        <th onClick={() => handleSort('t')} className="primary-col">TICKER {renderSortArrow('t')}</th>
                        <th onClick={() => handleSort('p')} className="text-right primary-col">PRICE {renderSortArrow('p')}</th>
                        <th onClick={() => handleSort('c1d')} className="text-right primary-col">D {renderSortArrow('c1d')}</th>
                        <th onClick={() => handleSort('c1w')} className="text-right desktop-only">W {renderSortArrow('c1w')}</th>
                        <th onClick={() => handleSort('c1m')} className="text-right desktop-only">M {renderSortArrow('c1m')}</th>
                        <th onClick={() => handleSort('c1y')} className="text-right desktop-only">Y {renderSortArrow('c1y')}</th>
                        <th onClick={() => handleSort('ca')} className="text-right wide-desktop-only">ALL {renderSortArrow('ca')}</th>
                        <th className="text-center desktop-only">TREND (1M)</th>
                        <th onClick={() => handleSort('v')} className="text-right desktop-only">VOLUME {renderSortArrow('v')}</th>
                        <th className="desktop-only">AS OF (WIB)</th>
                        <th className="text-center primary-col">ACTION</th>
                    </tr>
                </thead>
                <tbody>
                    {/* PHASE 2: Using memoized DashboardRow for efficient re-renders */}
                    {visibleData.map((item) => (
                        <DashboardRow 
                            key={item.t}
                            item={item}
                            hasLive={livePrices[item.t]?.freshness === 'recent' && Date.now() - livePrices[item.t].timestamp < 900000}
                            flash={flashState[item.t] || null}
                            onSelect={onTickerSelect}
                            favorite={favoriteSet.has(item.t)}
                            onToggleFavorite={toggleFavorite}
                        />
                    ))}
                    {visibleData.length === 0 && (
                      <tr><td colSpan={12} className="dashboard-empty">
                        {favoritesOnly ? 'No matching watchlist symbols. Select ☆ beside a ticker to save one.' : 'No matching tickers.'}
                      </td></tr>
                    )}
                </tbody>
            </table>
        </div>
        <nav className="dashboard-pagination" aria-label="Market overview pages">
          <button type="button" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Previous</button>
          <span>Page {safePage + 1} of {pageCount} · {visibleData.length} shown</span>
          <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Next →</button>
        </nav>
    </div>
  );
};
