import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Namespace } from 'socket.io';
import { env } from '../config/env';

let notificationsNs: Namespace | null = null;

export function createSocketIOServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });
  return io;
}

export function initNotificationsGateway(io: SocketIOServer): void {
  notificationsNs = io.of('/notifications');

  notificationsNs.on('connection', (socket) => {
    console.log(`[Notifications] Client connected: ${socket.id}`);

    socket.on('join', (userId: string) => {
      void socket.join(`user:${userId}`);
      console.log(`[Notifications] ${socket.id} joined room user:${userId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Notifications] Client disconnected: ${socket.id}`);
    });
  });
}

export function sendNotification(
  userId: string,
  payload: Record<string, unknown>,
): void {
  if (!notificationsNs) {
    console.warn('[Notifications] Gateway not initialised yet.');
    return;
  }
  notificationsNs.to(`user:${userId}`).emit('notification', payload);
}
