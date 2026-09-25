import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { DEMO_MODE, TOKEN_KEY } from '../api/axios';
import { useAuth } from '../hooks/useAuth';

export interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

export const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

/**
 * Owns the single Socket.IO connection used for live message delivery and read
 * receipts. In demo mode (no backend running) it stays disconnected on purpose —
 * screens should treat "connected: false" as "poll or use local state", not as an error.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (DEMO_MODE || !user) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000', {
      auth: { token: localStorage.getItem(TOKEN_KEY) },
      transports: ['websocket'],
    });

    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user]);

  const value = useMemo(() => ({ socket: socketRef.current, connected }), [connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
