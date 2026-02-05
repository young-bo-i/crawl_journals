"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export type WsMessage = {
  type: string;
  [key: string]: any;
};

type UseWebSocketOptions = {
  onMessage?: (message: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
};

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  // 使用 ref 存储回调，避免依赖变化导致重连
  const callbacksRef = useRef({ onMessage, onOpen, onClose, onError });
  callbacksRef.current = { onMessage, onOpen, onClose, onError };

  const connect = useCallback(() => {
    // 防止重复连接
    if (connectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // 清理之前的连接
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    connectingRef.current = true;

    // 构建 WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log(`[WebSocket] Connecting to ${wsUrl}...`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      console.log("[WebSocket] Connected");
      connectingRef.current = false;
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      callbacksRef.current.onOpen?.();
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const message = JSON.parse(event.data) as WsMessage;
        
        // 处理连接确认
        if (message.type === "connected") {
          setClientId(message.clientId);
          console.log(`[WebSocket] Assigned client ID: ${message.clientId}`);
        }
        
        callbacksRef.current.onMessage?.(message);
      } catch (e) {
        console.error("[WebSocket] Failed to parse message:", e);
      }
    };

    ws.onclose = (event) => {
      connectingRef.current = false;
      console.log(`[WebSocket] Disconnected (code: ${event.code})`);
      
      if (!mountedRef.current) return;
      
      setConnected(false);
      setClientId(null);
      wsRef.current = null;
      callbacksRef.current.onClose?.();

      // 只有非正常关闭才尝试重连
      if (event.code !== 1000 && event.code !== 1001 && mountedRef.current) {
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(reconnectInterval * reconnectAttemptsRef.current, 10000);
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, delay);
        } else {
          console.log("[WebSocket] Max reconnect attempts reached, giving up");
        }
      }
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      callbacksRef.current.onError?.(error);
    };

    wsRef.current = ws;
  }, [reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    connectingRef.current = false;
    if (wsRef.current) {
      wsRef.current.onclose = null; // 防止触发重连
      wsRef.current.close(1000, "User disconnect");
      wsRef.current = null;
    }
    setConnected(false);
    setClientId(null);
  }, []);

  const send = useCallback((message: WsMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("[WebSocket] Cannot send message, not connected");
    }
  }, []);

  const subscribe = useCallback((runId: string | null) => {
    send({ type: "subscribe", runId });
  }, [send]);

  const unsubscribe = useCallback(() => {
    send({ type: "unsubscribe" });
  }, [send]);

  // 自动连接（只在首次挂载时）
  useEffect(() => {
    mountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    connect();
    
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空依赖，只在挂载时运行一次

  return {
    connected,
    clientId,
    send,
    subscribe,
    unsubscribe,
    reconnect: () => {
      reconnectAttemptsRef.current = 0;
      connect();
    },
  };
}
