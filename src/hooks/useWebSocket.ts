import { useState, useEffect, useRef, useCallback } from 'react'

export interface StreamMessage {
  type: string
  ticker?: string
  interval?: string
  timestamp?: number
  streaming?: boolean
  tickers?: string[]
  // Live price fields
  price?: number
  open?: number
  high?: number
  low?: number
  prevClose?: number
  volume?: number
  change?: number
  changePercent?: number
  direction?: 'up' | 'down' | 'neutral'
  source?: string
  // PHASE 2: Batched price update fields
  data?: Record<string, any> // For prices_batch type
  count?: number             // Number of prices in batch
}

export interface UseWebSocketOptions {
  url: string
  token?: string
  autoConnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

export interface UseWebSocketReturn {
  connected: boolean
  connecting: boolean
  lastMessage: StreamMessage | null
  send: (message: object) => void
  subscribe: (tickers: string[]) => void
  unsubscribe: (tickers?: string[]) => void
  connect: () => void
  disconnect: () => void
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    token = '',
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5
  } = options

  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [lastMessage, setLastMessage] = useState<StreamMessage | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    setConnecting(true)
    shouldReconnectRef.current = true

    try {
      const ws = new WebSocket(url, token ? ['idx-v1', `idx-auth-${token}`] : undefined)
      wsRef.current = ws

      ws.onopen = () => {
        if (wsRef.current !== ws) return
        console.log('[WS] Connected to', url)
        setConnected(true)
        setConnecting(false)
        reconnectAttemptsRef.current = 0
      }

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return
        try {
          const data = JSON.parse(event.data) as StreamMessage
          setLastMessage(data)
        } catch (e) {
          console.error('[WS] Failed to parse message:', e)
        }
      }

      ws.onclose = () => {
        if (wsRef.current !== ws) return
        console.log('[WS] Connection closed')
        setConnected(false)
        setConnecting(false)
        wsRef.current = null

        // Auto-reconnect logic
        if (
          shouldReconnectRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          reconnectAttemptsRef.current++
          console.log(
            `[WS] Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          )
          reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay)
        }
      }

      ws.onerror = (error) => {
        if (wsRef.current === ws) console.error('[WS] Error:', error)
      }
    } catch (e) {
      console.error('[WS] Failed to connect:', e)
      setConnecting(false)
    }
  }, [url, token, reconnectDelay, maxReconnectAttempts])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setConnected(false)
    setConnecting(false)
  }, [])

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn('[WS] Cannot send - not connected')
    }
  }, [])

  const subscribe = useCallback((tickers: string[]) => {
    send({ type: 'subscribe', tickers })
  }, [send])

  const unsubscribe = useCallback((tickers?: string[]) => {
    if (tickers) {
      send({ type: 'unsubscribe', tickers })
    } else {
      send({ type: 'unsubscribe' })
    }
  }, [send])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, connect, disconnect])

  return {
    connected,
    connecting,
    lastMessage,
    send,
    subscribe,
    unsubscribe,
    connect,
    disconnect
  }
}
