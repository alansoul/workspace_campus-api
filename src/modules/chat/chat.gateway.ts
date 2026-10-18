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
  'https://workspace-campus-web.vercel.app',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

@WebSocketGateway({
  cors: { origin: allowedOrigins, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
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
        cookies['access_token'] ||
        cookies['jwt'];

      if (token) {
        const userPayload = await this.jwtService.verifyAsync<AuthenticatedUser>(token).catch(() => null);
        if (userPayload?.sub) {
          this.registerUser(client, userPayload);
        }
      }
    } catch (err) {
      this.logger.warn(`Handshake warning: ${err}`);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (user?.sub) {
      this.onlineUsers.delete(user.sub);
      this.broadcastPresence();
    }
  }

  private registerUser(client: Socket, userObj: AuthenticatedUser) {
    client.data.user = userObj;
    this.onlineUsers.set(userObj.sub, { socketId: client.id, user: userObj });
    client.join(`user:${userObj.sub}`);
    this.logger.log(`Active user registered: ${userObj.fullName} (user:${userObj.sub}) on socket ${client.id}`);
    this.broadcastPresence();
  }

  private broadcastPresence() {
    const users = Array.from(this.onlineUsers.values()).map((entry) => ({
      userId: entry.user.sub,
      name: entry.user.fullName || entry.user.email.split('@')[0],
      email: entry.user.email,
    }));
    this.server.emit('presence:sync', users);
  }

  // Explicit registration from frontend to guarantee user room mapping across ports
  @SubscribeMessage('user:register')
  handleExplicitRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string; fullName?: string; email?: string },
  ) {
    if (!payload?.userId) return;
    const userObj: AuthenticatedUser = {
      sub: payload.userId,
      email: payload.email || `${payload.userId}@campus.local`,
      fullName: payload.fullName || 'Campus Peer',
      role: 'STUDENT',
      universityId: 'iiitnr',
    };
    this.registerUser(client, userObj);
    return { status: 'registered', userId: payload.userId };
  }

  @SubscribeMessage('joinChannel')
  handleJoinChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    if (channelId) {
      client.join(channelId);
    }
    return { status: 'joined', channelId };
  }

  @SubscribeMessage('leaveChannel')
  handleLeaveChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    if (channelId) {
      client.leave(channelId);
    }
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

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      messageId: string;
      channelId: string;
      mode?: 'SOFT' | 'HARD';
      userId?: string;
      userEmail?: string;
      userRole?: string;
    },
  ) {
    try {
      // Resolve user either from socket session or payload fallback
      const user = client.data.user || {
        id: payload.userId,
        sub: payload.userId,
        email: payload.userEmail,
        role: payload.userRole,
      };

      if (!user.id && !user.sub) {
        return { error: 'Unauthorized: User identity not found.' };
      }

      const result = await this.chatService.deleteMessage(
        payload.messageId,
        user,
        payload.mode || 'SOFT',
      );

      // Broadcast real-time deletion across the channel
      this.server.to(payload.channelId).emit('message_deleted', {
        messageId: payload.messageId,
        channelId: payload.channelId,
        isSoftDeleted: result.isSoftDeleted,
        newContent: result.isSoftDeleted ? (result.message as any)?.content : undefined,
      });

      return { success: true };
    } catch (err: any) {
      this.logger.error(`Delete message failed: ${err.message}`);
      return { error: err.message };
    }
  }

  @SubscribeMessage('edit_message')
  async handleEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { messageId: string; channelId: string; content: string },
  ) {
    try {
      const user = client.data.user;
      if (!user) return { error: 'Unauthorized' };

      const result = await this.chatService.editMessage(
        payload.messageId,
        payload.content,
        user,
      );

      // Broadcast real-time edit to everyone in this channel
      this.server.to(payload.channelId).emit('message_edited', {
        messageId: payload.messageId,
        channelId: payload.channelId,
        content: payload.content.trim(),
      });

      return { success: true };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  // --- WebRTC & Call Signaling Events ---

  @SubscribeMessage('call:offer')
  handleCallOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      channelId: string;
      offer?: RTCSessionDescriptionInit;
      callerName: string;
      callerId: string;
      targetUserId?: string;
      roomName?: string;
      isVideo: boolean;
    },
  ) {
    const callData = {
      fromSocketId: client.id,
      channelId: payload.channelId,
      offer: payload.offer || ({} as RTCSessionDescriptionInit),
      callerName: payload.callerName,
      callerId: payload.callerId,
      roomName: payload.roomName || `campus-${payload.channelId}`,
      isVideo: payload.isVideo,
    };

    // 1. Direct 1-to-1 call: Target recipient's individual user room
    if (payload.targetUserId) {
      this.server.to(`user:${payload.targetUserId}`).emit('call:incoming', callData);
      return;
    }

    // 2. Channel call (#general): Broadcast workspace-wide so all peers get alerted
    client.broadcast.emit('call:incoming', callData);
  }

  @SubscribeMessage('call:answer')
  handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      channelId: string;
      answer?: RTCSessionDescriptionInit;
      targetSocketId?: string;
    },
  ) {
    if (payload.targetSocketId) {
      client.to(payload.targetSocketId).emit('call:answered', payload);
    } else {
      client.broadcast.emit('call:answered', payload);
    }
  }

  @SubscribeMessage('call:reject')
  handleCallReject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { channelId?: string; targetSocketId?: string },
  ) {
    if (payload?.targetSocketId) {
      client.to(payload.targetSocketId).emit('call:rejected');
    } else {
      client.broadcast.emit('call:rejected');
    }
  }

  @SubscribeMessage('call:end')
  handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { channelId?: string },
  ) {
    client.broadcast.emit('call:ended');
  }
}