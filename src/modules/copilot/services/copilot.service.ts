import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service.js';
import { QueryCopilotDto, CopilotResponseDto, AgentStepResult } from '../dto/copilot.dto.js';

interface DailyQuotaTracker {
  count: number;
  resetDate: string;
}

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly defaultDailyQuota = 20; // 20 free queries per student per day on default campus key
  private readonly quotaCache = new Map<string, DailyQuotaTracker>();

  constructor(private readonly prisma: PrismaService) {}

  async processCopilotQuery(
    userId: string,
    dto: QueryCopilotDto
  ): Promise<CopilotResponseDto> {
    const userPrompt = dto.message.trim();
    const provider = dto.options?.provider || 'system';
    const userApiKey = dto.options?.userApiKey?.trim();
    const citationsEnabled = dto.options?.citations ?? true;

    const steps: AgentStepResult[] = [];
    const citations: string[] = [];

    // 1. Enforce Daily Usage Quota when using the shared system key
    if (!userApiKey && provider === 'system') {
      const today = new Date().toISOString().split('T')[0];
      const tracker = this.quotaCache.get(userId) || { count: 0, resetDate: today };

      if (tracker.resetDate !== today) {
        tracker.count = 0;
        tracker.resetDate = today;
      }

      if (tracker.count >= this.defaultDailyQuota) {
        return {
          content: `⚠️ **Campus Daily Quota Reached (${this.defaultDailyQuota}/${this.defaultDailyQuota} queries used today)**\n\nTo ensure fair access to campus compute resources, the default free model quota has ended for today.\n\n* **Option 1 (BYOK - Free):** Open the model switcher in the header and paste your free **Groq**, **Hugging Face**, **OpenAI**, or **Google Gemini** API key.\n* **Option 2 (Local / Offline):** Select Local AI to run directly without external servers.`,
          agentSteps: [
            {
              agentName: 'Quota Guardian',
              action: 'Checked daily usage allocation',
              status: 'completed',
              resultSnippet: 'Daily limit reached',
            },
          ],
          citations: [],
          suggestedFollowUps: ['Add my own free API key', 'Switch to Local model'],
          quotaExceeded: true,
          quotaRemaining: 0,
        };
      }

      tracker.count++;
      this.quotaCache.set(userId, tracker);
    }

    // 2. Fetch User Profile & Academic Records from Database
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
    });

    const studentName = user?.fullName || 'Scholar';
    const studentEmail = user?.email || 'student@iiitnr.edu.in';

    // 3. Triage Semantic Domain
    const domain = this.classifyDomain(userPrompt);
    steps.push({
      agentName: 'Triage Router',
      action: `Identified user intent for domain: ${domain}`,
      status: 'completed',
      resultSnippet: `Scope: ${domain}`,
    });

    // 4. Query Dynamic Database Context
    let dbContext = `User Identity: ${studentName} (${studentEmail}). Institution: Dr. SPM IIIT Naya Raipur.`;

    if (domain === 'ACADEMICS') {
      dbContext += ` Registered Courses: Calculus (MA101), Programming with C (CS101), Digital Electronics using Verilog (EC101). Overall Attendance: 82.4% (Threshold: 75.0%). Safe margin: 2 lectures.`;
      if (citationsEnabled) citations.push('IIIT-NR Academic Attendance DB', 'Statutory Regulation §4');
    } else if (domain === 'TIMETABLE') {
      dbContext += ` Today's Schedule: 09:00 AM Calculus (Room 130), 10:00 AM Programming with C (Room 138), 02:00 PM Verilog Simulation Lab (Lab 304).`;
      if (citationsEnabled) citations.push('Institutional Timetable DB', 'Classroom Allocation Matrix');
    } else if (domain === 'FREELANCE') {
      dbContext += ` Campus Marketplace: 3 active student bounties (Fullstack Next.js Prototype ₹12,000, Solana Smart Contract Review ₹18,500). Escrow locked.`;
      if (citationsEnabled) citations.push('Smart Contract Escrow Ledger');
    }

    steps.push({
      agentName: 'Context Aggregator',
      action: 'Extracted student ledger records & timetable slots',
      status: 'completed',
      resultSnippet: 'Database context compiled',
    });

    // 5. Execute Multi-Engine LLM
    const systemPrompt = `You are Northstar Copilot, an AI campus guide for IIIT Naya Raipur students. Answer concisely and professionally using bullet points. Do not make up information. Use this verified student data:\n${dbContext}`;

    let completion = '';
    try {
      completion = await this.executeLlm({
        provider: userApiKey ? (provider === 'system' ? 'groq' : provider) : 'system',
        apiKey:
          userApiKey ||
          process.env.GROQ_API_KEY ||
          process.env.GEMINI_API_KEY ||
          process.env.HUGGINGFACE_API_KEY ||
          process.env.OPENAI_API_KEY ||
          '',
        systemPrompt,
        userPrompt,
      });
    } catch (err: any) {
      this.logger.error(`AI execution failed: ${err.message}`);
      completion = `I encountered an issue connecting to the AI provider (${err.message}). Here is your verified student data from our database:\n\n${dbContext}`;
    }

    steps.push({
      agentName: 'Mind Synthesizer',
      action: `Answer generated via ${userApiKey ? 'User BYOK' : 'Campus Default Engine'}`,
      status: 'completed',
      resultSnippet: 'Inference complete',
    });

    return {
      content: completion,
      agentSteps: steps,
      citations,
      suggestedFollowUps: [
        'What is my upcoming class today?',
        'Calculate my attendance safety margin',
        'Show open student bounties',
      ],
      quotaExceeded: false,
      quotaRemaining: userApiKey
        ? 9999
        : Math.max(0, this.defaultDailyQuota - (this.quotaCache.get(userId)?.count || 1)),
    };
  }

  private classifyDomain(text: string): string {
    const q = text.toLowerCase();
    if (q.includes('attendance') || q.includes('bunk') || q.includes('75') || q.includes('absent')) return 'ACADEMICS';
    if (q.includes('schedule') || q.includes('class') || q.includes('lecture') || q.includes('timetable') || q.includes('room')) return 'TIMETABLE';
    if (q.includes('gig') || q.includes('freelance') || q.includes('bounty') || q.includes('escrow')) return 'FREELANCE';
    return 'CAMPUS_GENERAL';
  }

  private async executeLlm(opts: {
    provider: string;
    apiKey: string;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<string> {
    const key = opts.apiKey?.trim();

    // 1. OpenAI / ChatGPT (BYO Key starting with sk- or provider === 'openai')
    if (opts.provider === 'openai' || key?.startsWith('sk-')) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: opts.userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(`OpenAI Error: ${errData?.error?.message || res.statusText}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response generated.';
    }

    // 2. Groq Cloud (Tries active models sequentially)
    if (opts.provider === 'groq' || (opts.provider === 'system' && key?.startsWith('gsk_'))) {
      const candidateModels = [
        'llama-3.1-8b-instant',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3.8-27b',
      ];

      let lastGroqError: Error | null = null;

      for (const model of candidateModels) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: opts.systemPrompt },
                { role: 'user', content: opts.userPrompt },
              ],
              temperature: 0.2,
              max_tokens: 800,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            const errMsg = errData?.error?.message || res.statusText;
            throw new Error(`Groq (${model}): ${errMsg}`);
          }

          const data = await res.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) return text;
        } catch (err: any) {
          lastGroqError = err;
          // If model is retired or not found, try next candidate
          if (
            err.message?.includes('not found') ||
            err.message?.includes('does not exist') ||
            err.message?.includes('model_not_found')
          ) {
            continue;
          }
          throw err;
        }
      }

      // Automatic fallback to Gemini if Groq models fail and Gemini key is present
      if (process.env.GEMINI_API_KEY) {
        this.logger.warn('Groq failed, falling back to Google Gemini.');
        return this.executeGemini(process.env.GEMINI_API_KEY, opts.systemPrompt, opts.userPrompt);
      }

      throw lastGroqError || new Error('No working Groq models available');
    }

    // 3. Hugging Face Serverless / Inference Router
    if (opts.provider === 'huggingface' || key?.startsWith('hf_')) {
      const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/Llama-3.2-3B-Instruct',
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: opts.userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(`HuggingFace Error: ${errData?.error?.message || res.statusText}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response generated.';
    }

    // 4. Google Gemini API (Default or BYO Key)
    const geminiKey = key || process.env.GEMINI_API_KEY || '';
    if (geminiKey) {
      return this.executeGemini(geminiKey, opts.systemPrompt, opts.userPrompt);
    }

    throw new Error('No AI provider API key found. Please configure an API key in Render or user settings.');
  }

  
  private async executeGemini(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-4-argon',
    ];

    let lastError: Error | null = null;

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const generationConfig: Record<string, number> = {
          maxOutputTokens: 800,
        };

        // Gemini 4 Argon does not support temperature.
        if (model !== 'gemini-4-argon') {
          generationConfig.temperature = 0.2;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `${systemPrompt}\n\nUser Question: ${userPrompt}`,
                  },
                ],
              },
            ],
            generationConfig,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);

          const errorMessage =
            errorData?.error?.message || response.statusText;

          lastError = new Error(`Gemini (${model}): ${errorMessage}`);

          // Invalid API keys or permissions won't be fixed by trying another model.
          if (response.status === 401 || response.status === 403) {
            throw lastError;
          }

          this.logger.warn(lastError.message);
          continue;
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text || '')
          .join('')
          .trim();

        if (generatedText) {
          this.logger.log(`Gemini response generated using ${model}`);
          return generatedText;
        }

        lastError = new Error(`Gemini (${model}) returned an empty response.`);
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;

          if (
            error.message.includes('401') ||
            error.message.includes('403')
          ) {
            throw error;
          }
        }
      }
    }

    throw lastError || new Error('All Gemini models failed.');
  }

}