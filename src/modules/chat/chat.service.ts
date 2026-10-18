import { Injectable, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const defaultChannels = ['general', 'announcements', 'random'];
    for (const name of defaultChannels) {
      const existing = await (this.prisma as any).channel.findFirst({
        where: { name },
      });
      if (!existing) {
        await (this.prisma as any).channel.create({
          data: {
            name,
            description: `The #${name} channel for everyone on campus`,
            createdById: 'system',
            isDirect: false,
          },
        });
      }
    }
  }

  // 1. Get standard campus channels
  async getUserChannels(userId: string) {
    return (this.prisma as any).channel.findMany({
      where: {
        isDirect: false,
        OR: [
          { createdById: 'system' },
          { createdById: userId },
          { members: { some: { userId } } },
        ],
      },
      include: { members: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 2. Get direct 1-to-1 conversations for a user
  async getDirectConversations(userId: string) {
    const dmChannels = await (this.prisma as any).channel.findMany({
      where: {
        isDirect: true,
        members: { some: { userId } },
      },
      include: {
        members: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      dmChannels.map(async (channel: any) => {
        const otherMember = channel.members.find((m: any) => m.userId !== userId);
        let friend = { id: otherMember?.userId || 'unknown', name: 'Campus Peer', email: '' };

        if (otherMember?.userId && (this.prisma as any).user) {
          const userRec = await (this.prisma as any).user.findUnique({
            where: { id: otherMember.userId },
            select: { id: true, fullName: true, email: true },
          });
          if (userRec) {
            friend = {
              id: userRec.id,
              name: userRec.fullName || userRec.email.split('@')[0],
              email: userRec.email,
            };
          }
        }

        return {
          ...channel,
          friend,
        };
      }),
    );
  }

  // 3. Start or return an existing 1-on-1 direct conversation with a friend by email
  async startDirectChat(currentUserId: string, friendEmail: string) {
    const normalizedEmail = friendEmail.trim().toLowerCase();

    const friend = await (this.prisma as any).user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
      },
      select: { id: true, fullName: true, email: true },
    });

    if (!friend) {
      throw new NotFoundException(`No registered campus user found with email: ${friendEmail}`);
    }

    if (friend.id === currentUserId) {
      throw new BadRequestException('You cannot create a direct chat with yourself.');
    }

    const sortedIds = [currentUserId, friend.id].sort();
    const dmName = `dm:${sortedIds.join(':')}`;

    let channel = await (this.prisma as any).channel.findFirst({
      where: { name: dmName },
      include: { members: true },
    });

    if (!channel) {
      channel = await (this.prisma as any).channel.create({
        data: {
          name: dmName,
          description: `Direct message with ${friend.fullName || friend.email}`,
          isDirect: true,
          createdById: currentUserId,
          members: {
            create: [
              { userId: currentUserId, role: 'MEMBER' },
              { userId: friend.id, role: 'MEMBER' },
            ],
          },
        },
        include: { members: true },
      });
    }

    return {
      ...channel,
      friend: {
        id: friend.id,
        name: friend.fullName || friend.email.split('@')[0],
        email: friend.email,
      },
    };
  }

  async createChannel(userId: string, name: string, description?: string) {
    const slug = name.toLowerCase().trim().replace(/\s+/g, '-');
    return (this.prisma as any).channel.create({
      data: {
        name: slug,
        description,
        isDirect: false,
        createdById: userId,
        members: {
          create: { userId, role: 'ADMIN' },
        },
      },
      include: { members: true },
    });
  }

  async getMessages(channelId: string, limit = 50) {
    return (this.prisma as any).chatMessage.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  // Creates text, image, PDF, or document messages
  async createMessage(data: {
    channelId: string;
    senderId: string;
    senderName: string;
    content: string;
    fileUrl?: string;
    fileType?: string;
    fileName?: string;
    fileSize?: number;
  }) {
    return (this.prisma as any).chatMessage.create({ data });
  }

  /**
   * Helper to verify if the requester has admin powers dynamically
   */
  private isUserAdmin(user: { id?: string; sub?: string; email?: string; role?: string }): boolean {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const userEmail = user?.email?.trim().toLowerCase();

    return (
      user?.role === 'ADMIN' ||
      user?.role === 'SUPERADMIN' ||
      (Boolean(adminEmail) && Boolean(userEmail) && userEmail === adminEmail)
    );
  }

  // DELETE: Users delete their own; Admins delete ANY message
  async deleteMessage(
    messageId: string,
    currentUser: { id?: string; sub?: string; email?: string; role?: string },
    mode: 'SOFT' | 'HARD' = 'SOFT',
  ) {
    const message = await (this.prisma as any).chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const currentUserId = currentUser.sub || currentUser.id;
    const isOwner = message.senderId === currentUserId;
    const isAdmin = this.isUserAdmin(currentUser);

    if (!isOwner && !isAdmin) {
      throw new BadRequestException('You can only delete your own messages.');
    }

    if (mode === 'SOFT') {
      const updated = await (this.prisma as any).chatMessage.update({
        where: { id: messageId },
        data: {
          content: isAdmin && !isOwner ? '🚫 This message was deleted by Admin' : '🚫 This message was deleted',
          isDeleted: true,
          fileUrl: null,
        },
      });
      return { success: true, message: updated, isSoftDeleted: true, channelId: message.channelId };
    } else {
      await (this.prisma as any).chatMessage.delete({
        where: { id: messageId },
      });
      return { success: true, messageId, isSoftDeleted: false, channelId: message.channelId };
    }
  }

  // EDIT: Users edit their own messages; Admins can edit if needed
  async editMessage(
    messageId: string,
    newContent: string,
    currentUser: { id?: string; sub?: string; email?: string; role?: string },
  ) {
    const message = await (this.prisma as any).chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const currentUserId = currentUser.sub || currentUser.id;
    const isOwner = message.senderId === currentUserId;
    const isAdmin = this.isUserAdmin(currentUser);

    if (!isOwner && !isAdmin) {
      throw new BadRequestException('You can only edit your own messages.');
    }

    const updated = await (this.prisma as any).chatMessage.update({
      where: { id: messageId },
      data: {
        content: newContent.trim(),
        isEdited: true,
      },
    });

    return { success: true, message: updated, channelId: message.channelId };
  }
}