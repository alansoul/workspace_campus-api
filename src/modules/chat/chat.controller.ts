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
import { ChatService } from './chat.service.js';

const uploadDir = './uploads';
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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

  // Upload endpoint for PDFs, Images, and Documents
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
      limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB maximum
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');

    let fileType = 'DOCUMENT';
    if (file.mimetype.startsWith('image/')) {
      fileType = 'IMAGE';
    } else if (file.mimetype === 'application/pdf') {
      fileType = 'PDF';
    }

    return {
      fileUrl: `/chat/files/${file.filename}`,
      fileName: file.originalname,
      fileType,
      fileSize: file.size,
    };
  }

  // Serve uploaded files
  @Get('files/:filename')
  getFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = join(process.cwd(), 'uploads', filename);
    if (!existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    return res.sendFile(filePath);
  }
}