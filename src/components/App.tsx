
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ChartData } from '../types'
import { parseSingleTickerCSV, parseTickers, convertToCandleData, convertToVolumeData, calculateStats, calculateComprehensiveStats, getCachedTickerData, setCachedTickerData, aggregateByTimeframe, TimeframeType, fillIntradayGaps, fillVolumeGaps } from '../utils'
import { ChartComponent } from './ChartComponent'
import { Sidebar, SidebarLivePrice } from './Sidebar'
import { Header } from './Header'
import { Dashboard, LivePriceData } from './Dashboard'
import { HelpModal } from './HelpModal'
import { useWebSocket } from '../hooks/useWebSocket'

const API_URL = 'http://localhost:3001'

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'chart'>('dashboard')
  const [rawData, setRawData] = useState<ChartData[]>([])
  const [tickers, setTickers] = useState<string[]>([])
  const [selectedTicker, setSelectedTicker] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string>('')
  
  // Timeframe state
  const [timeframe, setTimeframe] = useState<TimeframeType>('1D')
  const [customDays, setCustomDays] = useState<number>(7)
  const [showGaps, setShowGaps] = useState(false) // Toggle for non-trading time gaps

  // Update state
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'updating' | 'completed' | 'error'>('idle')
  const [updateMessage, setUpdateMessage] = useState<string>('')
  const [lastDate, setLastDate] = useState<string | null>(null)
  const [autoUpdateInProgress, setAutoUpdateInProgress] = useState(false)
  const [hasAutoChecked, setHasAutoChecked] = useState(false)

  // Search state for ticker dropdown
  const [tickerSearch, setTickerSearch] = useState('')
  const [isTickerDropdownOpen, setIsTickerDropdownOpen] = useState(false)

  // Streaming state
  const [streamingEnabled, setStreamingEnabled] = useState(false)

  // Track currently visible tickers on dashboard
  const [visibleTickers, setVisibleTickers] = useState<string[]>([])
  // Ref to track prev visible tickers to avoid redundant socket calls
  const prevVisibleTickersRef = useRef<string[]>([])

  // Track live prices for real-time updates
  const [livePrices, setLivePrices] = useState<Record<string, LivePriceData>>({})

  // Sidebar data - always uses daily + intraday for comprehensive stats
  const [sidebarDailyData, setSidebarDailyData] = useState<ChartData[]>([])
  const [sidebarIntradayData, setSidebarIntradayData] = useState<{
    '1m'?: ChartData[];
    '5m'?: ChartData[];
    '1h'?: ChartData[];
  }>({})

  // Modal states (for keyboard control)
  const [showAddTickerModal, setShowAddTickerModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [isTimeframeDropdownOpen, setIsTimeframeDropdownOpen] = useState(false)

  // Dashboard keyboard triggers
  const [dashboardSortTrigger, setDashboardSortTrigger] = useState<{ field: string; timestamp: number } | null>(null)
  const [dashboardSelectTrigger, setDashboardSelectTrigger] = useState<number | null>(null)

  // Ref for ticker search input
  const tickerSearchRef = useRef<HTMLInputElement>(null)
  
  // Track highlighted index in search dropdown
  const [tickerSearchIndex, setTickerSearchIndex] = useState(0)


  // WebSocket connection
  const { connected: wsConnected, lastMessage, subscribe, unsubscribe } = useWebSocket({
    url: 'ws://localhost:3001/ws/stream',
    autoConnect: streamingEnabled
  })

  // Fetch initial prices on mount to get latest buffered data
  useEffect(() => {
    const fetchInitialPrices = async () => {
      try {
        const res = await fetch(`${API_URL}/api/prices`);
        if (res.ok) {
          const json = await res.json();
          if (json.prices) {
            setLivePrices(prev => ({ ...prev, ...json.prices }));
          }
        }
      } catch (e) {
        console.error("Failed to fetch initial prices:", e);
      }
    };
    fetchInitialPrices();
  }, []);

  // Handle WebSocket messages
  // PHASE 2: Support both batched and individual price messages
  useEffect(() => {
    if (lastMessage) {
      // Handle batched prices (more efficient)
      if (lastMessage.type === 'prices_batch' && lastMessage.data) {
        const batchData = lastMessage.data as Record<string, any>;
        setLivePrices(prev => {
          const updated = { ...prev };
          for (const [ticker, priceData] of Object.entries(batchData)) {
            updated[ticker] = {
              price: priceData.price,
              prevClose: priceData.prevClose || priceData.price,
              open: priceData.open || priceData.price,
              high: priceData.high || priceData.price,
              low: priceData.low || priceData.price,
              volume: priceData.volume || 0,
              change: priceData.change || 0,
              changePercent: priceData.changePercent || 0,
              direction: priceData.direction || 'neutral',
              source: priceData.source || 'unknown',
              timestamp: priceData.timestamp || Date.now(),
            };
          }
          return updated;
        });
      }
      // Handle individual price (backward compatibility)
      else if (lastMessage.type === 'live_price' && lastMessage.ticker && lastMessage.price !== undefined) {
        const ticker = lastMessage.ticker;
        setLivePrices(prev => ({
          ...prev,
          [ticker]: {
            price: lastMessage.price!,
            prevClose: lastMessage.prevClose || lastMessage.price!,
            open: lastMessage.open || lastMessage.price!,
            high: lastMessage.high || lastMessage.price!,
            low: lastMessage.low || lastMessage.price!,
            volume: lastMessage.volume || 0,
            change: lastMessage.change || 0,
            changePercent: lastMessage.changePercent || 0,
            direction: lastMessage.direction || 'neutral',
            source: lastMessage.source || 'unknown',
            timestamp: lastMessage.timestamp || Date.now(),
          }
        }))
      }
    }
  }, [lastMessage])

  // Sync visible tickers with streaming subscription
  useEffect(() => {
    if (streamingEnabled && wsConnected && visibleTickers.length > 0) {
      // Check if meaningfully changed (simple length check or first element check?)
      // A deep compare is expensive, but typically visible tickers change only on sort/scroll or initial load.
      // We will check if the set is identical.
      const prev = prevVisibleTickersRef.current;
      const isDiff = prev.length !== visibleTickers.length || prev[0] !== visibleTickers[0] || prev[prev.length-1] !== visibleTickers[visibleTickers.length-1];
      
      if (isDiff) {
         console.log(`[APP] Updating streaming subscription for ${visibleTickers.length} visible tickers`);
         unsubscribe(); // Clear previous
         subscribe(visibleTickers); // Subscribe new
         prevVisibleTickersRef.current = visibleTickers;
      }
    }
  }, [streamingEnabled, wsConnected, visibleTickers, subscribe, unsubscribe]);

  // Handle Visible Tickers Change from Dashboard
  const handleVisibleTickersChange = useCallback((tickers: string[]) => {
    setVisibleTickers(tickers);
  }, []);

  // Filter tickers for search dropdown (defined early for keyboard handler)
  const filteredTickers = useMemo(() => {
    if (!tickerSearch) return tickers.slice(0, 100)
    return tickers.filter(t => t.toLowerCase().includes(tickerSearch.toLowerCase())).slice(0, 50)
  }, [tickers, tickerSearch])


  // Reset search index when search query changes
  useEffect(() => {
    setTickerSearchIndex(0)
  }, [tickerSearch, isTickerDropdownOpen])

  // Global keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInputFocused = tagName === 'input' || tagName === 'textarea' || target.isContentEditable;

      // Handle navigation/selection in ticker search dropdown
      if (isTickerDropdownOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setTickerSearchIndex(prev => Math.min(prev + 1, filteredTickers.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setTickerSearchIndex(prev => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter' && filteredTickers.length > 0) {
          e.preventDefault();
          const selected = filteredTickers[tickerSearchIndex] || filteredTickers[0];
          setSelectedTicker(selected);
          setIsTickerDropdownOpen(false);
          setTickerSearch('');
          setCurrentView('chart');
          return;
        }
      }

      // Escape closes modals/dropdowns
      if (e.key === 'Escape') {
        if (showHelpModal) setShowHelpModal(false);
        else if (showAddTickerModal) setShowAddTickerModal(false);
        else if (isTickerDropdownOpen) setIsTickerDropdownOpen(false);
        return;
      }

      // Don't process other hotkeys if an input is focused
      if (isInputFocused) return;

      // Number keys 1-9, 0 for selecting tickers by rank (dashboard only)
      if (currentView === 'dashboard' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 0 && num <= 9) {
          e.preventDefault();
          setDashboardSelectTrigger(num);
          setTimeout(() => setDashboardSelectTrigger(null), 100);
          return;
        }
      }

      // Shift+key for sorting (dashboard only)
      if (e.shiftKey && currentView === 'dashboard') {
        const sortKeys: Record<string, string> = {
          'P': 'p', 'D': 'd', 'W': 'w', 'M': 'm', 'Y': 'y', 'X': 'x', 'T': 't', 'V': 'v'
        };
        const sortField = sortKeys[e.key.toUpperCase()];
        if (sortField) {
          e.preventDefault();
          setDashboardSortTrigger({ field: sortField, timestamp: Date.now() });
          return;
        }
      }

      // Single key shortcuts
      switch (e.key.toLowerCase()) {
        case '/':
          e.preventDefault();
          if (currentView === 'chart') {
            setIsTickerDropdownOpen(true);
            setTimeout(() => tickerSearchRef.current?.focus(), 50);
          }
          break;
        case 'a':
          e.preventDefault();
          setShowAddTickerModal(true);
          break;
        case 'tab':
          if (!e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            setCurrentView(prev => prev === 'dashboard' ? 'chart' : 'dashboard');
          }
          break;
        case 'g':
          if (currentView === 'chart') {
            e.preventDefault();
            setShowGaps(prev => !prev);
          }
          break;
        case 'l':
          e.preventDefault();
          // Set pending action - will be handled by useEffect
          setPendingAction({ type: 'toggleStreaming', timestamp: Date.now() });
          break;
        case 'u':
          e.preventDefault();
          if (updateStatus !== 'updating') {
            setPendingAction({ type: 'update', timestamp: Date.now() });
          }
          break;
        case 't':
          if (currentView === 'chart') {
            e.preventDefault();
            setIsTimeframeDropdownOpen(prev => !prev);
          }
          break;
        case '?':
          e.preventDefault();
          setShowHelpModal(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentView, 
    isTickerDropdownOpen, 
    showHelpModal, 
    showAddTickerModal, 
    streamingEnabled, 
    updateStatus,
    filteredTickers,
    tickerSearchIndex,
  ]);

  // State for pending keyboard actions
  const [pendingAction, setPendingAction] = useState<{ type: string; timestamp: number } | null>(null);

  // Phase 1: Load tickers function (exposed for refresh)
  const fetchTickersList = useCallback(async () => {
    try {
      if (tickers.length === 0) setLoading(true)
      const response = await fetch('/data/idx_tickers.csv?t=' + Date.now())
      if (!response.ok) throw new Error('Failed to load tickers')
      const text = await response.text()
      const tickersList = parseTickers(text)
      setTickers(tickersList)
      
      // Select first ticker by default if none selected
      if (!selectedTicker && tickersList.length > 0) {
        setSelectedTicker(tickersList[0])
      }
      
      setError('')
    } catch (err) {
      setError(`Error loading tickers: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [tickers.length, selectedTicker])

  useEffect(() => {
    fetchTickersList()
  }, [])

  // Phase 2: Load the selected ticker's data from its individual file
  // Helper to get data source path based on timeframe
  const getDataSourcePath = useCallback((tf: TimeframeType, ticker: string): string => {
    // Intraday timeframes -> fetch from intraday folders
    if (['1m', '2m', '3m', '4m'].includes(tf)) {
      return `/data/intraday/1m/${ticker}.csv`
    }
    if (['5m', '10m', '15m', '20m', '30m'].includes(tf)) {
      return `/data/intraday/5m/${ticker}.csv`
    }
    if (['1h', '2h', '3h', '4h'].includes(tf)) {
      return `/data/intraday/1h/${ticker}.csv`
    }
    // Daily and above -> fetch from tickers folder
    return `/data/tickers/${ticker}.csv`
  }, [])

  const loadTickerData = useCallback(async (forceRefresh = false) => {
    if (!selectedTicker) return

    // Create cache key that includes timeframe group (for intraday vs daily)
    const isIntraday = ['1m', '2m', '3m', '4m', '5m', '10m', '15m', '20m', '30m', '1h', '2h', '3h', '4h'].includes(timeframe)
    const cacheKey = isIntraday ? `${selectedTicker}-intraday-${timeframe}` : selectedTicker

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedTickerData(cacheKey)
      if (cached.length > 0) {
        setRawData(cached)
        const lastCachedDate = cached[cached.length - 1]?.date
        setLastDate(lastCachedDate || null)
        return
      }
    }

    try {
      setDataLoading(true)
      const basePath = getDataSourcePath(timeframe, selectedTicker)
      const url = forceRefresh ? `${basePath}?t=${Date.now()}` : basePath
      
      const response = await fetch(url)
      
      if (!response.ok) {
        // For intraday, show helpful message if data doesn't exist yet
        if (isIntraday) {
          console.warn(`Intraday data not available: ${basePath}`)
          setError(`No ${timeframe} data for ${selectedTicker}. Enable streaming to fetch.`)
          setRawData([])
          return
        }
        throw new Error(`Failed to load data for ${selectedTicker}`)
      }
      
      const text = await response.text()
      const data = parseSingleTickerCSV(text, selectedTicker)
      setCachedTickerData(cacheKey, data)
      setRawData(data)
      const lastDataDate = data[data.length - 1]?.date
      setLastDate(lastDataDate || null)
      setError('')
    } catch (err) {
      console.error('Error loading ticker data:', err)
      setError(`Failed to load ${selectedTicker}`)
    } finally {
      setDataLoading(false)
    }
  }, [selectedTicker, timeframe, getDataSourcePath])

  // Load sidebar data (always daily + intraday for comprehensive stats)
  const loadSidebarData = useCallback(async (ticker: string) => {
    if (!ticker) return

    try {
      // Always load daily data for sidebar
      const dailyPath = `/data/tickers/${ticker}.csv`
      const dailyRes = await fetch(dailyPath)
      if (dailyRes.ok) {
        const text = await dailyRes.text()
        const data = parseSingleTickerCSV(text, ticker)
        setSidebarDailyData(data)
      }

      // Try to load intraday data (silently fail if not available)
      const intradayData: { '1m'?: ChartData[]; '5m'?: ChartData[]; '1h'?: ChartData[] } = {}

      // Load 1m data
      try {
        const res1m = await fetch(`/data/intraday/1m/${ticker}.csv`)
        if (res1m.ok) {
          const text = await res1m.text()
          intradayData['1m'] = parseSingleTickerCSV(text, ticker)
        }
      } catch { /* ignore */ }

      // Load 5m data
      try {
        const res5m = await fetch(`/data/intraday/5m/${ticker}.csv`)
        if (res5m.ok) {
          const text = await res5m.text()
          intradayData['5m'] = parseSingleTickerCSV(text, ticker)
        }
      } catch { /* ignore */ }

      // Load 1h data
      try {
        const res1h = await fetch(`/data/intraday/1h/${ticker}.csv`)
        if (res1h.ok) {
          const text = await res1h.text()
          intradayData['1h'] = parseSingleTickerCSV(text, ticker)
        }
      } catch { /* ignore */ }

      setSidebarIntradayData(intradayData)
    } catch (err) {
      console.error('Error loading sidebar data:', err)
    }
  }, [])

  useEffect(() => {
    if (selectedTicker) {
      setError('')
      loadTickerData()
      loadSidebarData(selectedTicker) // Load sidebar data in parallel
    }
  }, [selectedTicker, loadTickerData, loadSidebarData])

  // Smart auto-check on load
  const checkAndUpdate = useCallback(async (ticker: string) => {
    if (!ticker || autoUpdateInProgress) return

    try {
      // Check if ticker needs update
      const checkRes = await fetch(`${API_URL}/api/smart-check/${ticker}`)
      if (!checkRes.ok) return

      const checkData = await checkRes.json()
      
      // If needs update, trigger smart update in background
      if (checkData.needs_update) {
        console.log(`${ticker} needs update (last: ${checkData.last_date}), updating...`)
        setAutoUpdateInProgress(true)
        
        const updateRes = await fetch(`${API_URL}/api/smart-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ticker, 
            priorityOnly: false,
            maxUpdates: 50 // Limit background updates
          })
        })

        if (updateRes.ok) {
          // Poll for completion (but don't block UI)
          let attempts = 0
          const pollProgress = async () => {
            if (attempts > 300) { // 5 min timeout
              setAutoUpdateInProgress(false)
              return
            }
            
            const progressRes = await fetch(`${API_URL}/api/update/progress`)
            const progress = await progressRes.json()

            if (progress.status === 'completed') {
              console.log(`Auto-update completed for ${ticker}`)
              setAutoUpdateInProgress(false)
              // Refresh the data for this ticker with proper timeframe-aware key
              const isIntraday = ['1m', '2m', '3m', '4m', '5m', '10m', '15m', '20m', '30m', '1h', '2h', '3h', '4h'].includes(timeframe)
              const cacheKey = isIntraday ? `${ticker}-intraday-${timeframe}` : ticker
              setCachedTickerData(cacheKey, [])
              await loadTickerData(true)
            } else if (progress.status === 'error') {
              console.error('Auto-update failed')
              setAutoUpdateInProgress(false)
            } else if (progress.inProgress) {
              attempts++
              setTimeout(pollProgress, 1000)
            }
          }
          setTimeout(pollProgress, 1000)
        }
      } else {
        console.log(`${ticker} is up to date (last: ${checkData.last_date})`)
      }
    } catch (err) {
      console.error('Auto-check error:', err)
    }
  }, [autoUpdateInProgress, loadTickerData])

  // Auto-check when ticker is selected (only once per session)
  useEffect(() => {
    if (selectedTicker && !hasAutoChecked && !autoUpdateInProgress) {
      setHasAutoChecked(true)
      // Small delay to let UI load first
      setTimeout(() => {
        checkAndUpdate(selectedTicker)
      }, 1000)
    }
  }, [selectedTicker, hasAutoChecked, autoUpdateInProgress, checkAndUpdate])

  // Update ticker data from Yahoo Finance
  const handleUpdateData = async () => {
    if (updateStatus === 'updating') return
    setUpdateStatus('updating')
    setUpdateMessage('Connecting...')

    try {
      const response = await fetch(`${API_URL}/api/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (!response.ok) throw new Error('Failed to start update')

      setUpdateMessage(`Updating...`)

      let attempts = 0
      const maxAttempts = 600

      const pollProgress = async () => {
        const progressRes = await fetch(`${API_URL}/api/update/progress`)
        const progress = await progressRes.json()

        if (progress.status === 'completed') {
          setUpdateStatus('completed')
          setUpdateMessage('Updated!')
          if (selectedTicker) {
            // Clear cache with proper timeframe-aware key
            const isIntraday = ['1m', '2m', '3m', '4m', '5m', '10m', '15m', '20m', '30m', '1h', '2h', '3h', '4h'].includes(timeframe)
            const cacheKey = isIntraday ? `${selectedTicker}-intraday-${timeframe}` : selectedTicker
            setCachedTickerData(cacheKey, [])
            await loadTickerData(true)
          }
          setTimeout(() => { setUpdateStatus('idle'); setUpdateMessage('') }, 2000)
        } else if (progress.status === 'error') {
          setUpdateStatus('error')
          setUpdateMessage('Failed')
          setTimeout(() => { setUpdateStatus('idle'); setUpdateMessage('') }, 3000)
        } else if (progress.inProgress && attempts < maxAttempts) {
          attempts++
          setTimeout(pollProgress, 1000)
        }
      }
      setTimeout(pollProgress, 500)
    } catch (err) {
      console.error('Update error:', err)
      setUpdateStatus('error')
      setUpdateMessage('Error')
      setTimeout(() => { setUpdateStatus('idle'); setUpdateMessage('') }, 5000)
    }
  }

  const aggregatedData = useMemo(() => {
    return aggregateByTimeframe(rawData, timeframe, customDays)
  }, [rawData, timeframe, customDays])

  // Create effective raw data that includes the live candle for stats calculation
  const effectiveRawData = useMemo(() => {
    if (rawData.length === 0 || !selectedTicker) return rawData

    const live = livePrices[selectedTicker]
    if (!live) return rawData

    // Check if we need to append or update the last candle
    const data = [...rawData]
    const lastCandle = data[data.length - 1]
    
    // Simple date comparison for daily data
    // For intraday, we'd need more complex timestamp logic
    const lastDate = new Date(lastCandle.date).toISOString().split('T')[0]
    const today = new Date().toISOString().split('T')[0]

    // If live data exists, we essentially want to treat it as the current state of the market
    // For daily charts: Update today's candle if it exists, or append if it's a new day
    if (timeframe === '1D') {
      if (lastDate === today) {
        // Update existing candle
        data[data.length - 1] = {
          ...lastCandle,
          close: live.price,
          high: Math.max(lastCandle.high, live.high, live.price),
          low: live.low > 0 ? Math.min(lastCandle.low, live.low, live.price) : Math.min(lastCandle.low, live.price),
          volume: live.volume > 0 ? live.volume : lastCandle.volume,
        }
      } else {
        // Append new day candle (approximate, since we might miss some open/low/high details)
        data.push({
          date: new Date().toISOString().replace('T', ' ').split('.')[0], // Format: YYYY-MM-DD HH:mm:ss
          ticker: selectedTicker,
          open: live.open || live.price,
          high: live.high || live.price,
          low: live.low || live.price,
          close: live.price,
          adjClose: live.price,
          volume: live.volume || 0,
        })
      }
    } 
    // For intraday, it's safer to just let the chart handle visual updates 
    // and use this purely for "Stats" calculation which relies on "Current Price"
    // So we can technically just return the array with the last close updated to current price
    // to make stats accurate.
    else {
      // Intraday stats override
       data[data.length - 1] = {
          ...lastCandle,
          close: live.price
        }
    }

    return data
  }, [rawData, livePrices, selectedTicker, timeframe])

  // Convert to chart format and optionally fill gaps
  const { candleData, volumeData } = useMemo(() => {
    // Use effectiveRawData for visual chart updates too if desired, 
    // but ChartComponent handles livePrice prop separately for smoother animation.
    // However, feeding it here ensures full consistency.
    const aggregated = aggregateByTimeframe(effectiveRawData, timeframe, customDays)
    
    let candles = convertToCandleData(aggregated)
    let volumes = convertToVolumeData(aggregated)
    
    // Apply gap-filling when showGaps is enabled (all timeframes)
    if (showGaps && candles.length > 0) {
      // Determine interval in minutes based on timeframe
      const intervalMinutes: Record<string, number> = {
        '1m': 1, '2m': 2, '3m': 3, '4m': 4, '5m': 5,
        '10m': 10, '15m': 15, '20m': 20, '30m': 30,
        '1h': 60, '2h': 120, '3h': 180, '4h': 240,
        '1D': 1440,      // 24 hours
        '1W': 10080,     // 7 days
        '1M': 43200,     // 30 days (approx)
        '1Y': 525600,    // 365 days (approx)
      }
      
      const interval = intervalMinutes[timeframe] || 1440 // Default to daily
      candles = fillIntradayGaps(candles, interval)
      volumes = fillVolumeGaps(volumes, candles)
    }
    
    return { candleData: candles, volumeData: volumes }
  }, [effectiveRawData, showGaps, timeframe, customDays])
  
  // Calculate stats using COMPREHENSIVE data (daily + intraday for all periods)
  // This ensures sidebar always shows all periods regardless of chart timeframe
  const stats = useMemo(() => {
    // If we have sidebar daily data, use comprehensive stats
    if (sidebarDailyData.length > 0) {
      // Apply live price to daily data for current price
      const dailyWithLive = [...sidebarDailyData]
      const live = selectedTicker ? livePrices[selectedTicker] : null
      if (live && dailyWithLive.length > 0) {
        const lastCandle = dailyWithLive[dailyWithLive.length - 1]
        dailyWithLive[dailyWithLive.length - 1] = {
          ...lastCandle,
          close: live.price,
          high: Math.max(lastCandle.high, live.high || live.price),
          low: live.low > 0 ? Math.min(lastCandle.low, live.low) : lastCandle.low,
        }
      }
      return calculateComprehensiveStats(dailyWithLive, sidebarIntradayData)
    }
    // Fallback to basic stats from chart data
    return calculateStats(effectiveRawData)
  }, [sidebarDailyData, sidebarIntradayData, effectiveRawData, selectedTicker, livePrices])

  // Handle streaming toggle
  const handleStreamingToggle = useCallback(async (enabled: boolean) => {
    setStreamingEnabled(enabled)

    try {
      if (enabled) {
        // Init with currently visible tickers or fallback
        const initTickers = visibleTickers.length > 0 ? visibleTickers : tickers.slice(0, 50);
        
        // Start real-time streaming (WebSocket price updates)
        await fetch(`${API_URL}/api/streaming/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: initTickers, intervalMs: 10000 })
        })
        console.log('[STREAM] Started streaming');
        
        // Also fetch intraday for active ticker immediately
        if (selectedTicker) {
           // ... logic from before ...
        }
      } else {
        // Stop streaming
        await fetch(`${API_URL}/api/streaming/stop`, { method: 'POST' })
        console.log('[STREAM] Stopped streaming')
      }
    } catch (e) {
      console.error('[STREAM] Error toggling streaming:', e)
    }
  }, [tickers, selectedTicker, timeframe, visibleTickers])

  // Handle pending keyboard actions
  useEffect(() => {
    if (!pendingAction) return;

    if (pendingAction.type === 'toggleStreaming') {
      handleStreamingToggle(!streamingEnabled);
    } else if (pendingAction.type === 'update') {
      handleUpdateData();
    }

    setPendingAction(null);
  }, [pendingAction, streamingEnabled, handleStreamingToggle]);


  return (
    <div className="app">
      <Header 
        selectedTicker={selectedTicker} 
        updateStatus={updateStatus}
        updateMessage={updateMessage}
        onUpdate={handleUpdateData}
        candleCount={aggregatedData.length}
        autoUpdateInProgress={autoUpdateInProgress}
        currentView={currentView}
        onViewChange={setCurrentView}
        streamingEnabled={streamingEnabled}
        onStreamingToggle={handleStreamingToggle}
        streamingConnected={wsConnected}
        showAddTickerModal={showAddTickerModal}
        onAddTickerModalChange={setShowAddTickerModal}
        onHelpClick={() => setShowHelpModal(true)}
      />
      
      {currentView === 'chart' && (
      <div className="toolbar">
        <div className="dropdown-group">
          {/* Ticker Picker Dropdown */}
          <div className="custom-dropdown ticker-dropdown">
            <button 
              className="nav-btn dropdown-toggle"
              onClick={() => setIsTickerDropdownOpen(!isTickerDropdownOpen)}
              title="Search Ticker (/)"
            >
              {selectedTicker || 'Select Ticker'} <span className="arrow">▼</span> <span className="hotkey-hint">/</span>
            </button>
            {isTickerDropdownOpen && (
              <div className="dropdown-menu">
                <input 
                  ref={tickerSearchRef}
                  type="text" 
                  className="dropdown-search" 
                  placeholder="Search... (/)" 
                  value={tickerSearch}
                  autoFocus
                  onChange={(e) => setTickerSearch(e.target.value)}
                />
                <div className="dropdown-list">
                  {filteredTickers.map((t, i) => (
                    <div 
                      key={t} 
                      ref={el => {
                        if (i === tickerSearchIndex && isTickerDropdownOpen) {
                          el?.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                      className={`dropdown-item ${selectedTicker === t ? 'active' : ''} ${i === tickerSearchIndex ? 'highlighted' : ''}`}
                      onClick={() => {
                        setSelectedTicker(t)
                        setIsTickerDropdownOpen(false)
                        setTickerSearch('')
                      }}
                      onMouseEnter={() => setTickerSearchIndex(i)}
                    >
                      {t}
                    </div>
                  ))}
                  {filteredTickers.length === 0 && <div className="dropdown-no-results">No tickers found</div>}
                </div>
              </div>
            )}
          </div>

          {/* Timeframe Dropdown */}
          <div className="custom-dropdown timeframe-dropdown" title="Select Timeframe (T)">
            <select 
              className="select-input"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TimeframeType)}
            >
              <optgroup label="Intraday">
                <option value="1m">1 Minute</option>
                <option value="2m">2 Minutes</option>
                <option value="3m">3 Minutes</option>
                <option value="4m">4 Minutes</option>
                <option value="5m">5 Minutes</option>
                <option value="10m">10 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="20m">20 Minutes</option>
                <option value="30m">30 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="2h">2 Hours</option>
                <option value="3h">3 Hours</option>
                <option value="4h">4 Hours</option>
              </optgroup>
              <optgroup label="Daily+">
                <option value="1D">Daily</option>
                <option value="1W">Weekly</option>
                <option value="1M">Monthly</option>
                <option value="1Y">Yearly</option>
                <option value="custom">Custom</option>
              </optgroup>
            </select>
            <span className="hotkey-hint">T</span>
            {timeframe === 'custom' && (
              <div className="custom-days-inline">
                <input
                  type="number"
                  min="2"
                  max="365"
                  value={customDays}
                  onChange={(e) => setCustomDays(Math.max(2, Math.min(365, parseInt(e.target.value) || 7)))}
                  className="days-input"
                />
                <span>days</span>
              </div>
            )}
          </div>

          {/* Gap Toggle */}
          <button
            className={`nav-btn btn-terminal gap-toggle ${showGaps ? 'active' : ''}`}
            onClick={() => setShowGaps(!showGaps)}
            title={showGaps ? 'Hide non-trading gaps (G)' : 'Show non-trading gaps (weekends, holidays) (G)'}
          >
            {showGaps ? '⊟ HIDE GAPS' : '⊞ SHOW GAPS'} <span className="hotkey-hint">G</span>
          </button>
        </div>
      </div>
      )}

      <div className="main-layout flex-1 overflow-hidden">
        {currentView === 'dashboard' ? (
          <Dashboard 
            onTickerSelect={(t) => {
              setSelectedTicker(t);
              setCurrentView('chart');
            }}
            updateStatus={updateStatus}
            livePrices={livePrices}
            onVisibleTickersChange={handleVisibleTickersChange}
            sortTrigger={dashboardSortTrigger}
            selectByRankTrigger={dashboardSelectTrigger}
          />
        ) : (
          <>
            <div className="chart-main-container">
              <div className={`chart-wrapper ${dataLoading ? 'loading' : ''}`}>
                {error ? (
                  <div className="error">{error}</div>
                ) : loading || (!selectedTicker) ? (
                  <div className="loading">
                    {loading ? 'Loading tickers...' : 'Select a ticker'}
                  </div>
                ) : dataLoading ? (
                  <div className="loading">Loading data...</div>
                ) : rawData.length === 0 ? (
                  <div className="loading">No data for {selectedTicker}</div>
                ) : (
                  <ChartComponent 
                    candleData={candleData} 
                    volumeData={volumeData} 
                    showGaps={showGaps}
                    livePrice={selectedTicker && livePrices[selectedTicker] ? {
                      price: livePrices[selectedTicker].price,
                      high: livePrices[selectedTicker].high,
                      low: livePrices[selectedTicker].low,
                    } : undefined}
                  />
                )}
              </div>
            </div>
            
            <Sidebar
              stats={stats}
              tickers={tickers}
              selectedTicker={selectedTicker}
              onTickerSelect={setSelectedTicker}
              loading={loading}
              onRefresh={fetchTickersList}
              livePrice={selectedTicker && livePrices[selectedTicker] ? {
                price: livePrices[selectedTicker].price,
                prevClose: livePrices[selectedTicker].prevClose,
                open: livePrices[selectedTicker].open,
                high: livePrices[selectedTicker].high,
                low: livePrices[selectedTicker].low,
                volume: livePrices[selectedTicker].volume,
                direction: livePrices[selectedTicker].direction,
                changePercent: livePrices[selectedTicker].changePercent,
              } : null}
            />
          </>
        )}
      </div>

      {/* Help Modal */}
      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
    </div>
  )
}

export default App
