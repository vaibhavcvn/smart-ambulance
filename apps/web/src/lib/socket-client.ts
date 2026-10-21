import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  const token = localStorage.getItem('token');
  const socketUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || undefined;

  // On Vercel serverless without an explicit WebSocket server URL, graceful fallback to REST APIs
  const isServerless =
    typeof window !== 'undefined' &&
    window.location.hostname.includes('vercel.app') &&
    !import.meta.env.VITE_WS_URL;

  if (isServerless) {
    if (!socket) {
      console.info('ℹ️ Running in serverless deployment (Vercel): WebSockets disabled without dedicated VITE_WS_URL. Using REST API fallback.');
      const mockSocket: any = {
        id: 'serverless-client',
        connected: false,
        auth: { token },
        on: () => mockSocket,
        off: () => mockSocket,
        emit: () => mockSocket,
        disconnect: () => {},
      };
      socket = mockSocket as Socket;
    }
    return socket;
  }

  if (!socket) {
    socket = socketUrl
      ? io(socketUrl, {
          auth: { token },
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 3000,
        })
      : io('/', {
          auth: { token },
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 3000,
        });

    socket.on('connect', () => {
      console.log('⚡ Socket.IO connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket.IO disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });
  } else if (token && socket.auth) {
    (socket.auth as any).token = token;
  }

  return socket;
}

export function resetSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
