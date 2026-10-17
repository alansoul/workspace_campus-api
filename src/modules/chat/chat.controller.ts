import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { ChatService } from './chat.service.js';

const uploadDir = './uploads';
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * 🎟️ LIVEKIT SFU TOKEN GENERATION
   * Issues cryptographically signed JWT tokens for video/voice call rooms
   */
  @Get('livekit/token')
  async getLiveKitToken(
    @Query('room') room: string,
    @Query('userId') queryUserId?: string,
    @Query('username') queryUsername?: string,
  ) {
    if (!room) {
      throw new BadRequestException('Room query parameter is required.');
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new BadRequestException(
        'LiveKit credentials (LIVEKIT_API_KEY, LIVEKIT_API_SECRET) are not configured on the backend.',
      );
    }

    const identity =
      queryUserId || `user_${Math.random().toString(36).substring(2, 9)}`;
    const name = queryUsername || 'Campus Peer';

    // Create an authenticated access token valid for 4 hours
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      ttl: '4h',
    });

    // Grant full call permissions: join, publish audio/video, subscribe, and screen share
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return { token: await at.toJwt() };
  }

  @Get('channels')
  async getChannels(@Query('userId') userId?: string) {
    return this.chatService.getUserChannels(userId || 'system');
  }

  @Get('direct')
  async getDirectChats(@Query('userId') userId: string) {
    if (!userId) return [];
    return this.chatService.getDirectConversations(userId);
  }

  @Post('direct')
  async startDirectChat(
    @Body() body: { currentUserId: string; friendEmail: string },
  ) {
    return this.chatService.startDirectChat(body.currentUserId, body.friendEmail);
  }

  @Post('channels')
  async createChannel(
    @Body() body: { name: string; description?: string; userId: string },
  ) {
    return this.chatService.createChannel(body.userId, body.name, body.description);
  }

  @Get('channels/:channelId/messages')
  async getMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(channelId, limit ? parseInt(limit, 10) : 50);
  }

  /**
   * 📤 FILE UPLOAD ENDPOINT
   * Supports Images, Videos, PDFs, and Documents up to 100 MB
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded or file exceeds the 100MB limit.');
    }

    let fileType = 'DOCUMENT';
    if (file.mimetype.startsWith('image/')) {
      fileType = 'IMAGE';
    } else if (file.mimetype.startsWith('video/')) {
      fileType = 'VIDEO';
    } else if (file.mimetype === 'application/pdf') {
      fileType = 'PDF';
    }

    const backendUrl =
      process.env.BACKEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://workspace-campus-api.onrender.com'
        : 'http://localhost:4000');

    return {
      fileUrl: `${backendUrl}/api/chat/files/${file.filename}`,
      fileName: file.originalname,
      fileType,
      fileSize: file.size,
    };
  }

  /**
   * 📥 SERVE UPLOADED MEDIA FILES
   * Delivers static files with Cross-Origin headers to avoid CORS/CORP blocked previews
   */
  @Get('files/:filename')
  getFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = join(process.cwd(), 'uploads', filename);
    if (!existsSync(filePath)) {
      return res.status(404).send('File not found');
    }

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.sendFile(filePath);
  }
}