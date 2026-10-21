import { Injectable, Logger } from '@nestjs/common';

export interface ChatMessageDto {
  role: 'user' | 'model' | 'assistant';
  content: string;
}

export type GeminiThinkingLevel = 'low' | 'medium' | 'high';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  // Accurate Google Generative Language endpoint mappings
  private readonly modelEndpointMap: Record<string, string> = {
    '3.5-flash-lite': 'gemini-3.5-flash-lite',
    '3.8-flash': 'gemini-3.8-flash',
    '3.1-pro': 'gemini-3.1-pro-preview',
    '4-argon': 'gemini-4-argon',
    'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-3.8-flash': 'gemini-3.8-flash',
    'gemini-3.1-pro': 'gemini-3.1-pro-preview',
    'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
    'gemini-4-argon': 'gemini-4-argon',
  };

  /**
   * Validates whether an API key is valid and has active quota
   */
  async validateApiKey(keyToTest: string): Promise<{
    valid: boolean;
    status: number;
    message: string;
  }> {
    const key = (keyToTest || '').trim();
    if (!key) {
      return { valid: false, status: 400, message: 'API key cannot be empty.' };
    }

    try {
      // Test ping directly against Google Gemini
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          }),
        },
      );

      if (response.ok) {
        return {
          valid: true,
          status: 200,
          message: '✓ API key verified successfully! Connected to Google Gemini.',
        };
      }

      const errData = (await response.json().catch(() => ({}))) as {
        error?: { code?: number; message?: string };
      };

      const code = errData.error?.code || response.status;
      const msg = errData.error?.message || response.statusText;

      if (code === 400 || code === 403) {
        return { valid: false, status: code, message: `✕ Invalid API key: ${msg}` };
      }
      if (code === 429) {
        return {
          valid: false,
          status: code,
          message: '⚠️ Quota Exceeded (429): Check your Google AI Studio plan or billing details.',
        };
      }

      return { valid: false, status: code, message: `✕ Verification failed (${code}): ${msg}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, status: 500, message: `Network error: ${msg}` };
    }
  }

  /**
   * Dispatches chat to Google Gemini with model selection, thinking level,
   * custom API key override, and live screen/page context.
   */
  async chat(
    messages: ChatMessageDto[],
    requestedModel = 'gemini-3.5-flash-lite',
    thinkingLevel: GeminiThinkingLevel = 'low',
    modelName = '3.5 Flash-Lite',
    apiKeyOverride?: string,
    pageContext?: string,
  ): Promise<string> {
    const apiKey = (apiKeyOverride || process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      return '⚠️ No Google Gemini API key configured. Please enter your API key in the AI Drawer settings (⚙️) or set GEMINI_API_KEY in campus-api/.env.';
    }

    const targetModel = this.modelEndpointMap[requestedModel] || requestedModel;

    // Reasoning directives based on Thinking Level
    const thinkingDirectives: Record<GeminiThinkingLevel, string> = {
      low: 'Provide quick, efficient, direct, and concise answers without unnecessary filler.',
      medium: 'Provide balanced depth with structured academic clarity and concise examples.',
      high: 'Provide extra-thorough, deep step-by-step reasoning, mathematical proofs, and comprehensive problem breakdown.',
    };

    const reasoningInstruction = thinkingDirectives[thinkingLevel] || thinkingDirectives.low;

    // Format conversation contents for Gemini
    const formattedContents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Zero-Knowledge Security Policy
    const privacyInstructions = `
CRITICAL PRIVACY & ZERO-KNOWLEDGE POLICY:
1. ZERO PERSONAL IDENTIFIER ACCESS: You must NEVER reveal, repeat, construct, or guess personal email addresses, phone numbers, passwords, or private profile credentials of any student, faculty, or staff member.
2. If asked about your email, the user's email, or any other person's email, refuse politely:
   "For security and privacy reasons, I do not have access to private email addresses or personal account credentials."
3. You must NOT attempt to guess, construct, or formulate institutional email addresses from names or roll numbers.
4. Assist only with academic curriculum, schedules, coursework, and general campus notices.`;

    // Inject System Prompt + Live Screen Context
    let systemPrompt = `[SYSTEM INSTRUCTION: You are the Campus AI Academic Copilot. Model: ${modelName}. Thinking Level: ${thinkingLevel} (${reasoningInstruction}).\n${privacyInstructions}]`;
    if (pageContext) {
      // Secondary backend sanitization for screen context
      const cleanContext = pageContext.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[PROTECTED_EMAIL]');
      systemPrompt += `\n[LIVE SCREEN / PAGE CONTEXT THAT THE STUDENT IS CURRENTLY VIEWING:\n${cleanContext}\nUse this live portal data to accurately answer any questions regarding their timetable, classes, professors, rooms, notices, or assignments.]`;
    }

    formattedContents.unshift({
      role: 'user',
      parts: [{ text: systemPrompt }],
    });

    // Cascading fallback chain (tries target model first, then stable models)
    const fallbackChain = [
      targetModel,
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-4-argon',
    ];
    const uniqueModels = Array.from(new Set(fallbackChain));

    for (const model of uniqueModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({ contents: formattedContents }),
          },
        );

        if (response.ok) {
          const data = (await response.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) {
            this.logger.log(`Gemini response generated using active model: ${model}`);
            // Final safety filter: redact any email address pattern before the reply leaves the server
            const sanitizedReply = reply.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[PROTECTED_EMAIL]');
            return sanitizedReply;
          }
        } else {
          const errText = await response.text();
          this.logger.warn(`Model ${model} returned ${response.status}: ${errText.slice(0, 100)}... Trying next model in chain.`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Network error for model ${model}: ${msg}`);
      }
    }

    return '⚠️ Unable to generate response from Google AI. Please verify your GEMINI_API_KEY and active quota.';
  }
}