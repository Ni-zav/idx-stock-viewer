import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface AddTickerModalProps {
  onClose: () => void;
  onTickerAdded: (ticker: string) => void;
}

export const AddTickerModal: React.FC<AddTickerModalProps> = ({ onClose, onTickerAdded }) => {
  const [ticker, setTicker] = useState('')
  /* New state for stats */
  const [tickerStats, setTickerStats] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAdd = async () => {
    if (!ticker || ticker.length !== 4) {
      setErrorMsg("Ticker must be 4 uppercase letters");
      setStatus('error');
      return;
    }

    setStatus('processing');
    setLogs(['Initializing request...']);
    setErrorMsg('');
    setTickerStats(null);

    const performRequest = async (retryCount = 0) => {
       try {
        if (retryCount === 0) {
            setLogs(prev => [...prev, `checking ${ticker}...`]);
        } else {
            // Update the last log line if it contains "System busy" or "checking"
            setLogs(prev => {
                const newLogs = [...prev];
                // remove last lines if they are attempts
                if (newLogs.length > 0 && (newLogs[newLogs.length - 1].includes('System busy') || newLogs[newLogs.length - 1].includes('Attempt'))) {
                    newLogs.pop();
                }
                return [...newLogs, `Checking ${ticker}... (Attempt ${retryCount + 1})`];
            });
        }
        
        const API_URL = 'http://localhost:3001'
        const res = await fetch(`${API_URL}/api/tickers/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: ticker.toUpperCase() })
        });

        // specific handling for "update in progress"
        if (res.status === 409) {
            // Check if we are approaching timeout
            if (retryCount < 20) { 
                setLogs(prev => {
                     const newLogs = [...prev];
                     // remove last attempt line
                     if (newLogs.length > 0 && newLogs[newLogs.length-1].includes('Attempt')) {
                         newLogs.pop();
                     }
                     return [...newLogs, `System busy/Updating. Retrying in 3s... (Attempt ${retryCount + 1})`];
                });
                setTimeout(() => performRequest(retryCount + 1), 3000);
                return;
            } else {
                throw new Error("System is busy. Please try again later.");
            }
        }

        const data = await res.json();
        
        if (res.ok) {
            setLogs(prev => [...prev, `Success: ${data.message}`]);
            if (data.stats) {
                setTickerStats(data.stats);
            }
            setStatus('success');
            onTickerAdded(ticker);
        } else {
            throw new Error(data.error || 'Failed to add ticker');
        }
       } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
        setStatus('error');
        setLogs(prev => [...prev, `Error: ${err instanceof Error ? err.message : 'Unknown'}`]);
       }
    };

    performRequest();
  }

  // Close only if not processing
  const handleClose = () => {
    if (status !== 'processing') {
      onClose();
    }
  }

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-window">
        <div className="modal-header">
          <span>ADD NEW TICKER</span>
          <button 
            className="modal-close-btn"
            onClick={handleClose}
            disabled={status === 'processing'}
          >
            ✕
          </button>
        </div>
        
        <div className="modal-body">
          <div className="input-group">
            <span className="input-prefix">IDX:</span>
            <input 
              type="text" 
              className="modal-input"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="BBCA"
              disabled={status === 'processing' || status === 'success'}
              onKeyDown={(e) => e.key === 'Enter' && status !== 'processing' && handleAdd()}
              autoFocus={status !== 'success'} // Autofocus if not success
            />
          </div>
          
          {!tickerStats && (
            <div className="modal-logs">
                {logs.map((log, i) => (
                <div key={i} className="log-line">{log}</div>
                ))}
                {status === 'processing' && <div className="log-line blink">_</div>}
            </div>
          )}

          {status === 'error' && (
            <div className="modal-error">
              {errorMsg}
            </div>
          )}

          {status === 'success' && (
             <div className="modal-success-container">
               <div className="success-msg">TICKER ADDED SUCCESSFULLY</div>
               {tickerStats && (
                   <div className="ticker-stats-table">
                       <div className="stat-row">
                           <span className="stat-label">TICKER</span>
                           <span className="stat-val">{tickerStats.ticker}</span>
                       </div>
                       <div className="stat-row">
                           <span className="stat-label">START DATE</span>
                           <span className="stat-val">{tickerStats.start_date}</span>
                       </div>
                       <div className="stat-row">
                           <span className="stat-label">START PRICE</span>
                           <span className="stat-val">{tickerStats.start_price}</span>
                       </div>
                       <div className="stat-row">
                           <span className="stat-label">CURRENT PRICE</span>
                           <span className="stat-val">{tickerStats.current_price}</span>
                       </div>
                       <div className="stat-row">
                           <span className="stat-label">ALL TIME CHG</span>
                           <span className={`stat-val ${tickerStats.changes_all >= 0 ? 'pos' : 'neg'}`}>
                               {tickerStats.changes_all > 0 ? '+' : ''}{tickerStats.changes_all ? tickerStats.changes_all.toFixed(2) : 0}%
                           </span>
                       </div>
                   </div>
               )}
             </div>
          )}
        </div>

        <div className="modal-footer">
          {status === 'success' ? (
             <button className="modal-btn primary" onClick={handleClose}>DONE</button>
          ) : (
            <button 
              className="modal-btn primary"
              onClick={handleAdd}
              disabled={status === 'processing' || ticker.length !== 4}
            >
              {status === 'processing' ? 'PROCESSING...' : 'ADD TICKER'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
