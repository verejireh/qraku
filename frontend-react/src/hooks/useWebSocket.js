/**
 * useWebSocket — unified WS hook with token auth, heartbeat, and auto-reconnect
 *
 * Token acquisition:
 *   - audience === "customer" → POST /api/ws/token/customer  (no auth)
 *   - other audiences         → POST /api/ws/token/staff     (staff or admin JWT)
 *
 * Reconnect backoff: 1 → 2 → 5 → 10 → 30 seconds
 * Heartbeat: 30s ping; 60s no response → force reconnect
 * Token refresh: fetched fresh 30s before expiry
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 60_000
const TOKEN_REFRESH_SLACK_MS = 30_000
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]

function buildWsUrl(audience, storeId, tableNumber, token) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const host = isLocal ? `${window.location.hostname}:8003` : window.location.host

  const channelPath =
    audience === 'customer' ? `/api/ws/customer/${storeId}/${tableNumber}`
    : audience === 'kitchen' ? `/api/ws/kitchen/${storeId}`
    : `/api/ws/admin/${storeId}`

  return `${protocol}//${host}${channelPath}?token=${encodeURIComponent(token)}`
}

async function fetchWsToken(audience, storeId, tableNumber) {
  if (audience === 'customer') {
    const res = await axios.post('/api/ws/token/customer', {
      store_id: storeId,
      audience: 'customer',
      table_number: tableNumber || undefined,
    })
    return res.data
  }

  // Staff audiences: try staffToken first, fall back to admin_token
  const bearer =
    localStorage.getItem('staffToken') || localStorage.getItem('admin_token')
  if (!bearer) throw new Error('No auth token in localStorage')

  const res = await axios.post(
    '/api/ws/token/staff',
    { store_id: storeId, audience },
    { headers: { Authorization: `Bearer ${bearer}` } },
  )
  return res.data
}

export function useWebSocket({ audience, storeId, tableNumber, onEvent }) {
  const [status, setStatus] = useState('disconnected')
  const [lastEvent, setLastEvent] = useState(null)

  const wsRef = useRef(null)
  const tokenRef = useRef(null)              // { token, expires_at }
  const backoffIdxRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const heartbeatIntervalRef = useRef(null)
  const heartbeatTimeoutRef = useRef(null)
  const disposedRef = useRef(false)
  const onEventRef = useRef(onEvent)

  // Keep callback ref fresh without triggering re-connect
  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

  const clearTimers = useCallback(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
    if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    heartbeatIntervalRef.current = null
    heartbeatTimeoutRef.current = null
    reconnectTimerRef.current = null
  }, [])

  // connect is declared with useRef so the onclose closure always sees the current version
  const connectRef = useRef(null)

  connectRef.current = async () => {
    if (disposedRef.current || !storeId || !audience) return
    setStatus('connecting')

    try {
      // Fetch or refresh token when absent or near-expiry
      const now = Date.now()
      const exp = tokenRef.current ? new Date(tokenRef.current.expires_at).getTime() : 0
      if (!tokenRef.current || exp - now < TOKEN_REFRESH_SLACK_MS) {
        tokenRef.current = await fetchWsToken(audience, storeId, tableNumber)
      }

      if (disposedRef.current) return
      const wsUrl = buildWsUrl(audience, storeId, tableNumber, tokenRef.current.token)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (disposedRef.current) { ws.close(); return }
        setStatus('connected')
        backoffIdxRef.current = 0

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
            heartbeatTimeoutRef.current = setTimeout(() => ws.close(), HEARTBEAT_TIMEOUT_MS)
          }
        }, HEARTBEAT_INTERVAL_MS)
      }

      ws.onmessage = (event) => {
        // Any message resets the heartbeat timeout
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current)
          heartbeatTimeoutRef.current = null
        }

        try {
          const envelope = JSON.parse(event.data)
          if (envelope.type === 'pong') return

          // store_id guard — double-check this instance's messages
          if (envelope.store_id !== undefined && String(envelope.store_id) !== String(storeId)) return

          setLastEvent(envelope)
          onEventRef.current?.(envelope)
        } catch (_) { /* ignore parse errors */ }
      }

      ws.onclose = () => {
        if (disposedRef.current) return
        setStatus('disconnected')
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
        if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
        heartbeatIntervalRef.current = null
        heartbeatTimeoutRef.current = null

        const delay = RECONNECT_BACKOFF_MS[Math.min(backoffIdxRef.current, RECONNECT_BACKOFF_MS.length - 1)]
        backoffIdxRef.current += 1
        reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), delay)
      }

      ws.onerror = () => ws.close()

    } catch (err) {
      if (disposedRef.current) return
      setStatus('disconnected')
      const delay = RECONNECT_BACKOFF_MS[Math.min(backoffIdxRef.current, RECONNECT_BACKOFF_MS.length - 1)]
      backoffIdxRef.current += 1
      reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), delay)
    }
  }

  useEffect(() => {
    if (!storeId || !audience) return
    disposedRef.current = false
    backoffIdxRef.current = 0
    connectRef.current()

    return () => {
      disposedRef.current = true
      clearTimers()
      if (wsRef.current) {
        wsRef.current.onclose = null  // prevent reconnect on intentional close
        wsRef.current.close()
      }
    }
  }, [storeId, audience, tableNumber, clearTimers])

  const reconnect = useCallback(() => {
    clearTimers()
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }
    tokenRef.current = null  // force token refresh
    backoffIdxRef.current = 0
    disposedRef.current = false
    connectRef.current?.()
  }, [clearTimers])

  return { lastEvent, status, reconnect }
}
