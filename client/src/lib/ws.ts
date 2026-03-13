"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// Resolve WebSocket base URL:
// - If NEXT_PUBLIC_WS_URL is set, use it (explicit override).
// - Otherwise, when running in the browser, derive from window.location (same origin as app).
// - Only fall back to ws://localhost:3001 for local dev without envs.
const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== "undefined"
    ? window.location.origin.replace(/^http/, "ws")
    : "ws://localhost:3001");

export type WSMessageType =
  | "init"
  | "refresh"
  | "positions"
  | "activity"
  | "balance"
  | "holders"
  | "new_tokens"
  | "token_update";

export interface WSMessage {
  type: WSMessageType;
  data: any;
}

type MessageHandler = (msg: WSMessage) => void;

export function useWebSocket(isPublic: boolean = false) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<WSMessageType, Set<MessageHandler>>>(new Map());
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const on = useCallback((type: WSMessageType, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);
    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    let url: string;
    if (isPublic) {
      url = `${WS_BASE}?public=true`;
    } else {
      const sessionToken = localStorage.getItem("sessionToken");
      const deviceId = localStorage.getItem("deviceId");
      if (!sessionToken) {
        // No auth token — fall back to public feed so data still flows
        url = `${WS_BASE}?public=true`;
      } else {
        url = `${WS_BASE}?token=${sessionToken}&deviceId=${deviceId || ""}`;
      }
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        const handlers = handlersRef.current.get(msg.type);
        if (handlers) {
          handlers.forEach((h) => h(msg));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [isPublic]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return { connected, on, connect, disconnect };
}
