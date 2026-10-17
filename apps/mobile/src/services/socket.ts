import { io, Socket } from 'socket.io-client';
import { mobileConfig } from '../config/env.js';
import { authStorage } from './auth-storage.js';

let socket: Socket | null = null;

export async function getMobileSocket(): Promise<Socket> {
  const token = await authStorage.getToken();

  if (!socket || !socket.connected) {
    socket = io(mobileConfig.apiUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });
  }

  return socket;
}

export function disconnectMobileSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
