import React, { useEffect, useRef, useCallback } from 'react'
import { createChart, ColorType, IChartApi, CandlestickSeries, IPriceLine } from 'lightweight-charts'
import { CandleData, VolumeData } from '../types'

interface LivePriceUpdate {
  price: number;
  high: number;
  low: number;
}

interface ChartComponentProps {
  candleData: CandleData[]
  volumeData: VolumeData[]
  showGaps?: boolean // If true, show non-trading time gaps (weekends, holidays)
  livePrice?: LivePriceUpdate // Real-time price to update last candle
}

export const ChartComponent: React.FC<ChartComponentProps> = ({ candleData, volumeData, showGaps = false, livePrice }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<CandlestickSeries<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<any>(null)
  const volumePriceLineRef = useRef<IPriceLine | null>(null) // Track volume crosshair marker
  const tooltipRef = useRef<HTMLDivElement>(null)
  const prevDataLengthRef = useRef<number>(0)
  const lastCandleRef = useRef<CandleData | null>(null)

  // Initialize chart once
  useEffect(() => {
    if (!containerRef.current) return

    // Create chart with Bloomberg styles
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#ffbd00', // Bloomberg Amber
        fontFamily: "'Roboto Mono', 'Courier New', monospace",
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 500, // Fallback height
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#222',
        rightOffset: 5,
        barSpacing: 6,
      },
      grid: {
        horzLines: { color: '#111' },
        vertLines: { color: '#111' },
      },
      localization: {
        locale: 'en-US',
      },
      rightPriceScale: {
        borderColor: '#222',
      },
      crosshair: {
        // Magnet mode snaps crosshair to data points
        mode: 1, // CrosshairMode.Magnet
        // Horizontal line styling
        horzLine: {
          visible: true,
          style: 1, // Dashed
          color: '#ffbd00',
          width: 1,
          labelVisible: true,
          labelBackgroundColor: '#ffbd00',
        },
        // Vertical line styling
        vertLine: {
          visible: true,
          style: 1, // Dashed
          color: '#ffbd00',
          width: 1,
          labelVisible: true,
          labelBackgroundColor: '#333',
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    })

    chartRef.current = chart

    // Bloomberg standard colors for candles
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00fb4c',
      downColor: '#ff3b3b',
      borderUpColor: '#00fb4c',
      borderDownColor: '#ff3b3b',
      wickUpColor: '#00fb4c',
      wickDownColor: '#ff3b3b',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(price).replace('IDR', 'Rp')
        }
      },
    })

    seriesRef.current = candlestickSeries

    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(0, 212, 255, 0.4)', // Accent blue for volume
      priceFormat: { 
        type: 'volume',
        precision: 0,
      },
      priceScaleId: 'volume',
      lastValueVisible: false, // Hidden - we use dynamic price line for hover instead
    })

    volumeSeriesRef.current = volumeSeries

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    // Better resizing with ResizeObserver
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !chartRef.current) return
      const { width, height } = entries[ENTRY_INDEX].contentRect
      chartRef.current.applyOptions({ width, height })
    })
    
    // Constant for ResizeObserver entry index
    const ENTRY_INDEX = 0
    resizeObserver.observe(containerRef.current)

    // Tooltip logic
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > containerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > containerRef.current!.clientHeight
      ) {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'none'
        }
        return
      }

      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'block'
        const data = param.seriesData.get(candlestickSeries) as any
        const volumeSeriesData = param.seriesData.get(volumeSeries) as any
        if (data) {
          const open = data.open !== undefined ? data.open : data.value
          const high = data.high !== undefined ? data.high : data.value
          const low = data.low !== undefined ? data.low : data.value
          const close = data.close !== undefined ? data.close : data.value
          const volume = volumeSeriesData?.value ?? 0
          
          // Update volume price line on y-axis to show hovered volume
          if (volumeSeries && volume > 0) {
            // Remove old price line if exists
            if (volumePriceLineRef.current) {
              volumeSeries.removePriceLine(volumePriceLineRef.current)
            }
            // Color based on candle direction (green = up, red = down)
            const volumeColor = close >= open ? '#00fb4c' : '#ff3b3b'
            // Create new price line at current volume
            volumePriceLineRef.current = volumeSeries.createPriceLine({
              price: volume,
              color: volumeColor,
              lineWidth: 1,
              lineStyle: 2, // Dashed
              axisLabelVisible: true,
              title: '',
            })
          }
          
          // Format volume (e.g., 1.5M, 500K)
          const formatVol = (v: number) => {
            if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
            if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
            if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
            return v.toLocaleString()
          }
          
          tooltipRef.current.innerHTML = `
            <div class="tooltip-row"><span>O</span> <span class="mono">${new Intl.NumberFormat('en-US').format(open)}</span></div>
            <div class="tooltip-row"><span>H</span> <span class="mono">${new Intl.NumberFormat('en-US').format(high)}</span></div>
            <div class="tooltip-row"><span>L</span> <span class="mono">${new Intl.NumberFormat('en-US').format(low)}</span></div>
            <div class="tooltip-row"><span>C</span> <span class="mono">${new Intl.NumberFormat('en-US').format(close)}</span></div>
            <div class="tooltip-row tooltip-vol"><span>V</span> <span class="mono">${formatVol(volume)}</span></div>
          `
          
          // Position tooltip
          const toolTipWidth = 110
          const toolTipHeight = 100
          const toolTipMargin = 15
          
          let left = param.point.x + toolTipMargin
          if (left > containerRef.current!.clientWidth - toolTipWidth) {
            left = param.point.x - toolTipMargin - toolTipWidth
          }
          
          let top = param.point.y + toolTipMargin
          if (top > containerRef.current!.clientHeight - toolTipHeight) {
            top = param.point.y - toolTipHeight - toolTipMargin
          }
          
          tooltipRef.current.style.left = left + 'px'
          tooltipRef.current.style.top = top + 'px'
        }
      }
    })

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [])

  // Update data logic
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || candleData.length === 0) return

    const isNewTicker = Math.abs(candleData.length - prevDataLengthRef.current) > 100 || prevDataLengthRef.current === 0
    prevDataLengthRef.current = candleData.length

    seriesRef.current.setData(candleData)
    
    // Store last candle for live updates
    lastCandleRef.current = candleData[candleData.length - 1]

    if (volumeSeriesRef.current && volumeData.length > 0) {
      volumeSeriesRef.current.setData(volumeData)
    }

    if (isNewTicker) {
      const timeScale = chartRef.current.timeScale()
      if (candleData.length > 100) {
        const fromTime = candleData[candleData.length - 100].time
        const toTime = candleData[candleData.length - 1].time
        timeScale.setVisibleRange({ from: fromTime, to: toTime })
      } else {
        timeScale.fitContent()
      }
    }
  }, [candleData, volumeData])
  
  // Live price update - update last candle in real-time
  useEffect(() => {
    if (!seriesRef.current || !livePrice || !lastCandleRef.current) return
    
    const lastCandle = lastCandleRef.current
    
    // Update last candle with live price
    const updatedCandle = {
      time: lastCandle.time,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, livePrice.high, livePrice.price),
      low: livePrice.low > 0 ? Math.min(lastCandle.low, livePrice.low, livePrice.price) : Math.min(lastCandle.low, livePrice.price),
      close: livePrice.price,
    }
    
    // Use update() for smooth real-time updates without full redraw
    seriesRef.current.update(updatedCandle)
  }, [livePrice])

  // Update timeScale when showGaps changes
  useEffect(() => {
    if (!chartRef.current) return

    // Note: lightweight-charts doesn't have a direct "show gaps" option.
    // By default, it hides gaps. To show gaps, we need to use a different
    // time scale setting. The chart will always show continuous data.
    // For true gap visualization, we would need to insert null/empty candles.
    // For now, we just update the barSpacing for better visibility.
    
    chartRef.current.timeScale().applyOptions({
      barSpacing: showGaps ? 3 : 6, // Smaller spacing when showing gaps to fit more data
    })
  }, [showGaps])

  return (
    <div className="chart-wrapper" ref={containerRef}>
      <div className="chart-tooltip" ref={tooltipRef} />
    </div>
  )
}
