import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { TickerStats } from '../types'
import { formatNumber, formatVolume } from '../utils'

// Fuzzy matching function
function fuzzyMatch(searchTerm: string, text: string): boolean {
  const search = searchTerm.toLowerCase()
  const str = text.toLowerCase()
  let searchIndex = 0

  for (let i = 0; i < str.length && searchIndex < search.length; i++) {
    if (str[i] === search[searchIndex]) {
      searchIndex++
    }
  }

  return searchIndex === search.length
}

export interface SidebarLivePrice {
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  direction: 'up' | 'down' | 'neutral';
  changePercent: number;
}

interface SidebarProps {
  stats: TickerStats | null
  tickers: string[]
  selectedTicker: string
  onTickerSelect: (ticker: string) => void
  loading: boolean
  onRefresh?: () => void
  livePrice?: SidebarLivePrice | null
}

// Virtual scrolling constants
const ITEM_HEIGHT = 42 // Height of each ticker item in pixels
const OVERSCAN = 5 // Extra items to render above/below viewport

export const Sidebar: React.FC<SidebarProps> = ({
  stats,
  tickers,
  selectedTicker,
  onTickerSelect,
  loading,
  onRefresh,
  livePrice,
}) => {

  // Merge live price with stats when available
  const displayStats = useMemo(() => {
    if (!stats) return null;
    if (!livePrice) return stats;
    
    // Use live values when available
    return {
      ...stats,
      current: livePrice.price,
      open: livePrice.open || stats.open,
      high: Math.max(livePrice.high || 0, stats.high),
      low: livePrice.low > 0 ? Math.min(livePrice.low, stats.low) : stats.low,
      volume: livePrice.volume > 0 ? livePrice.volume : stats.volume,
      dailyChangePercent: livePrice.changePercent,
    };
  }, [stats, livePrice]);

  const renderChange = (label: string, value: number | undefined) => {
    if (value === undefined) return (
      <div className="stat-item">
        <span className="stat-label">{label}</span>
        <span className="stat-value">-</span>
      </div>
    )
    return (
      <div className="stat-item">
        <span className="stat-label">{label}</span>
        <span className={`stat-value ${value >= 0 ? 'positive' : 'negative'}`}>
          {value >= 0 ? '+' : ''}{formatNumber(value, 2)}%
        </span>
      </div>
    )
  }

  // Get price direction class
  const priceDirectionClass = livePrice?.direction === 'up' ? 'positive' : 
                              livePrice?.direction === 'down' ? 'negative' : '';

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="section-title">Details</div>
        {displayStats ? (
          <div className="stats-grid">
            <div className={`stat-item primary ${livePrice ? 'price-pulse-' + livePrice.direction : ''}`}>
              <span className="stat-label">Price {livePrice && <span className="live-dot">●</span>}</span>
              <span className={`stat-value highlight ${priceDirectionClass}`}>
                Rp {formatNumber(displayStats.current, 0)}
              </span>
            </div>
            
            <div className="stats-divider">Period Changes</div>
            {renderChange('Daily', displayStats.dailyChangePercent)}
            {renderChange('Weekly', displayStats.weeklyChangePercent)}
            {renderChange('Monthly', displayStats.monthlyChangePercent)}
            {renderChange('6 Months', displayStats.sixMonthChangePercent)}
            {renderChange('1 Year', displayStats.oneYearChangePercent)}
            {renderChange('5 Years', displayStats.fiveYearChangePercent)}
            {renderChange('Max', displayStats.maxChangePercent)}

            <div className="stats-divider">Period Volume</div>
            <div className="stat-item">
              <span className="stat-label">Daily</span>
              <span className="stat-value">{displayStats.dailyVolume !== undefined ? formatVolume(displayStats.dailyVolume) : '-'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Weekly</span>
              <span className="stat-value">{displayStats.weeklyVolume !== undefined ? formatVolume(displayStats.weeklyVolume) : '-'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Monthly</span>
              <span className="stat-value">{displayStats.monthlyVolume !== undefined ? formatVolume(displayStats.monthlyVolume) : '-'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">6 Months</span>
              <span className="stat-value">{displayStats.sixMonthVolume !== undefined ? formatVolume(displayStats.sixMonthVolume) : '-'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">1 Year</span>
              <span className="stat-value">{displayStats.oneYearVolume !== undefined ? formatVolume(displayStats.oneYearVolume) : '-'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">5 Years</span>
              <span className="stat-value">{displayStats.fiveYearVolume !== undefined ? formatVolume(displayStats.fiveYearVolume) : '-'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Max</span>
              <span className="stat-value">{displayStats.maxVolume !== undefined ? formatVolume(displayStats.maxVolume) : '-'}</span>
            </div>
            <div className="stats-divider">OHL Stats</div>
            <div className="ohl-header">
              <span></span>
              <span>O</span>
              <span>H</span>
              <span>L</span>
            </div>
            {['1m', '5m', '30m', '1h', '4h', '1d', '30d', '6m', '1y', '2y', '5y', 'max'].map(period => {
              const periodData = displayStats.periodStats?.[period];
              const hasData = !!periodData;
              return (
                <div key={period} className={`ohl-row ${!hasData ? 'no-data' : ''}`}>
                  <span className="stat-label">{period}</span>
                  <span className={`stat-value ${!hasData ? 'na' : ''}`}>{hasData ? formatNumber(periodData.open, 0) : '-'}</span>
                  <span className={`stat-value ${hasData ? 'positive' : 'na'}`}>{hasData ? formatNumber(periodData.high, 0) : '-'}</span>
                  <span className={`stat-value ${hasData ? 'negative' : 'na'}`}>{hasData ? formatNumber(periodData.low, 0) : '-'}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="loading-small">Select a ticker for details</div>
        )}
      </div>

    </div>
  )
}
