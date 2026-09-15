import { generateText } from '../../services/openai.service';
import type { TranslateFieldsDtoType } from './translation.dto';

type TargetLang = TranslateFieldsDtoType['targetLang'];

const LANG_NAMES: Record<TargetLang, string> = {
  ta: 'Tamil (written in native Tamil Unicode script, e.g. "வணக்கம்" — never romanized/Tanglish transliteration such as "Vanakkam")',
};

// Conservative char budget per OpenAI call. generateText() doesn't surface
// finish_reason, so we can't detect truncation after the fact — instead we
// keep each batch small enough that truncation is very unlikely to begin
// with, and split proactively rather than react to it.
const MAX_BATCH_CHARS = 6_000;
const MAX_ATTEMPTS = 3;

function buildPrompt(fields: Record<string, string>, langName: string): string {
  return [
    `Translate the values of the following JSON object into ${langName}.`,
    'Rules:',
    '- Return ONLY a raw JSON object, with no markdown code fences and no commentary.',
    '- The output JSON must have exactly the same keys as the input, in any order.',
    '- Translate only the values, never the keys.',
    `- If a value is already in ${langName}, a proper noun (a person's name, a business/community name), a URL, or an email address, return it unchanged.`,
    '- Always use the native script of the target language. NEVER romanize or transliterate into Latin letters.',
    '- Preserve line breaks and whitespace structure within each value as closely as possible.',
    '',
    'Input JSON:',
    JSON.stringify(fields),
  ].join('\n');
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1]!.trim() : trimmed;
}

function isValidTranslationResult(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return expectedKeys.every((key) => key in record);
}

/**
 * Translates a single batch of fields in one OpenAI call, retrying on
 * malformed/incomplete JSON. Any key that never comes back as a non-empty
 * string falls back to its original English value — callers can always
 * render the result, translated or not.
 */
async function translateBatch(
  fields: Record<string, string>,
  targetLang: TargetLang,
): Promise<Record<string, string>> {
  const keys = Object.keys(fields);
  const langName = LANG_NAMES[targetLang];
  const prompt = buildPrompt(fields, langName);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await generateText(prompt);
    if (!raw) break;

    try {
      const parsed: unknown = JSON.parse(stripCodeFences(raw));
      if (isValidTranslationResult(parsed, keys)) {
        const result: Record<string, string> = {};
        for (const key of keys) {
          const value = parsed[key];
          result[key] = typeof value === 'string' && value.trim().length > 0 ? value : fields[key]!;
        }
        return result;
      }
    } catch {
      // Malformed JSON — fall through and retry.
    }
  }

  // Total failure: return the originals so the caller always gets something
  // renderable rather than a thrown error.
  return { ...fields };
}

/**
 * Splits a fields batch into halves whenever it's large enough that a single
 * OpenAI call risks running long, translating each half in parallel and
 * merging the results back together.
 */
export async function translateFields(
  fields: Record<string, string>,
  targetLang: TargetLang,
): Promise<Record<string, string>> {
  const entries = Object.entries(fields);
  const totalChars = entries.reduce((sum, [, value]) => sum + value.length, 0);

  if (entries.length <= 1 || totalChars <= MAX_BATCH_CHARS) {
    return translateBatch(fields, targetLang);
  }

  const mid = Math.ceil(entries.length / 2);
  const [firstHalf, secondHalf] = [entries.slice(0, mid), entries.slice(mid)];

  const [firstResult, secondResult] = await Promise.all([
    translateFields(Object.fromEntries(firstHalf), targetLang),
    translateFields(Object.fromEntries(secondHalf), targetLang),
  ]);

  return { ...firstResult, ...secondResult };
}
