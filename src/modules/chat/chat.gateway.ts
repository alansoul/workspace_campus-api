import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import type { AuthenticatedUser } from '../iam/guards/jwt-auth.guard.js';

@WebSocketGateway({
  cors: { origin: ['http://localhost:3000', /\.vercel\.app$/], credentials: true },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.headers.authorization?.startsWith('Bearer ')
          ? client.handshake.headers.authorization.split(' ')[1]
          : undefined);

      if (!token) {
        client.disconnect();
        return;
      }

      const payload: AuthenticatedUser = await this.jwtService.verifyAsync(token);
      client.data.user = payload;
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('joinChannel')
  handleJoinChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (!user || !channelId) return { status: 'error' };

    const scopedRoom = `${user.universityId}:${channelId}`;
    client.join(scopedRoom);
    return { status: 'joined', channelId };
  }

  @SubscribeMessage('leaveChannel')
  handleLeaveChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (!user || !channelId) return { status: 'error' };

    const scopedRoom = `${user.universityId}:${channelId}`;
    client.leave(scopedRoom);
    return { status: 'left', channelId };
  }

  @SubscribeMessage('sendMessage')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string; content: string },
  ) {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (!user || !payload.content?.trim()) return;

    const scopedRoom = `${user.universityId}:${payload.channelId}`;
    const message = {
      id: crypto.randomUUID(),
      senderId: user.sub,
      senderName: user.fullName || user.email.split('@')[0],
      content: payload.content.trim(),
      createdAt: new Date().toISOString(),
    };

    this.server.to(scopedRoom).emit('newMessage', message);
    return message;
  }
}