import { useEffect, useRef, useState, useCallback } from "react";
import { WS_BASE_URL } from "../config";

interface UseWebSocketProps {
  userId: string | null;
  onEventReceived: (event: any) => void;
}

export function useWebSocket({ userId, onEventReceived }: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(1000);
  const onEventReceivedRef = useRef(onEventReceived);

  // Keep ref updated to avoid triggering reconnection on callback changes
  useEffect(() => {
    onEventReceivedRef.current = onEventReceived;
  }, [onEventReceived]);

  const connect = useCallback(() => {
    if (!userId) return;

    // Avoid duplicate connections
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = `${WS_BASE_URL}/ws/${userId}`;
    console.log("Connecting to WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      reconnectDelayRef.current = 1000;
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (onEventReceivedRef.current) {
          onEventReceivedRef.current(payload);
        }
      } catch (err) {
        console.warn("Error parsing WebSocket message:", err);
      }
    };

    socket.onclose = (event) => {
      console.log("WebSocket disconnected:", event.reason);
      setIsConnected(false);
      socketRef.current = null;

      if (userId) {
        const delay = Math.min(reconnectDelayRef.current * 2, 10000);
        reconnectDelayRef.current = delay;
        console.log(`Reconnecting in ${delay}ms...`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    socket.onerror = (error) => {
      console.warn("WebSocket connection warning:", error);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [userId, connect]);

  const sendEvent = useCallback((event: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(event));
    } else {
      console.warn("WebSocket not connected. Event queued or dropped:", event);
    }
  }, []);

  return { isConnected, sendEvent };
}
