import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Namespace, Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyAccessToken } from './token.service';

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

// Verifies the same JWT access token used for REST auth (sent via the
// Socket.IO `auth` handshake option) and stamps the decoded userId onto the
// socket. A socket can only ever join its own room — there is no
// client-supplied `join` event to trust, closing the hole where any socket
// could join any user's room by just naming an id.
function verifySocketToken(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.['token'] as string | undefined;
  if (!token) {
    next(new Error('Authentication required'));
    return;
  }
  try {
    const decoded = verifyAccessToken(token);
    socket.data['userId'] = decoded.sub;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}

export function initNotificationsGateway(io: SocketIOServer): void {
  notificationsNs = io.of('/notifications');
  notificationsNs.use(verifySocketToken);

  notificationsNs.on('connection', (socket) => {
    const userId = socket.data['userId'] as string;
    void socket.join(`user:${userId}`);
    console.log(`[Notifications] Client connected: ${socket.id} (user:${userId})`);

    socket.on('disconnect', () => {
      console.log(`[Notifications] Client disconnected: ${socket.id} (user:${userId})`);
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
