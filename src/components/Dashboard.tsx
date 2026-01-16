
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
  if (!data || data.length === 0) return null;
  
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
}

const DashboardRow = memo<DashboardRowProps>(
  ({ item, hasLive, flash, onSelect }) => {
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
        <td className="text-center primary-col">
          <button className="action-btn" onClick={() => onSelect(item.t)}>
            VIEW
          </button>
        </td>
      </tr>
    );
  },
  // Custom comparison function: only re-render if relevant data changed
  (prevProps, nextProps) => {
    return (
      prevProps.item.t === nextProps.item.t &&
      prevProps.item.p === nextProps.item.p &&
      prevProps.item.c1d === nextProps.item.c1d &&
      prevProps.item.v === nextProps.item.v &&
      prevProps.hasLive === nextProps.hasLive &&
      prevProps.flash === nextProps.flash
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
      if (res.ok) {
        const json = await res.json();
        cachedDashboardData = json; // Update cache
        setData(json);
      }
    } catch (e) {
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
      if (!live) return item;
      
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
        if (Array.isArray(valA)) return 0;
        
        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });
  }, [mergedData, sortField, sortDesc]);

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

  /* Limit rendered rows for performance */
  const visibleData = useMemo(() => sortedData.slice(0, 100), [sortedData]);
  
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
    const ticker = sortedData[index];
    if (ticker) {
      onTickerSelect(ticker.t);
    }
  }, [selectByRankTrigger, sortedData, onTickerSelect]);

  if (loading) return <div className="loading">Loading Market Data...</div>;

  return (
    <div className="dashboard-container">
        <div className="dashboard-header">
            <h2>MARKET OVERVIEW</h2>
            <div className="dashboard-stats">
                <span>Top 100 of {data.length} Tickers</span>
            </div>
        </div>
        
        <div className="table-container">
            <table className="bloomberg-table">
                <thead>
                    <tr>
                        <th onClick={() => handleSort('t')} className="primary-col">TICKER {renderSortArrow('t')}</th>
                        <th onClick={() => handleSort('p')} className="text-right primary-col">PRICE {renderSortArrow('p')}</th>
                        <th onClick={() => handleSort('c1d')} className="text-right primary-col">D {renderSortArrow('c1d')}</th>
                        <th onClick={() => handleSort('c1w')} className="text-right desktop-only">W {renderSortArrow('c1w')}</th>
                        <th onClick={() => handleSort('c1m')} className="text-right desktop-only">M {renderSortArrow('c1m')}</th>
                        <th onClick={() => handleSort('c1y')} className="text-right desktop-only">Y {renderSortArrow('c1y')}</th>
                        <th onClick={() => handleSort('ca')} className="text-right wide-desktop-only">ALL {renderSortArrow('ca')}</th>
                        <th className="text-center desktop-only">TREND (1M)</th>
                        <th onClick={() => handleSort('v')} className="text-right desktop-only">VOLUME {renderSortArrow('v')}</th>
                        <th className="text-center primary-col">ACTION</th>
                    </tr>
                </thead>
                <tbody>
                    {/* PHASE 2: Using memoized DashboardRow for efficient re-renders */}
                    {visibleData.map((item) => (
                        <DashboardRow 
                            key={item.t}
                            item={item}
                            hasLive={!!livePrices[item.t]}
                            flash={flashState[item.t] || null}
                            onSelect={onTickerSelect}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};
