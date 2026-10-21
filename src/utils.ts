import Papa from 'papaparse'
import { ChartData, CandleData, VolumeData, TickerStats } from './types'

// Cache for parsed ticker data - only cache what's been loaded
let cachedTickerData: Map<string, ChartData[]> = new Map()

// Export the cache for direct access
export function setCachedTickerData(ticker: string, data: ChartData[]): void {
  cachedTickerData.set(ticker, data)
}

/**
 * Parse CSV for a single ticker file (already filtered, just needs parsing)
 * Much faster than parseCSVForTicker since no filtering needed
 */
export function parseSingleTickerCSV(csvText: string, ticker: string): ChartData[] {
  const lines = csvText.split('\n')
  if (lines.length < 2) return []

  // Parse header - trim each header to handle CRLF line endings
  const headers = lines[0].split(',').map(h => h.trim())
  const dateIdx = headers.indexOf('Date')
  const openIdx = headers.indexOf('Open')
  const highIdx = headers.indexOf('High')
  const lowIdx = headers.indexOf('Low')
  const closeIdx = headers.indexOf('Close')
  const adjCloseIdx = headers.indexOf('Adj Close')
  const volumeIdx = headers.indexOf('Volume')

  if (dateIdx === -1) return []

  const result: ChartData[] = []

  // Parse all lines - no ticker filtering needed
  // Use a Map to deduplicate by date (keep the last occurrence)
  const dataMap = new Map<string, ChartData>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(',')
    const date = values[dateIdx]?.trim()
    if (!date) continue

    dataMap.set(date, {
      date,
      ticker,
      open: parseFloat(values[openIdx]) || 0,
      high: parseFloat(values[highIdx]) || 0,
      low: parseFloat(values[lowIdx]) || 0,
      close: parseFloat(values[closeIdx]) || 0,
      adjClose: parseFloat(values[adjCloseIdx]) || 0,
      volume: parseFloat(values[volumeIdx]) || 0,
    })
  }

  // Convert to array and sort by date
  return Array.from(dataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/**
 * Parse CSV data for a specific ticker with optional date range
 * Optimized to only extract data for the target ticker (unsorted CSV)
 * @deprecated Use parseSingleTickerCSV with per-ticker files instead
 */
export function parseCSVForTicker(
  csvText: string,
  targetTicker: string,
  startDate?: Date,
  endDate?: Date
): ChartData[] {
  const lines = csvText.split('\n')
  if (lines.length < 2) return []

  // Parse header - trim each header to handle CRLF line endings
  const headers = lines[0].split(',').map(h => h.trim())
  const dateIdx = headers.indexOf('Date')
  const tickerIdx = headers.indexOf('Ticker')
  const openIdx = headers.indexOf('Open')
  const highIdx = headers.indexOf('High')
  const lowIdx = headers.indexOf('Low')
  const closeIdx = headers.indexOf('Close')
  const adjCloseIdx = headers.indexOf('Adj Close')
  const volumeIdx = headers.indexOf('Volume')

  if (tickerIdx === -1 || dateIdx === -1) return []

  const result: ChartData[] = []

  // Parse ALL lines and filter for target ticker
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(',')
    const ticker = values[tickerIdx]?.trim()

    // Only process rows for the target ticker
    if (ticker === targetTicker) {
      const date = values[dateIdx]?.trim()
      
      // Filter by date range if provided
      if (startDate || endDate) {
        const rowDate = new Date(date)
        if (startDate && rowDate < startDate) continue
        if (endDate && rowDate > endDate) continue
      }

      result.push({
        date: date || '',
        ticker: ticker,
        open: parseFloat(values[openIdx]) || 0,
        high: parseFloat(values[highIdx]) || 0,
        low: parseFloat(values[lowIdx]) || 0,
        close: parseFloat(values[closeIdx]) || 0,
        adjClose: parseFloat(values[adjCloseIdx]) || 0,
        volume: parseFloat(values[volumeIdx]) || 0,
      })
    }
  }

  // Sort by date since CSV is not sorted
  return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function parseTickers(csvText: string): string[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  const tickers = new Set<string>()
  parsed.data.forEach((row: Record<string, string>) => {
    const ticker = row.Ticker?.trim()
    if (ticker) tickers.add(ticker)
  })

  return Array.from(tickers).sort()
}

export function setCachedData(data: ChartData[]): void {
  // Index data by ticker for faster lookups
  cachedTickerData.clear()
  data.forEach((item) => {
    if (!cachedTickerData.has(item.ticker)) {
      cachedTickerData.set(item.ticker, [])
    }
    cachedTickerData.get(item.ticker)!.push(item)
  })
  
  // Sort each ticker's data by date
  cachedTickerData.forEach((tickerData) => {
    tickerData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  })
}

export function getCachedTickerData(ticker: string): ChartData[] {
  const data = cachedTickerData.get(ticker) || []
  // Ensure data is sorted by date
  return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/**
 * Convert date string to Unix timestamp for chart display.
 * 
 * Handles two formats:
 * 1. CSV format: "2026-01-02 02:00:00" (UTC without timezone suffix)
 * 2. ISO format: "2026-01-02T09:00:00.000Z" (from aggregation)
 * 
 * Both represent UTC times. We add WIB offset (+7h) for Jakarta display.
 */
export function dateToTimestamp(dateString: string): number {
  const value = dateString.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // A daily candle represents the exchange trading date (calendar day).
    return Math.floor(Date.parse(value + 'T00:00:00Z') / 1000)
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) {
    // Python stores intraday datetimes in UTC without a trailing Z.
    return Math.floor(Date.parse(value.replace(' ', 'T') + 'Z') / 1000)
  }
  return Math.floor(Date.parse(value) / 1000)
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatVolume(volume: number): string {
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(2)}K`
  return volume.toString()
}

export function getTickersByDate(data: ChartData[], date: string): string[] {
  const tickers = new Set<string>()
  for (const d of data) {
    if (d.date === date) {
      tickers.add(d.ticker)
    }
  }
  return Array.from(tickers).sort()
}

export function getTickerData(data: ChartData[], ticker: string): ChartData[] {
  return data.filter((d) => d.ticker === ticker).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function getUniqueTickets(data: ChartData[]): string[] {
  const tickers = new Set<string>()
  for (const d of data) {
    tickers.add(d.ticker)
  }
  return Array.from(tickers).sort()
}

export function convertToCandleData(data: ChartData[]): CandleData[] {
  // Sort by date first and filter out invalid dates
  const validData = data
    .filter((d) => {
      const timestamp = dateToTimestamp(d.date)
      return !isNaN(timestamp) && timestamp > 0
    })
    .sort((a, b) => dateToTimestamp(a.date) - dateToTimestamp(b.date))

  // Deduplicate by timestamp - keep the last occurrence for each unique timestamp
  const uniqueMap = new Map<number, ChartData>()
  validData.forEach((d) => {
    uniqueMap.set(dateToTimestamp(d.date), d)
  })

  return Array.from(uniqueMap.values()).map((d) => ({
    time: dateToTimestamp(d.date),
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }))
}

export function convertToVolumeData(data: ChartData[]): VolumeData[] {
  // Sort by date first and filter out invalid dates
  const validData = data
    .filter((d) => {
      const timestamp = dateToTimestamp(d.date)
      return !isNaN(timestamp) && timestamp > 0
    })
    .sort((a, b) => dateToTimestamp(a.date) - dateToTimestamp(b.date))

  // Deduplicate by timestamp - keep the last occurrence for each unique timestamp
  const uniqueMap = new Map<number, ChartData>()
  validData.forEach((d) => {
    uniqueMap.set(dateToTimestamp(d.date), d)
  })

  return Array.from(uniqueMap.values()).map((d) => ({
    time: dateToTimestamp(d.date),
    value: d.volume,
    color: d.close >= d.open ? 'rgba(0, 208, 132, 0.5)' : 'rgba(255, 77, 77, 0.5)',
  }))
}

export function calculateStats(data: ChartData[]): TickerStats | null {
  if (data.length === 0) return null

  const ticker = data[0].ticker
  const lastCandle = data[data.length - 1]
  const current = lastCandle.close
  
  // Basic stats
  const firstCandle = data[0]
  const open = lastCandle.open // Changed this to the last candle's open for daily stats
  const high = Math.max(...data.map((d) => d.high))
  const low = Math.min(...data.map((d) => d.low))
  const change = current - lastCandle.open
  const changePercent = (change / lastCandle.open) * 100
  const volume = data.reduce((sum, d) => sum + d.volume, 0)

  // Helper to get change percent over a period
  const getChangePercent = (daysAgo: number): number | undefined => {
    if (data.length < 2) return undefined
    
    const latestDate = new Date(lastCandle.date)
    const targetDate = new Date(latestDate)
    targetDate.setDate(latestDate.getDate() - daysAgo)
    
    // Find the candle closest to targetDate
    let closestCandle = data[0]
    let minDiff = Math.abs(new Date(data[0].date).getTime() - targetDate.getTime())
    
    for (const d of data) {
      const diff = Math.abs(new Date(d.date).getTime() - targetDate.getTime())
      if (diff < minDiff) {
        minDiff = diff
        closestCandle = d
      }
    }

    // If the closest candle is more than a few days away from the target date (for everything except Max), 
    // it might not be a valid comparison for shorter periods. 
    // But for simplicity, we'll use it.
    
    // For "Daily", we just want the previous day's close
    if (daysAgo === 1) {
      if (data.length > 1) {
        const prevClose = data[data.length - 2].close
        return ((current - prevClose) / prevClose) * 100
      }
      return undefined
    }

    if (closestCandle === lastCandle) return undefined

    return ((current - closestCandle.close) / closestCandle.close) * 100
  }

  // Helper to get volume sum over a period
  const getVolumeForPeriod = (daysAgo: number): number | undefined => {
    if (data.length < 1) return undefined
    
    const latestDate = new Date(lastCandle.date)
    const cutoffDate = new Date(latestDate)
    cutoffDate.setDate(latestDate.getDate() - daysAgo)
    
    // Sum volume for all candles within the period
    let totalVolume = 0
    let hasData = false
    
    for (const d of data) {
      const candleDate = new Date(d.date)
      if (candleDate >= cutoffDate) {
        totalVolume += d.volume
        hasData = true
      }
    }
    
    return hasData ? totalVolume : undefined
  }

  // Detect data granularity by looking at time between consecutive candles
  let dataGranularityMinutes = 1440 // Default to daily
  if (data.length >= 2) {
    const intervals: number[] = []
    for (let i = 1; i < Math.min(data.length, 10); i++) {
      const diff = new Date(data[i].date).getTime() - new Date(data[i-1].date).getTime()
      intervals.push(diff / (60 * 1000)) // Convert to minutes
    }
    // Use the median interval to avoid outliers
    intervals.sort((a, b) => a - b)
    dataGranularityMinutes = intervals[Math.floor(intervals.length / 2)]
  }

  // Helper to get Open/High/Low for a period (in minutes)
  // Only returns data if we have enough granularity for the period
  const getOHLForPeriod = (periodMinutes: number): { open: number; high: number; low: number } | undefined => {
    if (data.length < 1) return undefined
    
    // Skip periods that are smaller than our data granularity
    // (e.g., don't show 1m/5m/30m/1h/4h stats when we only have daily data)
    if (periodMinutes < dataGranularityMinutes) return undefined
    
    const latestDate = new Date(lastCandle.date)
    const cutoffDate = new Date(latestDate.getTime() - periodMinutes * 60 * 1000)
    
    // Filter candles within the period
    const periodCandles = data.filter(d => new Date(d.date) >= cutoffDate)
    
    // Need at least 2 candles to show meaningful data for a period
    // (except if period equals our granularity, then 1 is fine)
    if (periodCandles.length === 0) return undefined
    if (periodCandles.length === 1 && periodMinutes > dataGranularityMinutes * 1.5) return undefined
    
    return {
      open: periodCandles[0].open,
      high: Math.max(...periodCandles.map(c => c.high)),
      low: Math.min(...periodCandles.map(c => c.low)),
    }
  }

  // Calculate period stats for all required timeframes
  // Convert to minutes: 1m, 5m, 30m, 1h, 4h, 1d, 30d, 6m, 1y, 2y, 5y, max
  const periodDefinitions: { key: string; minutes: number }[] = [
    { key: '1m', minutes: 1 },
    { key: '5m', minutes: 5 },
    { key: '30m', minutes: 30 },
    { key: '1h', minutes: 60 },
    { key: '4h', minutes: 240 },
    { key: '1d', minutes: 1440 },
    { key: '30d', minutes: 1440 * 30 },
    { key: '6m', minutes: 1440 * 180 },
    { key: '1y', minutes: 1440 * 365 },
    { key: '2y', minutes: 1440 * 730 },
    { key: '5y', minutes: 1440 * 1825 },
  ]

  const periodStats: { [key: string]: { open: number; high: number; low: number } } = {}
  
  for (const period of periodDefinitions) {
    const ohlData = getOHLForPeriod(period.minutes)
    if (ohlData) {
      periodStats[period.key] = ohlData
    }
  }
  
  // Add 'max' which uses all data
  if (data.length > 0) {
    periodStats['max'] = {
      open: data[0].open,
      high: Math.max(...data.map(c => c.high)),
      low: Math.min(...data.map(c => c.low)),
    }
  }

  return {
    ticker,
    current,
    open,
    high,
    low,
    change,
    changePercent,
    volume,
    dailyChangePercent: getChangePercent(1),
    weeklyChangePercent: getChangePercent(7),
    monthlyChangePercent: getChangePercent(30),
    sixMonthChangePercent: getChangePercent(180),
    oneYearChangePercent: getChangePercent(365),
    fiveYearChangePercent: getChangePercent(1825),
    maxChangePercent: data.length > 0 ? ((current - data[0].close) / data[0].close) * 100 : 0,
    // Volume statistics
    dailyVolume: getVolumeForPeriod(1),
    weeklyVolume: getVolumeForPeriod(7),
    monthlyVolume: getVolumeForPeriod(30),
    sixMonthVolume: getVolumeForPeriod(180),
    oneYearVolume: getVolumeForPeriod(365),
    fiveYearVolume: getVolumeForPeriod(1825),
    maxVolume: volume, // Total volume for all data
    // Period-based OHL stats
    periodStats,
  }
}

/**
 * Calculate comprehensive stats using both daily and intraday data.
 * This ensures all periods (1m-max) are always displayed regardless of chart timeframe.
 * 
 * @param dailyData - Daily candle data (for 1d+ periods)
 * @param intradayData - Optional object with intraday data by interval
 */
export function calculateComprehensiveStats(
  dailyData: ChartData[],
  intradayData?: {
    '1m'?: ChartData[];
    '5m'?: ChartData[];
    '1h'?: ChartData[];
  }
): TickerStats | null {
  if (dailyData.length === 0) return null

  // First calculate base stats from daily data
  const baseStats = calculateStats(dailyData)
  if (!baseStats) return null

  // Now enhance periodStats with intraday data if available
  const enhancedPeriodStats: { [key: string]: { open: number; high: number; low: number } } = {
    ...baseStats.periodStats
  }

  // Helper to calculate OHL from intraday data for a specific period
  const getIntradayOHL = (data: ChartData[], periodMinutes: number): { open: number; high: number; low: number } | undefined => {
    if (!data || data.length === 0) return undefined

    const lastCandle = data[data.length - 1]
    const latestDate = new Date(lastCandle.date)
    const cutoffDate = new Date(latestDate.getTime() - periodMinutes * 60 * 1000)

    const periodCandles = data.filter(d => new Date(d.date) >= cutoffDate)
    if (periodCandles.length === 0) return undefined

    return {
      open: periodCandles[0].open,
      high: Math.max(...periodCandles.map(c => c.high)),
      low: Math.min(...periodCandles.map(c => c.low)),
    }
  }

  // Use 1m data for 1m, 5m, 30m periods
  if (intradayData?.['1m'] && intradayData['1m'].length > 0) {
    const data1m = intradayData['1m']
    const ohl1m = getIntradayOHL(data1m, 1)
    if (ohl1m) enhancedPeriodStats['1m'] = ohl1m
    
    const ohl5m = getIntradayOHL(data1m, 5)
    if (ohl5m) enhancedPeriodStats['5m'] = ohl5m
    
    const ohl30m = getIntradayOHL(data1m, 30)
    if (ohl30m) enhancedPeriodStats['30m'] = ohl30m
  }

  // Use 5m data for 1h periods (or fallback from 1m)
  if (intradayData?.['5m'] && intradayData['5m'].length > 0) {
    const data5m = intradayData['5m']
    const ohl1h = getIntradayOHL(data5m, 60)
    if (ohl1h) enhancedPeriodStats['1h'] = ohl1h
  } else if (intradayData?.['1m'] && intradayData['1m'].length > 0) {
    const ohl1h = getIntradayOHL(intradayData['1m'], 60)
    if (ohl1h) enhancedPeriodStats['1h'] = ohl1h
  }

  // Use 1h data for 4h periods
  if (intradayData?.['1h'] && intradayData['1h'].length > 0) {
    const data1h = intradayData['1h']
    const ohl4h = getIntradayOHL(data1h, 240)
    if (ohl4h) enhancedPeriodStats['4h'] = ohl4h
  } else if (intradayData?.['5m'] && intradayData['5m'].length > 0) {
    const ohl4h = getIntradayOHL(intradayData['5m'], 240)
    if (ohl4h) enhancedPeriodStats['4h'] = ohl4h
  }

  return {
    ...baseStats,
    periodStats: enhancedPeriodStats,
  }
}


export function filterDataByTimeframe(
  data: ChartData[],
  timeframe: 'all' | '1y' | '6m' | '3m' | '1m',
): ChartData[] {
  if (timeframe === 'all') return data

  const now = new Date()
  let cutoffDate: Date

  switch (timeframe) {
    case '1y':
      cutoffDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      break
    case '6m':
      cutoffDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
      break
    case '3m':
      cutoffDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
      break
    case '1m':
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
      break
    default:
      return data
  }

  return data.filter((d) => new Date(d.date) >= cutoffDate)
}
/**
 * Fill gaps in intraday/daily data with flat candles for proper time visualization.
 * This allows the chart to show actual time gaps (overnight, weekends, holidays).
 * 
 * @param candleData - Sorted candle data (timestamps already have Jakarta offset applied)
 * @param intervalMinutes - The expected interval in minutes (1, 5, 60, 1440 for daily)
 * @returns Data with gap-filling entries
 */
export function fillIntradayGaps(
  candleData: CandleData[],
  intervalMinutes: number
): CandleData[] {
  if (candleData.length < 2) return candleData
  
  const result: CandleData[] = []
  const intervalSeconds = intervalMinutes * 60
  
  // Smart max gaps based on interval to prevent memory issues
  // More granular timeframes = more gaps allowed
  let maxGapsPerJump: number
  if (intervalMinutes <= 1) {
    maxGapsPerJump = 500  // 1m: up to ~8 hours of gaps
  } else if (intervalMinutes <= 5) {
    maxGapsPerJump = 300  // 5m: up to ~25 hours
  } else if (intervalMinutes <= 60) {
    maxGapsPerJump = 200  // 1h: up to ~8 days
  } else {
    maxGapsPerJump = 50   // Daily+: up to ~50 days (weekends only)
  }
  
  for (let i = 0; i < candleData.length; i++) {
    const current = candleData[i]
    result.push(current)
    
    if (i < candleData.length - 1) {
      const next = candleData[i + 1]
      const currentTime = current.time as number
      const nextTime = next.time as number
      const gapSize = nextTime - currentTime
      
      // Fill all gaps that are larger than expected interval
      if (gapSize > intervalSeconds * 1.5) {
        // Calculate how many intervals are missing
        const missingIntervals = Math.floor(gapSize / intervalSeconds) - 1
        
        // Insert gap candles (flat at previous close)
        const lastClose = current.close
        const gapsToInsert = Math.min(missingIntervals, maxGapsPerJump)
        
        for (let j = 1; j <= gapsToInsert; j++) {
          const gapTime = currentTime + (j * intervalSeconds)
          result.push({
            time: gapTime,
            open: lastClose,
            high: lastClose,
            low: lastClose,
            close: lastClose,
          } as CandleData)
        }
      }
    }
  }
  return result
}


/**
 * Fill gaps in volume data to match gap-filled candle data
 */
export function fillVolumeGaps(
  volumeData: VolumeData[],
  candleDataWithGaps: CandleData[]
): VolumeData[] {
  const volumeMap = new Map<number, VolumeData>()
  volumeData.forEach(v => volumeMap.set(v.time as number, v))
  
  return candleDataWithGaps.map(candle => {
    const existing = volumeMap.get(candle.time as number)
    if (existing) {
      return existing
    }
    // Gap placeholder - zero volume, transparent
    return {
      time: candle.time,
      value: 0,
      color: 'transparent',
    } as VolumeData
  })
}

export type TimeframeType = 
  | '1m' | '2m' | '3m' | '4m' | '5m' | '10m' | '15m' | '20m' | '30m'  // Intraday minutes
  | '1h' | '2h' | '3h' | '4h'                         // Intraday hours
  | '1D' | '1W' | '1M' | '1Y' | 'custom'              // Daily and above

/**
 * Aggregate candles into larger timeframes
 * @param data - Candle data (can be intraday or daily)
 * @param timeframe - Target timeframe
 * @param customDays - Number of days per candle when timeframe is 'custom'
 */
export function aggregateByTimeframe(
  data: ChartData[],
  timeframe: TimeframeType,
  customDays: number = 7
): ChartData[] {
  if (data.length === 0) return []
  if (timeframe === '1D') return data // Daily - no aggregation needed
  if (timeframe === '1m') return data // 1 minute - no aggregation (base intraday)
  if (timeframe === '5m') return data // 5 minute - no aggregation when source is 5m
  if (timeframe === '1h') return data // 1 hour - no aggregation when source is 1h

  // Sort by date first
  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Group data by the target timeframe
  const groups = new Map<string, ChartData[]>()

  for (const candle of sorted) {
    const date = new Date(candle.date)
    let groupKey: string

    switch (timeframe) {
      // Intraday minute aggregations
      case '2m':
      case '3m':
      case '4m':
      case '5m':
      case '10m':
      case '15m':
      case '20m':
      case '30m': {
        const minutes = parseInt(timeframe)
        const roundedMinutes = Math.floor(date.getMinutes() / minutes) * minutes
        const groupDate = new Date(date)
        groupDate.setMinutes(roundedMinutes, 0, 0)
        groupKey = groupDate.toISOString()
        break
      }
      // Intraday hour aggregations
      case '1h':
      case '2h':
      case '3h':
      case '4h': {
        const hours = parseInt(timeframe)
        const roundedHours = Math.floor(date.getHours() / hours) * hours
        const groupDate = new Date(date)
        groupDate.setHours(roundedHours, 0, 0, 0)
        groupKey = groupDate.toISOString()
        break
      }
      case '1W': {
        // Group by week (start of week - Monday)
        const dayOfWeek = date.getDay()
        const monday = new Date(date)
        monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
        groupKey = monday.toISOString().split('T')[0]
        break
      }
      case '1M': {
        // Group by month
        groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
        break
      }
      case '1Y': {
        // Group by year
        groupKey = `${date.getFullYear()}-01-01`
        break
      }
      case 'custom': {
        // Group by N days from the first date
        const firstDate = new Date(sorted[0].date)
        const daysDiff = Math.floor((date.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
        const groupIndex = Math.floor(daysDiff / customDays)
        const groupStartDate = new Date(firstDate)
        groupStartDate.setDate(firstDate.getDate() + groupIndex * customDays)
        groupKey = groupStartDate.toISOString().split('T')[0]
        break
      }
      default:
        groupKey = candle.date
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(candle)
  }

  // Aggregate each group into a single candle
  const aggregated: ChartData[] = []

  for (const [groupDate, candles] of groups) {
    if (candles.length === 0) continue

    // OHLC aggregation rules:
    // Open = first candle's open
    // High = max of all highs
    // Low = min of all lows
    // Close = last candle's close
    // Volume = sum of all volumes
    const open = candles[0].open
    const high = Math.max(...candles.map(c => c.high))
    const low = Math.min(...candles.map(c => c.low))
    const close = candles[candles.length - 1].close
    const adjClose = candles[candles.length - 1].adjClose
    const volume = candles.reduce((sum, c) => sum + c.volume, 0)

    aggregated.push({
      date: groupDate,
      ticker: candles[0].ticker,
      open,
      high,
      low,
      close,
      adjClose,
      volume,
    })
  }

  // Sort by date
  return aggregated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
