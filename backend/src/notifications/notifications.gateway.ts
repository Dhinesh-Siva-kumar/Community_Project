import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface NotificationPayload {
  type: string;
  message: string;
  relatedEntityId?: string;
}

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:4200',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private connectedUsers = new Map<string, string>();

  handleConnection(client: Socket): void {
    const userId = client.handshake.query['userId'] as string | undefined;
    if (userId) {
      this.connectedUsers.set(userId, client.id);
      void client.join(`user_${userId}`);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.handshake.query['userId'] as string | undefined;
    if (userId) {
      this.connectedUsers.delete(userId);
    }
  }

  sendNotification(userId: string, notification: NotificationPayload): void {
    this.server.to(`user_${userId}`).emit('notification', notification);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() room: string,
  ): void {
    void client.join(room);
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() room: string,
  ): void {
    void client.leave(room);
  }
}
