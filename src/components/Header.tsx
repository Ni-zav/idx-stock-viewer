import React from 'react'
import { AddTickerModal } from './AddTickerModal'

interface HeaderProps {
  selectedTicker: string;
  updateStatus: 'idle' | 'updating' | 'completed' | 'error';
  updateMessage: string;
  onUpdate: () => void;
  candleCount: number;
  autoUpdateInProgress?: boolean;
  currentView: 'dashboard' | 'chart';
  onViewChange: (view: 'dashboard' | 'chart') => void;
  // Streaming props
  streamingEnabled?: boolean;
  onStreamingToggle?: (enabled: boolean) => void;
  streamingConnected?: boolean;
  // Modal controls
  showAddTickerModal?: boolean;
  onAddTickerModalChange?: (show: boolean) => void;
  onHelpClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  selectedTicker, 
  updateStatus, 
  updateMessage, 
  onUpdate,
  candleCount,
  autoUpdateInProgress = false,
  currentView,
  onViewChange,
  streamingEnabled = false,
  onStreamingToggle,
  streamingConnected = false,
  showAddTickerModal = false,
  onAddTickerModalChange,
  onHelpClick,
}) => {
  const handleStreamingToggle = () => {
    if (onStreamingToggle) {
      onStreamingToggle(!streamingEnabled)
    }
  }

  const handleAddTickerClick = () => {
    if (onAddTickerModalChange) {
      onAddTickerModalChange(true)
    }
  }

  const handleAddTickerClose = () => {
    if (onAddTickerModalChange) {
      onAddTickerModalChange(false)
    }
  }

  return (
    <>
      <div className="header">
        <div className="title">IDX TERMINAL</div>
        <div className="nav-items unified-nav">
          <button 
            className={`nav-btn nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => onViewChange('dashboard')}
            title="Switch to Dashboard (Tab)"
          >
            DASHBOARD <span className="hotkey-hint">TAB</span>
          </button>
          <button 
            className={`nav-btn nav-item ${currentView === 'chart' ? 'active' : ''}`}
            onClick={() => onViewChange('chart')}
            title="Switch to Charts (Tab)"
          >
            CHARTS <span className="hotkey-hint">TAB</span>
          </button>
          <button 
            className="nav-btn nav-item add-ticker-nav-btn" 
            onClick={handleAddTickerClick}
            title="Add New Ticker (A)"
          >
            + <span className="hotkey-hint">A</span>
          </button>

          {/* Separator / Ticker Info */}
          {currentView === 'chart' && <div className="nav-text ticker-info">{selectedTicker}</div>}
          
          {/* Streaming Toggle */}
          <button
            className={`nav-btn nav-item stream-btn ${streamingEnabled ? 'streaming' : ''} ${streamingEnabled ? 'active' : ''}`}
            onClick={handleStreamingToggle}
            title={streamingEnabled ? 'Disable live streaming (L)' : 'Enable live stream (L)'}
          >
            <span className="stream-icon">{streamingEnabled ? '📡' : '📴'}</span>
            <span className="stream-label">{streamingEnabled ? 'LIVE' : 'OFF'}</span>
            <span className="hotkey-hint">L</span>
          </button>
          
          {streamingEnabled && (
             <div className={`nav-text stream-status-bulb ${streamingConnected ? 'connected' : 'disconnected'}`}>
               {streamingConnected ? '●' : '○'}
             </div>
          )}

          {/* Update Button */}
          <button
            className={`nav-btn nav-item update-btn ${updateStatus}`}
            onClick={onUpdate}
            disabled={updateStatus === 'updating'}
            title="Update All Data (U)"
          >
            {updateStatus === 'updating' ? '⟳' : '↻'} <span className="mobile-hide">UPDATE</span> <span className="hotkey-hint">U</span>
          </button>
          
          {/* Status Messages (Hidden on very small mobile to save space or shown as text item) */}
          {updateMessage && <div className="nav-text status-msg">{updateMessage}</div>}
          
          {autoUpdateInProgress && (
            <div className="nav-text auto-sync-indicator" title="Auto-updating in background">
              <span className="sync-icon">⟳</span>
            </div>
          )}

          {/* Help */}
          <button 
            className="nav-btn nav-item help-btn" 
            onClick={onHelpClick}
            title="Keyboard Shortcuts (?)"
          >
            ? <span className="hotkey-hint">?</span>
          </button>
        </div>
      </div>
      
      {showAddTickerModal && (
        <AddTickerModal 
          onClose={handleAddTickerClose} 
          onTickerAdded={() => {
             // Optional: trigger refresh if needed
          }} 
        />
      )}
    </>
  )
}

