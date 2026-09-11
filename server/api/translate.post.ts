import { z } from 'zod';

/**
 * Translate a chat reply into another language (for the chat's read-aloud /
 * language-transcription feature). Uses the shared Gemini config, key server-side.
 */
const schema = z.object({ text: z.string().min(1), target: z.string().min(1) });

export default defineEventHandler(async (event) => {
  const { geminiApiKey, geminiModel } = useRuntimeConfig(event);
  if (!geminiApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Translation is not configured (missing GEMINI_API_KEY).' });
  }

  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'text and target are required.' });
  }
  const { text, target } = parsed.data;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
  const prompt = [
    `Translate the message below into ${target}.`,
    "It's from a health assistant summarising someone's medical records.",
    'Preserve all numbers, units, dates and medical terms exactly, keep the same line breaks',
    'and any bullet points, and keep the tone plain and clear.',
    'Return ONLY the translation — no preamble, notes, or transliteration.',
    `\n\n---\n${text}`,
  ].join(' ');

  try {
    const res = await $fetch<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': geminiApiKey, 'Content-Type': 'application/json' },
      body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } },
    });
    const out = (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
    if (!out) throw new Error('empty translation');
    return { text: out };
  } catch (e) {
    console.error('translate failed:', (e as { message?: string })?.message ?? e);
    throw createError({ statusCode: 502, statusMessage: 'Translation failed. Please try again.' });
  }
});
