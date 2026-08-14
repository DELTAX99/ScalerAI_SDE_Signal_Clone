import { useEffect, useRef, useState, useCallback } from "react";

interface UseWebSocketProps {
  userId: string | null;
  onEventReceived: (event: any) => void;
}

export function useWebSocket({ userId, onEventReceived }: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(1000); // Start with 1 second delay

  const connect = useCallback(() => {
    if (!userId) return;

    // Clean up existing connections
    if (socketRef.current) {
      socketRef.current.close();
    }

    const wsUrl = `ws://localhost:8000/ws/${userId}`;
    console.log("Connecting to WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      reconnectDelayRef.current = 1000; // Reset delay on successful connection
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        onEventReceived(payload);
      } catch (err) {
        console.warn("Error parsing WebSocket message:", err);
      }
    };

    socket.onclose = (event) => {
      console.log("WebSocket disconnected:", event.reason);
      setIsConnected(false);
      
      // Auto-reconnect if not closed cleanly
      if (userId) {
        const delay = Math.min(reconnectDelayRef.current * 2, 30000); // Cap backoff at 30 seconds
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
  }, [userId, onEventReceived]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
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
