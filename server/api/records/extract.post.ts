import { z } from 'zod';

/**
 * Server-side text extraction via Google Gemini (vision + document OCR).
 * The client sends the file as base64; the key stays on the server.
 * Handles photos, scans, handwriting, and multiple languages far better than
 * in-browser OCR. The file is sent to Google for extraction and is not stored
 * by us.
 */

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'] as const;
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (inline request limit)

const bodySchema = z.object({
  mimeType: z.enum(ALLOWED),
  data: z.string().min(1), // base64, no data: prefix
  filename: z.string().optional(),
});

const PROMPT = [
  'You are a precise OCR engine for medical documents.',
  'Extract ALL text from the attached file exactly as written.',
  'Preserve line breaks and reading order. Keep the original language',
  '(English, Hindi, Marathi, etc.) — do not translate.',
  'Do not summarise, correct, explain, or add anything.',
  'Output only the extracted text. If there is no readable text, output nothing.',
].join(' ');

export default defineEventHandler(async (event) => {
  const { geminiApiKey, geminiModel } = useRuntimeConfig(event);
  if (!geminiApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Text extraction is not configured (missing GEMINI_API_KEY).' });
  }

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Expected a PDF, PNG, or JPG file.' });
  }
  const { mimeType, data } = parsed.data;

  const approxBytes = Math.floor((data.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'That file is too large (max 20 MB).' });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

  type GeminiResponse = {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  const requestBody = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data } }] }],
    generationConfig: { temperature: 0 },
  };

  // Retry transient overloads (429 / 5xx / "high demand"), which flash-lite hits under load.
  const MAX_ATTEMPTS = 3;
  let response: GeminiResponse | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await $fetch<GeminiResponse>(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiApiKey, 'Content-Type': 'application/json' },
        body: requestBody,
      });
      break;
    } catch (err: unknown) {
      const status =
        (err as { response?: { status?: number } })?.response?.status ??
        (err as { status?: number })?.status;
      const detail =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ??
        (err as { message?: string })?.message ??
        'unknown error';
      const transient =
        status === 429 ||
        (typeof status === 'number' && status >= 500) ||
        /high demand|overloaded|unavailable|try again/i.test(detail);

      if (transient && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      console.error(`Gemini extract failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, detail);
      throw createError({
        statusCode: 502,
        statusMessage: transient
          ? 'The extraction service is busy right now. Please try again in a moment.'
          : 'The extraction service failed. Please try again.',
      });
    }
  }

  if (!response) {
    throw createError({ statusCode: 502, statusMessage: 'The extraction service is busy right now. Please try again in a moment.' });
  }

  if (response.promptFeedback?.blockReason) {
    throw createError({ statusCode: 422, statusMessage: 'That file could not be processed.' });
  }

  const text = (response.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  return { text };
});
