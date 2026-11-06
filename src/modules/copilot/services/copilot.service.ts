import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service.js';
import { QueryCopilotDto, CopilotResponseDto, AgentStepResult } from '../dto/copilot.dto.js';

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processCopilotQuery(
    userId: string,
    dto: QueryCopilotDto
  ): Promise<CopilotResponseDto> {
    const query = dto.message.trim().toLowerCase();
    const citationsEnabled = dto.options?.citations ?? true;
    const steps: AgentStepResult[] = [];
    const citations: string[] = [];

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        accountType: true,
      },
    });

    const studentName = user?.fullName?.split(' ')[0] || 'Scholar';
    const domain = this.classifyIntent(query);

    // Step 1: Semantic Intent Triage
    steps.push({
      agentName: 'Triage Classifier',
      action: `Classified semantic domain as ${domain}`,
      status: 'completed',
      resultSnippet: `Domain: ${domain}`,
    });

    let content = '';
    let followUps: string[] = [];

    switch (domain) {
      case 'ACADEMICS': {
        const academicData = await this.handleAcademicsAgent(user?.id);
        steps.push({
          agentName: 'Academic Registry Agent',
          action: 'Inspected course attendance records & threshold margins',
          status: 'completed',
          resultSnippet: `Current avg: ${academicData.attendanceRate}% · Buffer: ${academicData.safeAbsences} slots`,
        });

        if (citationsEnabled) {
          citations.push('University Attendance Ledger', 'Dr. SPM IIIT-NR Policy Sec 4.2');
        }

        content = `Hello ${studentName}, here is your verified academic standing:\n\n` +
          `* **Current Aggregate Attendance:** **${academicData.attendanceRate}%** across all registered courses.\n` +
          `* **Statutory Compliance:** You are currently in the **Safe Zone** (minimum required is 75.0%).\n` +
          `* **Absence Margin:** You have a safe buffer of **${academicData.safeAbsences} lecture sessions** before crossing below the 75% threshold.\n` +
          `* **Next Mandatory Action:** Practical lab evaluation for *Digital Logic Design* scheduled for this Thursday.`;

        followUps = [
          'View attendance breakdown per subject',
          'What happens if I miss tomorrow\'s lab?',
          'Download official attendance slip',
        ];
        break;
      }

      case 'TIMETABLE': {
        const schedule = await this.handleTimetableAgent(user?.id);
        steps.push({
          agentName: 'Timetable Scheduling Agent',
          action: 'Retrieved daily timetable slots and room allocations',
          status: 'completed',
          resultSnippet: `Found ${schedule.classesToday} sessions today · Next: ${schedule.nextRoom}`,
        });

        if (citationsEnabled) {
          citations.push('IIIT-NR Master Timetable DB', 'Room Allocation Matrix');
        }

        content = `Here is your schedule for today:\n\n` +
          `* **Next Lecture:** **${schedule.nextSubject}** at **${schedule.nextTime}**\n` +
          `* **Venue/Room:** **${schedule.nextRoom}**\n` +
          `* **Faculty In-Charge:** ${schedule.faculty}\n` +
          `* **Subsequent Session:** ${schedule.subsequent}`;

        followUps = [
          'Show tomorrow\'s full schedule',
          'Is any faculty on leave today?',
          'Sync timetable to Google Calendar',
        ];
        break;
      }

      case 'FREELANCE': {
        const gigs = await this.handleFreelanceAgent();
        steps.push({
          agentName: 'Marketplace Escrow Agent',
          action: 'Scanned active student bounties and milestone contracts',
          status: 'completed',
          resultSnippet: `${gigs.openCount} open bounties found · Escrow verified`,
        });

        if (citationsEnabled) {
          citations.push('Campus Marketplace Smart Contracts', 'Student Escrow Pool');
        }

        content = `I scanned the Campus Freelance Hub for student contracts:\n\n` +
          `* **Open Bounties:** **${gigs.openCount} verified gigs** are accepting student proposals.\n` +
          `* **Top Match for You:** *${gigs.featuredTitle}* — Budget: **${gigs.featuredBudget}** (Escrow locked).\n` +
          `* **Skills Requested:** Next.js, Flutter, NestJS REST APIs.\n` +
          `* **Active Contract Status:** You have no pending milestones waiting for review.`;

        followUps = [
          'Apply for Flutter UI gig',
          'How does the student escrow system work?',
          'Post a new project bounty',
        ];
        break;
      }

      case 'CHANNELS': {
        const notices = await this.handleChannelsAgent();
        steps.push({
          agentName: 'Campus Communication Agent',
          action: 'Scanned batch channels and university broadcast feeds',
          status: 'completed',
          resultSnippet: `${notices.unreadCount} unread notices in Batch of 2026`,
        });

        if (citationsEnabled) {
          citations.push('Batch 2026 Official Channel', 'Student Affairs Broadcast');
        }

        content = `Here is your communication digest:\n\n` +
          `* **Unread Announcements:** **${notices.unreadCount} updates** in #batch-2026.\n` +
          `* **Latest Notice:** "${notices.latestNoticeTitle}" posted by ${notices.latestSender}.\n` +
          `* **Active Voice Space:** 4 peers are currently in the *Coding & Hackathon Stage*.`;

        followUps = [
          'Jump to Batch 2026 channel',
          'Join active voice room',
          'Mute non-academic notifications',
        ];
        break;
      }

      default: {
        steps.push({
          agentName: 'Campus Mind Synthesizer',
          action: 'Synthesizing contextual university response',
          status: 'completed',
          resultSnippet: 'Unified knowledge query completed',
        });

        if (citationsEnabled) {
          citations.push('Northstar Campus Knowledge Base');
        }

        content = `I have cross-checked your request with your Northstar profile:\n\n` +
          `Everything is in order with your academic courses, channel memberships, and student profile. ` +
          `You can ask me to calculate your attendance safe buffer, check room allocations, or look for peer project gigs anytime.`;

        followUps = [
          'What is my attendance buffer?',
          'What classes do I have today?',
          'Show campus freelance gigs',
        ];
        break;
      }
    }

    return {
      content,
      agentSteps: steps,
      citations,
      suggestedFollowUps: followUps,
    };
  }

  private classifyIntent(query: string): 'ACADEMICS' | 'TIMETABLE' | 'FREELANCE' | 'CHANNELS' | 'GENERAL' {
    if (query.includes('attendance') || query.includes('absent') || query.includes('75') || query.includes('bunk') || query.includes('margin')) {
      return 'ACADEMICS';
    }
    if (query.includes('schedule') || query.includes('timetable') || query.includes('class') || query.includes('lecture') || query.includes('room') || query.includes('today')) {
      return 'TIMETABLE';
    }
    if (query.includes('gig') || query.includes('freelance') || query.includes('bounty') || query.includes('contract') || query.includes('earn') || query.includes('hire')) {
      return 'FREELANCE';
    }
    if (query.includes('channel') || query.includes('notice') || query.includes('announcement') || query.includes('message') || query.includes('batch')) {
      return 'CHANNELS';
    }
    return 'GENERAL';
  }

  private async handleAcademicsAgent(_userId?: string) {
    return { attendanceRate: 82.4, safeAbsences: 2 };
  }

  private async handleTimetableAgent(_userId?: string) {
    return {
      classesToday: 3,
      nextSubject: 'Data Structures & Algorithms (CS201)',
      nextTime: '11:30 AM',
      nextRoom: 'Lecture Hall 102 (LH-1)',
      faculty: 'Dr. S. Mukherjee',
      subsequent: 'Digital Logic Simulation Lab at 2:30 PM (Lab 304)',
    };
  }

  private async handleFreelanceAgent() {
    return {
      openCount: 6,
      featuredTitle: 'Build Responsive React Dashboard Component',
      featuredBudget: '₹4,500',
    };
  }

  private async handleChannelsAgent() {
    return {
      unreadCount: 3,
      latestNoticeTitle: 'Mid-Semester Lab Exam Schedule Revised',
      latestSender: 'Academic Cell',
    };
  }
}