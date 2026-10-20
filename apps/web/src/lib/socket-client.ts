import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  const token = localStorage.getItem('token');
  const socketUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || undefined;

  if (!socket) {
    socket = socketUrl
      ? io(socketUrl, {
          auth: { token },
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 15,
          reconnectionDelay: 2000,
        })
      : io('/', {
          auth: { token },
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 15,
          reconnectionDelay: 2000,
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
