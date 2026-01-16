import React from 'react'

interface ToolbarProps {
  timeframe: 'all' | '1y' | '6m' | '3m' | '1m'
  onTimeframeChange: (timeframe: 'all' | '1y' | '6m' | '3m' | '1m') => void
}

export const Toolbar: React.FC<ToolbarProps> = ({ timeframe, onTimeframeChange }) => {
  const timeframes: Array<{ label: string; value: 'all' | '1y' | '6m' | '3m' | '1m' }> = [
    { label: '1M', value: '1m' },
    { label: '3M', value: '3m' },
    { label: '6M', value: '6m' },
    { label: '1Y', value: '1y' },
    { label: 'ALL', value: 'all' },
  ]

  return (
    <div className="toolbar">
      {timeframes.map((tf) => (
        <button
          key={tf.value}
          className={`time-button ${timeframe === tf.value ? 'active' : ''}`}
          onClick={() => onTimeframeChange(tf.value)}
        >
          {tf.label}
        </button>
      ))}
    </div>
  )
}
