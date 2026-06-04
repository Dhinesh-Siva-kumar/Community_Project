import OpenAI from 'openai';
import { env } from '../config/env';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) {
    console.warn('[OpenAIService] OPENAI_API_KEY not set — AI features disabled.');
    return null;
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

export async function generateText(prompt: string): Promise<string | null> {
  const c = getClient();
  if (!c) return null;

  try {
    const response = await c.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.error('[OpenAIService] Error:', err);
    return null;
  }
}
