import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../iam/guards/jwt-auth.guard.js';
import { ChatService } from './chat.service.js';

function parseCookie(cookieString?: string): Record<string, string> {
  if (!cookieString) return {};
  return Object.fromEntries(
    cookieString.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }),
  );
}

const allowedOrigins = [
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

@WebSocketGateway({
  cors: { origin: allowedOrigins, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Active online users registry: userId -> { socketId, user }
  private onlineUsers = new Map<string, { socketId: string; user: AuthenticatedUser }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const cookies = parseCookie(client.handshake.headers.cookie);
      const token =
        client.handshake.auth?.token ||
        cookies['token'] ||
        (client.handshake.headers.authorization?.startsWith('Bearer ')
          ? client.handshake.headers.authorization.split(' ')[1]
          : undefined);

      if (!token) return;

      const payload: AuthenticatedUser = await this.jwtService.verifyAsync(token);
      client.data.user = payload;
      this.onlineUsers.set(payload.sub, { socketId: client.id, user: payload });

      this.broadcastPresence();
    } catch {
      // Allow connection with client-supplied credentials
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (user?.sub) {
      this.onlineUsers.delete(user.sub);
      this.broadcastPresence();
    }
  }

  private broadcastPresence() {
    const users = Array.from(this.onlineUsers.values()).map((entry) => ({
      userId: entry.user.sub,
      name: entry.user.fullName || entry.user.email.split('@')[0],
      email: entry.user.email,
    }));
    this.server.emit('presence:sync', users);
  }

  @SubscribeMessage('joinChannel')
  handleJoinChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    client.join(channelId);
    return { status: 'joined', channelId };
  }

  @SubscribeMessage('leaveChannel')
  handleLeaveChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    client.leave(channelId);
    return { status: 'left', channelId };
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      channelId: string;
      content: string;
      senderId?: string;
      senderName?: string;
      fileUrl?: string;
      fileType?: string;
      fileName?: string;
      fileSize?: number;
    },
  ) {
    const user = client.data.user as AuthenticatedUser | undefined;
    const senderId = user?.sub || payload.senderId || 'anonymous';
    const senderName =
      user?.fullName ||
      user?.email?.split('@')[0] ||
      payload.senderName ||
      'Anonymous';

    // Allow sending messages that have text OR an attached media file
    if (!payload.content?.trim() && !payload.fileUrl) return;

    const message = await this.chatService.createMessage({
      channelId: payload.channelId,
      senderId,
      senderName,
      content: payload.content?.trim() || '',
      fileUrl: payload.fileUrl,
      fileType: payload.fileType,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
    });

    this.server.to(payload.channelId).emit('newMessage', message);
    return message;
  }

  // --- WebRTC Signaling Events ---

  @SubscribeMessage('call:offer')
  handleCallOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      channelId: string;
      offer: RTCSessionDescriptionInit;
      callerName: string;
      callerId: string;
      isVideo: boolean;
    },
  ) {
    client.to(payload.channelId).emit('call:incoming', {
      fromSocketId: client.id,
      channelId: payload.channelId,
      offer: payload.offer,
      callerName: payload.callerName,
      callerId: payload.callerId,
      isVideo: payload.isVideo,
    });
  }

  @SubscribeMessage('call:answer')
  handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { channelId: string; answer: RTCSessionDescriptionInit },
  ) {
    client.to(payload.channelId).emit('call:answered', {
      fromSocketId: client.id,
      answer: payload.answer,
    });
  }

  @SubscribeMessage('call:ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { channelId: string; candidate: RTCIceCandidateInit },
  ) {
    client.to(payload.channelId).emit('call:ice-candidate', {
      candidate: payload.candidate,
    });
  }

  @SubscribeMessage('call:reject')
  handleCallReject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ) {
    client.to(payload.channelId).emit('call:rejected');
  }

  @SubscribeMessage('call:end')
  handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ) {
    this.server.to(payload.channelId).emit('call:ended');
  }
}