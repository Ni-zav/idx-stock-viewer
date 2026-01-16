/**
 * API server with WebSocket streaming support
 * Run with: node api-server.js
 */

import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Create HTTP server for both Express and WebSocket
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws/stream' });

// Streaming state
let streamingEnabled = false;
let streamingTickers = new Set();
let streamingInterval = null;
let connectedClients = new Set();
let allTickers = [];
let backgroundTickerIndex = 0;
let lastFetchTimes = { '5m': 0, '1h': 0 };
let streamingSessionId = 0; // Incremented each time streaming starts, used to cancel stale fetches
let activeStreamingProcesses = new Set(); // Track spawned processes for cleanup

// ============================================
// PHASE 1 OPTIMIZATIONS: In-memory price cache
// ============================================
const priceCache = new Map(); // ticker -> { price, timestamp, ...data }
const PRICE_CACHE_TTL = 60000; // 1 minute TTL for cache entries

// Helper: Check if currently in trading hours (IDX: 09:00-16:00 WIB, Mon-Fri)
function isInTradingHours() {
  const now = new Date();
  // Convert to WIB (UTC+7)
  const wibHour = (now.getUTCHours() + 7) % 24;
  const dayOfWeek = now.getUTCDay();
  
  // Weekend check (Saturday=6, Sunday=0)
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  
  // Trading hours: 09:00 - 16:00 WIB
  return wibHour >= 9 && wibHour < 16;
}

// Helper: Get adaptive polling interval based on trading hours
function getAdaptiveInterval() {
  if (isInTradingHours()) {
    return 5000; // 5 seconds during trading hours
  }
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  // Weekend: poll very infrequently
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 300000; // 5 minutes on weekends
  }
  // Outside trading hours on weekday
  return 30000; // 30 seconds
}

// Helper: Update price cache and return if price changed
function updatePriceCache(ticker, data) {
  const existing = priceCache.get(ticker);
  const priceChanged = !existing || existing.price !== data.price;
  priceCache.set(ticker, { ...data, cachedAt: Date.now() });
  return priceChanged;
}

// Helper: Get cached price if fresh
function getCachedPrice(ticker) {
  const cached = priceCache.get(ticker);
  if (cached && (Date.now() - cached.cachedAt) < PRICE_CACHE_TTL) {
    return cached;
  }
  return null;
}

// Load all tickers for background streaming
function loadAllTickers() {
  try {
    const content = fs.readFileSync(join(__dirname, 'public/data/idx_tickers.csv'), 'utf8');
    const lines = content.split('\n').slice(1); // skip header
    allTickers = lines
      .map(line => line.split(',')[0].trim().toUpperCase())
      .filter(t => t && !t.startsWith('#'));
    console.log(`[INFO] Loaded ${allTickers.length} tickers for background streaming`);
  } catch (e) {
    console.error('Failed to load tickers:', e);
  }
}
loadAllTickers();

// Helper: Get last price from ticker CSV (tries intraday sources first)
async function getLastPrice(ticker) {
  const sources = [
    { path: `public/data/intraday/1m/${ticker}.csv`, source: '1m' },
    { path: `public/data/intraday/5m/${ticker}.csv`, source: '5m' },
    { path: `public/data/intraday/1h/${ticker}.csv`, source: '1h' },
    { path: `public/data/tickers/${ticker}.csv`, source: 'daily' },
  ];

  let bestCandidate = null;
  let prevClose = null;

  // 1. Get Daily Data first to establish prevClose baseline
  try {
    const dailyPath = join(__dirname, `public/data/tickers/${ticker}.csv`);
    if (fs.existsSync(dailyPath)) {
      const content = fs.readFileSync(dailyPath, 'utf8');
      const lines = content.trim().split('\n');
      if (lines.length >= 2) {
        const headers = lines[0].split(',').map(h => h.trim());
        const closeIdx = headers.indexOf('Close');
        const dateIdx = headers.indexOf('Date');
        
        if (closeIdx !== -1 && dateIdx !== -1) {
          // Check last line
          const lastLine = lines[lines.length - 1];
          const lastVals = lastLine.split(',');
          // Check second to last line
          const prevLine = lines[lines.length - 2];
          const prevVals = prevLine.split(',');
          
          const lastDateStr = lastVals[dateIdx];
          // Use Jakarta time for "today" to match IDX market time
          const todayStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Jakarta' }).split(',')[0];
          
          // If daily has today's date, then prevClose is the one before it
          if (lastDateStr.startsWith(todayStr)) {
             prevClose = parseFloat(prevVals[closeIdx]);
          } else {
             // If daily is old (yesterday), then THAT is the prevClose for today
             prevClose = parseFloat(lastVals[closeIdx]);
          }
          
          // Also prefer daily execution if it is somehow fresher or only source
          // But usually intraday is fresher.
          // We will process daily as a candidate in the loop below anyway.
        }
      }
    }
  } catch (e) {
    // Daily file might be missing or locked
  }

  // 2. Check ALL sources for the freshest timestamp
  for (const { path, source } of sources) {
    try {
      const fullPath = join(__dirname, path);
      if (!fs.existsSync(fullPath)) continue;
      
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.trim().split('\n');
      if (lines.length < 2) continue;
      
      // Parse header
      const headers = lines[0].split(',').map(h => h.trim());
      const closeIdx = headers.indexOf('Close');
      const openIdx = headers.indexOf('Open');
      const highIdx = headers.indexOf('High');
      const lowIdx = headers.indexOf('Low');
      const volumeIdx = headers.indexOf('Volume');
      const dateIdx = headers.indexOf('Date'); // Or 'Datetime' for intraday
      
      if (closeIdx === -1) continue;
      
      // Get last data row
      const lastLine = lines[lines.length - 1];
      const values = lastLine.split(',');
      
      const close = parseFloat(values[closeIdx]);
      if (isNaN(close) || close <= 0) continue;

      const dateStr = values[dateIdx] || '';
      // Parse date to timestamp for comparison
      // Intraday format often: YYYY-MM-DD HH:MM:SS or similar
      // Daily format: YYYY-MM-DD
      const timestamp = new Date(dateStr).getTime();
      
      if (isNaN(timestamp)) continue;

      const candidate = {
        ticker,
        price: close,
        open: parseFloat(values[openIdx]) || close,
        high: parseFloat(values[highIdx]) || close,
        low: parseFloat(values[lowIdx]) || close,
        prevClose: prevClose || close, // Fallback if no daily data found
        volume: parseFloat(values[volumeIdx]) || 0,
        timestamp: timestamp, // Use actual data timestamp
        source,
        date: dateStr,
      };

      // Selection Rule: Newest wins. If tie, higher resolution (1m) wins.
      if (!bestCandidate) {
        bestCandidate = candidate;
      } else {
        if (candidate.timestamp > bestCandidate.timestamp) {
           bestCandidate = candidate;
        } else if (candidate.timestamp === bestCandidate.timestamp) {
           // Tie-breaker: 1m > 5m > 1h > daily
           const priorities = { '1m': 4, '5m': 3, '1h': 2, 'daily': 1 };
           if (priorities[candidate.source] > priorities[bestCandidate.source]) {
             bestCandidate = candidate;
           }
        }
      }
      
    } catch (e) {
      // Continue to next source
    }
  }
  
  if (bestCandidate) {
      // Recalculate change based on the robust prevClose
      if (bestCandidate.prevClose && bestCandidate.prevClose > 0) {
          bestCandidate.change = bestCandidate.price - bestCandidate.prevClose;
          bestCandidate.changePercent = ((bestCandidate.price - bestCandidate.prevClose) / bestCandidate.prevClose) * 100;
      }
      
      // Ensure we have a timestamp for the cache that reflects NOW if it's live data, 
      // but strictly speaking we should probably respect the data time.
      // However, for "live" feel, if data is very recent (e.g. < 5 mins), keeping original ts is fine.
      // The previous code returned "Date.now()" which is misleading if data is stale.
      // Let's return the data timestamp, but maybe add a 'fetchedAt' field.
      bestCandidate.fetchedAt = Date.now();
      
      return bestCandidate;
  }
  
  return null;
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// Disable CSP for development
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy-Report-Only', "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*");
  next();
});

// Track running updates
let updateInProgress = false;
let updateOutput = [];
let updateStatus = 'idle';

/**
 * Run generic Python script
 * @param {string} scriptName - Name of the script to run
 * @param {string[]} args - Arguments to pass to the script
 * @param {object} options - Options
 * @param {boolean} options.silent - If true, don't log output
 * @param {boolean} options.isStreamingProcess - If true, track for cancellation when streaming stops
 */
function runScript(scriptName, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(__dirname, scriptName);
    const pythonCmd = process.platform === 'win32' 
      ? join(__dirname, '.venv', 'Scripts', 'python.exe')
      : 'python';

    const python = spawn(pythonCmd, [scriptPath, ...args], {
      cwd: __dirname,
      shell: false
    });

    // Track streaming processes for cleanup
    if (options.isStreamingProcess) {
      activeStreamingProcesses.add(python);
    }

    let output = [];
    let error = '';

    python.stdout.on('data', (data) => {
      const text = data.toString();
      output.push(text);
      if (updateInProgress) updateOutput.push(text);
      if (!options.silent) console.log(text);
    });

    python.stderr.on('data', (data) => {
      const text = data.toString();
      error += text;
      if (updateInProgress) updateOutput.push(`[ERROR] ${text}`);
      console.error(text);
    });

    python.on('close', (code) => {
      // Remove from tracking set
      if (options.isStreamingProcess) {
        activeStreamingProcesses.delete(python);
      }
      
      if (code === 0) {
        resolve({ success: true, output: output.join('') });
      } else {
        // Don't reject if killed (code null) - this is expected when streaming stops
        if (code === null && options.isStreamingProcess) {
          resolve({ success: false, output: '', killed: true });
        } else {
          reject(new Error(error || `Process exited with code ${code}`));
        }
      }
    });

    python.on('error', (err) => {
      if (options.isStreamingProcess) {
        activeStreamingProcesses.delete(python);
      }
      reject(err);
    });
  });
}

/**
 * Legacy wrapper for update_data.py
 */
function runPythonScript(args = []) {
  return runScript('update_data.py', args);
}

// ============================================
// WebSocket Streaming
// ============================================

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  connectedClients.add(ws);
  
  // Send current streaming status
  ws.send(JSON.stringify({
    type: 'status',
    streaming: streamingEnabled,
    tickers: Array.from(streamingTickers)
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('[WS] Received:', data);
      
      if (data.type === 'subscribe') {
        // Add tickers to streaming set
        if (data.tickers && Array.isArray(data.tickers)) {
          data.tickers.forEach(t => streamingTickers.add(t.toUpperCase()));
          console.log(`[WS] Subscribed to: ${data.tickers.join(', ')}`);
        }
      } else if (data.type === 'unsubscribe') {
        // Remove tickers from streaming set
        if (data.tickers && Array.isArray(data.tickers)) {
          data.tickers.forEach(t => streamingTickers.delete(t.toUpperCase()));
        } else {
          // Unsubscribe all
          streamingTickers.clear();
        }
      }
    } catch (e) {
      console.error('[WS] Error parsing message:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    connectedClients.delete(ws);
  });
});

// Broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  connectedClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  });
}

// PHASE 3: Helper to broadcast price updates for a set of tickers
// Extracted for reuse in priority queue logic
async function broadcastPriceUpdates(tickerSet, currentSession) {
  if (!streamingEnabled || streamingSessionId !== currentSession) return;
  
  const changedPrices = {};
  
  await Promise.all(Array.from(tickerSet).map(async (ticker) => {
    if (!streamingEnabled || streamingSessionId !== currentSession) return;
    const priceData = await getLastPrice(ticker);
    if (priceData && streamingEnabled && streamingSessionId === currentSession) {
      const direction = priceData.price > priceData.prevClose ? 'up' : 
                       priceData.price < priceData.prevClose ? 'down' : 'neutral';
      
      const priceUpdate = {
        price: priceData.price,
        open: priceData.open,
        high: priceData.high,
        low: priceData.low,
        prevClose: priceData.prevClose,
        volume: priceData.volume,
        change: priceData.price - priceData.prevClose,
        changePercent: priceData.prevClose > 0 ? 
          ((priceData.price - priceData.prevClose) / priceData.prevClose) * 100 : 0,
        direction,
        source: priceData.source,
        timestamp: priceData.timestamp,
      };
      
      // Check if price actually changed (differential update)
      const priceChanged = updatePriceCache(ticker, priceUpdate);
      if (priceChanged) {
        changedPrices[ticker] = priceUpdate;
      }
    }
  }));
  
  // Batched broadcast
  if (streamingEnabled && streamingSessionId === currentSession) {
    const changedCount = Object.keys(changedPrices).length;
    if (changedCount > 0) {
      broadcast({
        type: 'prices_batch',
        data: changedPrices,
        count: changedCount,
        timestamp: Date.now()
      });
    }
  }
}

// Fetch and broadcast live prices (called by streaming interval)
async function fetchAndBroadcastPrices() {
  if (!streamingEnabled) return;
  if (streamingTickers.size === 0 && allTickers.length === 0) return;
  
  // Capture current session ID to detect if streaming was stopped during execution
  const currentSession = streamingSessionId;
  
  // 1. Priority Tickers (Visible)
  const priorityTickers = Array.from(streamingTickers);
  
  // 2. Background Tickers logic (Fetch a chunk in rotation)
  // PHASE 1: Reduced batch size from 100 to 30 for faster Yahoo Finance responses
  const BACKGROUND_BATCH_SIZE = 30;
  let backgroundBatch = [];
  
  if (allTickers.length > 0) {
      if (backgroundTickerIndex >= allTickers.length) {
          backgroundTickerIndex = 0;
      }
      backgroundBatch = allTickers.slice(backgroundTickerIndex, backgroundTickerIndex + BACKGROUND_BATCH_SIZE);
      backgroundTickerIndex += BACKGROUND_BATCH_SIZE;
  }
  
  // Combine priority and background tickers
  const combinedSet = new Set([...priorityTickers, ...backgroundBatch]);
  const combinedList = Array.from(combinedSet);
  
  // console.log(`[STREAM] Fetching prices for ${combinedList.length} tickers (${priorityTickers.length} priority)...`);
  
  // Smart Interval Scheduling
  const now = Date.now();
  const intervals = ['1m']; // Always fetch 1m for live updates

  // Fetch 5m every 60s
  if (!lastFetchTimes['5m'] || now - lastFetchTimes['5m'] >= 60000) {
    intervals.push('5m');
    lastFetchTimes['5m'] = now;
  }

  // Fetch 1h every 5 minutes
  if (!lastFetchTimes['1h'] || now - lastFetchTimes['1h'] >= 300000) {
    intervals.push('1h');
    lastFetchTimes['1h'] = now;
  }

  // Track which tickers were successfully updated
  const updatedTickers = new Set();

  // PHASE 3: Priority Queue - Fetch priority tickers FIRST, then background
  // This ensures visible tickers are updated within 2 seconds
  const fetchTickerBatch = async (tickerBatch, isPriority = false) => {
    if (tickerBatch.length === 0) return;
    const tickerList = tickerBatch.join(',');
    
    await Promise.all(intervals.map(async (interval) => {
      // Check if session is still valid (streaming wasn't stopped)
      if (!streamingEnabled || streamingSessionId !== currentSession) return;
      try {
        // Use intraday_fetcher to get latest data - mark as streaming process for cleanup
        const result = await runScript('intraday_fetcher.py', ['--batch', tickerList, '--interval', interval, '--json'], { silent: true, isStreamingProcess: true });
        
        // Check again after async operation
        if (!streamingEnabled || streamingSessionId !== currentSession || result.killed) return;

        // Parse result and track updated tickers
        const results = JSON.parse(result.output);
        results.forEach(result => {
          if (result.success) {
            updatedTickers.add(result.ticker);
          }
        });
      } catch (e) {
        // Ignore errors if streaming was stopped
        if (!streamingEnabled || streamingSessionId !== currentSession) return;
        if (!e.message?.includes('killed')) {
          console.error(`[STREAM] Error fetching ${interval} prices:`, e.message);
        }
      }
    }));

    // Broadcast immediately after priority batch for faster updates
    if (isPriority && updatedTickers.size > 0) {
      await broadcastPriceUpdates(updatedTickers, currentSession);
    }
  };

  // Fetch priority tickers first (visible on screen)
  if (priorityTickers.length > 0) {
    await fetchTickerBatch(priorityTickers, true);
  }
  
  // Then fetch background tickers
  if (backgroundBatch.length > 0) {
    await fetchTickerBatch(backgroundBatch.filter(t => !priorityTickers.includes(t)), false);
  }
  
  // Now broadcast live prices for all updated tickers
  // PHASE 1: Batch broadcasts and differential updates
  if (!streamingEnabled || streamingSessionId !== currentSession) return;
  
  const batchedPrices = {}; // Collect all prices for batched broadcast
  const changedPrices = {}; // Only prices that actually changed
  
  await Promise.all(Array.from(updatedTickers).map(async (ticker) => {
    if (!streamingEnabled || streamingSessionId !== currentSession) return;
    const priceData = await getLastPrice(ticker);
    if (priceData && streamingEnabled && streamingSessionId === currentSession) {
      // Calculate direction
      const direction = priceData.price > priceData.prevClose ? 'up' : 
                       priceData.price < priceData.prevClose ? 'down' : 'neutral';
      
      const priceUpdate = {
        price: priceData.price,
        open: priceData.open,
        high: priceData.high,
        low: priceData.low,
        prevClose: priceData.prevClose,
        volume: priceData.volume,
        change: priceData.price - priceData.prevClose,
        changePercent: priceData.prevClose > 0 ? 
          ((priceData.price - priceData.prevClose) / priceData.prevClose) * 100 : 0,
        direction,
        source: priceData.source,
        timestamp: priceData.timestamp,
      };
      
      batchedPrices[ticker] = priceUpdate;
      
      // Check if price actually changed (differential update)
      const priceChanged = updatePriceCache(ticker, priceUpdate);
      if (priceChanged) {
        changedPrices[ticker] = priceUpdate;
      }
    }
  }));
  
  // PHASE 1: Batched broadcast - send all changed prices in one message
  if (streamingEnabled && streamingSessionId === currentSession) {
    const changedCount = Object.keys(changedPrices).length;
    if (changedCount > 0) {
      // Send batched update for efficiency
      broadcast({
        type: 'prices_batch',
        data: changedPrices,
        count: changedCount,
        timestamp: Date.now()
      });
      // Also send individual updates for backward compatibility
      // (can be removed once frontend is updated)
      for (const [ticker, data] of Object.entries(changedPrices)) {
        broadcast({
          type: 'live_price',
          ticker,
          ...data
        });
      }
    }
  }
}

// API: Get streaming status
app.get('/api/streaming/status', (req, res) => {
  res.json({
    enabled: streamingEnabled,
    tickers: Array.from(streamingTickers),
    clients: connectedClients.size,
    tradingHours: isInTradingHours(),
    currentInterval: getAdaptiveInterval()
  });
});

// PHASE 1: API to get cached prices instantly (no file reads)
app.get('/api/prices', (req, res) => {
  const { tickers } = req.query;
  
  if (tickers) {
    // Return specific tickers
    const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
    const prices = {};
    for (const ticker of tickerList) {
      const cached = priceCache.get(ticker);
      if (cached) {
        prices[ticker] = cached;
      }
    }
    res.json({ prices, count: Object.keys(prices).length, cached: true });
  } else {
    // Return all cached prices
    const prices = Object.fromEntries(priceCache);
    res.json({ prices, count: priceCache.size, cached: true });
  }
});

// API: Start streaming
app.post('/api/streaming/start', (req, res) => {
  const { tickers = [], intervalMs = 10000 } = req.body;
  
  if (tickers.length > 0) {
    tickers.forEach(t => streamingTickers.add(t.toUpperCase()));
  }
  
  if (!streamingEnabled) {
    streamingEnabled = true;
    // Increment session ID to invalidate any stale operations from previous session
    streamingSessionId++;
    console.log(`[STREAM] New session started: ${streamingSessionId}`);
    
    // PHASE 1: Adaptive polling interval based on trading hours
    const adaptiveInterval = getAdaptiveInterval();
    const actualInterval = Math.max(adaptiveInterval, intervalMs > 0 ? intervalMs : adaptiveInterval);
    streamingInterval = setInterval(fetchAndBroadcastPrices, actualInterval);
    
    // Also set up interval adjustment every 5 minutes to adapt to trading hours changes
    const intervalAdjuster = setInterval(() => {
      if (!streamingEnabled) {
        clearInterval(intervalAdjuster);
        return;
      }
      const newInterval = getAdaptiveInterval();
      if (streamingInterval) {
        clearInterval(streamingInterval);
        streamingInterval = setInterval(fetchAndBroadcastPrices, newInterval);
        console.log(`[STREAM] Adjusted polling interval to ${newInterval}ms (trading: ${isInTradingHours()})`);
      }
    }, 300000); // Check every 5 minutes
    
    // Reset fetch timer to force immediate update
    lastFetchTimes = { '5m': 0, '1h': 0 };

    // Trigger immediate fetch
    fetchAndBroadcastPrices();

    console.log(`[STREAM] Started with ${streamingTickers.size} tickers, interval: ${actualInterval}ms (trading: ${isInTradingHours()})`);
  }
  
  broadcast({ type: 'streaming_started', tickers: Array.from(streamingTickers) });
  
  res.json({
    status: 'streaming',
    tickers: Array.from(streamingTickers),
    intervalMs
  });
});

// API: Stop streaming
app.post('/api/streaming/stop', (req, res) => {
  streamingEnabled = false;
  
  // Increment session ID to immediately invalidate all in-flight operations
  streamingSessionId++;
  console.log(`[STREAM] Stopped. Session invalidated: ${streamingSessionId}`);
  
  if (streamingInterval) {
    clearInterval(streamingInterval);
    streamingInterval = null;
  }
  
  // Kill all active streaming processes
  if (activeStreamingProcesses.size > 0) {
    console.log(`[STREAM] Killing ${activeStreamingProcesses.size} active streaming processes...`);
    for (const proc of activeStreamingProcesses) {
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        console.error('[STREAM] Error killing process:', e.message);
      }
    }
    activeStreamingProcesses.clear();
  }
  
  broadcast({ type: 'streaming_stopped' });
  
  res.json({ status: 'stopped' });
});

// API: Fetch intraday data manually
app.post('/api/intraday/fetch', async (req, res) => {
  const { tickers = [], interval = '1m' } = req.body;
  
  if (tickers.length === 0) {
    return res.status(400).json({ error: 'No tickers specified' });
  }
  
  try {
    const tickerList = tickers.join(',');
    const { output } = await runScript('intraday_fetcher.py', ['--batch', tickerList, '--interval', interval, '--json']);
    const results = JSON.parse(output);
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Run data cleanup
app.post('/api/data/cleanup', async (req, res) => {
  const { dryRun = false, aggregate = false, ticker = null } = req.body;
  
  try {
    const args = ['--json'];
    if (dryRun) args.push('--dry-run');
    if (aggregate) args.push('--aggregate');
    if (ticker) args.push('--ticker', ticker);
    
    const { output } = await runScript('data_cleanup.py', args);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// Existing API Endpoints
// ============================================

// API: Check status of tickers
app.get('/api/status', async (req, res) => {
  try {
    const ticker = req.query.ticker;
    const args = ['--check', '--json'];
    if (ticker) args.unshift(ticker);

    const { output } = await runPythonScript(args);
    const status = JSON.parse(output);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Update ticker(s)
app.post('/api/update', async (req, res) => {
  if (updateInProgress) {
    return res.status(409).json({ 
      error: 'Update already in progress',
      status: updateStatus,
      output: updateOutput 
    });
  }

  const { ticker } = req.body;
  
  updateInProgress = true;
  updateOutput = [];
  updateStatus = 'running';

  // Send immediate response
  res.json({ 
    message: `Update started${ticker ? ` for ${ticker}` : ' for all tickers'}`,
    status: 'running'
  });

  // Helper to run dashboard generation
  async function regenerateDashboard() {
    try {
      if (updateInProgress) updateOutput.push('Generating dashboard stats...');
      await runScript('generate_dashboard.py');
      if (updateInProgress) updateOutput.push('Dashboard updated.');
    } catch (e) {
      console.error('Failed to regenerate dashboard:', e);
    }
  }

  // Run update in background
  try {
    const args = ticker ? [ticker] : [];
    await runPythonScript(args);
    // Auto-generate dashboard after update
    await regenerateDashboard();
    updateStatus = 'completed';
  } catch (error) {
    updateStatus = 'error';
    updateOutput.push(`[ERROR] ${error.message}`);
  } finally {
    updateInProgress = false;
  }
});

// API: Get update progress
app.get('/api/update/progress', (req, res) => {
  res.json({
    inProgress: updateInProgress,
    status: updateStatus,
    output: updateOutput
  });
});

// API: Get last date for a ticker
app.get('/api/ticker/:ticker/last-date', async (req, res) => {
  try {
    const args = [req.params.ticker, '--check', '--json'];
    const { output } = await runPythonScript(args);
    const status = JSON.parse(output);
    res.json(status[0] || { ticker: req.params.ticker, last_date: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Smart check - check if a ticker needs updating
app.get('/api/smart-check/:ticker', async (req, res) => {
  try {
    const args = [req.params.ticker, '--check', '--json'];
    const { output } = await runScript('smart_update.py', args);
    const status = JSON.parse(output);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Smart update - prioritize one ticker, then update others
app.post('/api/smart-update', async (req, res) => {
  if (updateInProgress) {
    return res.status(409).json({ 
      error: 'Update already in progress',
      status: updateStatus,
      output: updateOutput 
    });
  }

  const { ticker, priorityOnly = false, maxUpdates = null } = req.body;
  
  updateInProgress = true;
  updateOutput = [];
  updateStatus = 'running';

  // Send immediate response
  res.json({ 
    message: `Smart update started${ticker ? ` (priority: ${ticker})` : ''}`,
    status: 'running',
    priorityTicker: ticker
  });

  // Run smart update in background
  try {
    const args = [];
    if (ticker) args.push(ticker);
    if (priorityOnly) args.push('--priority-only');
    if (maxUpdates) args.push('--max', maxUpdates.toString());
    
    await runScript('smart_update.py', args);
    // Auto-generate dashboard after smart update
    try {
      if (updateInProgress) updateOutput.push('Generating dashboard stats...');
      await runScript('generate_dashboard.py');
      if (updateInProgress) updateOutput.push('Dashboard updated.');
    } catch (e) {
      console.error('Failed to regenerate dashboard:', e);
    }
    updateStatus = 'completed';
  } catch (error) {
    updateStatus = 'error';
    updateOutput.push(`[ERROR] ${error.message}`);
  } finally {
    updateInProgress = false;
  }
});

// API: Add new ticker
app.post('/api/tickers/add', async (req, res) => {
  const { ticker } = req.body;
  
  if (!ticker || !/^[A-Z]{4}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker format. Must be 4 uppercase letters.' });
  }

  if (updateInProgress) {
    return res.status(409).json({ error: 'Update in progress. Please wait.' });
  }

  updateInProgress = true;
  updateOutput = [];
  updateStatus = 'running';

  try {
    // 1. Add to ticker list
    updateOutput.push(`Adding ${ticker} to list...`);
    await runScript('fetch_tickers.py', ['--add', ticker]);

    // 2. Download data
    updateOutput.push(`Downloading data for ${ticker}...`);
    const { output } = await runScript('redownload_all.py', [ticker]);
    
    // Check if download failed (redownload_all logic prints failures)
    if (output.includes("[NO DATA]") || output.includes("[FAILED]")) {
      await runScript('fetch_tickers.py', ['--remove', ticker]); // Cleanup
      throw new Error(`Failed to download data for ${ticker}. Ticker might be invalid or delisted.`);
    }

    // Auto-generate dashboard after add
    try {
      updateOutput.push('Generating dashboard stats...');
      await runScript('generate_dashboard.py');
      updateOutput.push('Dashboard updated.');
    } catch (e) {
      console.error('Failed to regenerate dashboard:', e);
    }
    
    // Read stats for the new ticker from dashboard.json
    let tickerStats = null;
    try {
      const fs = await import('fs/promises');
      const dashboardData = JSON.parse(await fs.readFile(join(__dirname, 'public/data/dashboard.json'), 'utf8'));
      const stats = dashboardData.find(d => d.t === ticker);
      if (stats) {
        tickerStats = {
          ticker: stats.t,
          current_price: stats.p,
          changes_all: stats.ca
        };
      }
    } catch (e) { console.error('Error reading stats', e); }
    
    // To get start info, read the CSV quickly
    try {
      const fs = await import('fs/promises');
      const csvContent = await fs.readFile(join(__dirname, `public/data/tickers/${ticker}.csv`), 'utf8');
      const lines = csvContent.trim().split('\n');
      if (lines.length > 1) {
         const firstLine = lines[1].split(','); 
         if (tickerStats) {
             tickerStats.start_date = firstLine[0];
             tickerStats.start_price = parseFloat(firstLine[4]);
         }
      }
    } catch (e) { console.error('Error reading csv stats', e); }

    res.json({ success: true, message: `Successfully added ${ticker}`, stats: tickerStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    updateInProgress = false;
    updateStatus = 'idle';
  }
});

// API: Generate Dashboard Data
app.post('/api/dashboard/generate', async (req, res) => {
  try {
    const { output } = await runScript('generate_dashboard.py');
    res.json({ success: true, message: 'Dashboard generated', output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend (catch-all for SPA routing)
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Use server.listen instead of app.listen with WebSocket
server.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws/stream`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /api/status              - Check all tickers status');
  console.log('  GET  /api/status?ticker=X     - Check specific ticker status');
  console.log('  POST /api/update              - Update all tickers');
  console.log('  POST /api/update {ticker}     - Update specific ticker');
  console.log('  GET  /api/update/progress     - Get update progress');
  console.log('  GET  /api/smart-check/:ticker - Check if ticker needs update');
  console.log('  POST /api/smart-update        - Smart prioritized update');
  console.log('');
  console.log('Streaming:');
  console.log('  GET  /api/streaming/status    - Get streaming status');
  console.log('  POST /api/streaming/start     - Start price streaming');
  console.log('  POST /api/streaming/stop      - Stop price streaming');
  console.log('  POST /api/intraday/fetch      - Fetch intraday data');
  console.log('  POST /api/data/cleanup        - Run data cleanup');
});

