import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
interface NotificationPayload {
    type: string;
    message: string;
    relatedEntityId?: string;
}
export declare class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    private connectedUsers;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    sendNotification(userId: string, notification: NotificationPayload): void;
    handleJoinRoom(client: Socket, room: string): void;
    handleLeaveRoom(client: Socket, room: string): void;
}
export {};
