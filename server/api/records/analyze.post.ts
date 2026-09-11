import { z } from 'zod';

/**
 * Structured record extraction via Google Gemini.
 * Accepts either a file (base64) or raw typed text, OCRs it, and returns
 * structured fields for the Add-record confirm step. One Gemini call.
 */

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'] as const;
const MAX_BYTES = 20 * 1024 * 1024;

const bodySchema = z.union([
  z.object({ mimeType: z.enum(ALLOWED), data: z.string().min(1), filename: z.string().optional() }),
  z.object({ text: z.string().min(1) }),
]);

const PROMPT = [
  'You are a medical-records assistant. Read the attached document (or the provided text),',
  'OCR all of its text, and extract structured fields about it.',
  'Keep the original language in the "text" field; put the summary and field values in English.',
  'If a field is not present, use an empty string. "category" must be one of:',
  'Medical, Mental, Lifestyle, Family. "date" should be the date written on the document',
  '(any clear human format is fine). "dateISO" is that same date as YYYY-MM-DD, or empty',
  'if none is determinable — interpret ambiguous all-numeric dates as day/month/year',
  '(day first). "orderedBy" is the treating/prescribing/ordering doctor\'s name if any.',
  '"doctorRole" is that doctor\'s specialty or role if stated (e.g. General physician,',
  'Cardiologist, Therapist, Dentist), else empty. Do not invent facts not in the source.',
].join(' ');

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' }, // short human title, e.g. "Complete blood count (CBC)"
    type: { type: 'STRING' }, // e.g. "Lab report — CBC", "Prescription"
    category: { type: 'STRING' }, // Medical | Mental | Lifestyle | Family
    source: { type: 'STRING' }, // lab / clinic / hospital
    date: { type: 'STRING' }, // human-readable, as written
    dateISO: { type: 'STRING' }, // YYYY-MM-DD, or empty
    orderedBy: { type: 'STRING' }, // doctor name, if any
    doctorRole: { type: 'STRING' }, // doctor specialty/role, if stated
    summary: { type: 'STRING' }, // one plain sentence
    text: { type: 'STRING' }, // full extracted text
  },
  required: ['title', 'type', 'category', 'source', 'date', 'dateISO', 'orderedBy', 'doctorRole', 'summary', 'text'],
};

interface RecordFields {
  title: string; type: string; category: string; source: string;
  date: string; dateISO?: string; orderedBy?: string; doctorRole?: string;
  summary: string; text: string;
}

export default defineEventHandler(async (event): Promise<{ record: RecordFields }> => {
  const { geminiApiKey, geminiModel } = useRuntimeConfig(event);
  if (!geminiApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Extraction is not configured (missing GEMINI_API_KEY).' });
  }

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Provide a PDF/PNG/JPG file or some text.' });
  }

  // Build the content part: either the inline file, or the typed text.
  let contentPart: Record<string, unknown>;
  if ('data' in parsed.data) {
    if (Math.floor((parsed.data.data.length * 3) / 4) > MAX_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'That file is too large (max 20 MB).' });
    }
    contentPart = { inline_data: { mime_type: parsed.data.mimeType, data: parsed.data.data } };
  } else {
    contentPart = { text: `Document text:\n${parsed.data.text}` };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
  const requestBody = {
    contents: [{ parts: [{ text: PROMPT }, contentPart] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  type GeminiResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[] };
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
        (err as { message?: string })?.message ?? 'unknown error';
      const transient = status === 429 || (typeof status === 'number' && status >= 500) ||
        /high demand|overloaded|unavailable|try again/i.test(detail);
      if (transient && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      console.error(`Gemini analyze failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, detail);
      throw createError({
        statusCode: 502,
        statusMessage: transient
          ? 'The extraction service is busy right now. Please try again in a moment.'
          : 'The extraction service failed. Please try again.',
      });
    }
  }

  const raw = (response?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!raw) {
    throw createError({ statusCode: 422, statusMessage: "Couldn't read that record. Try a clearer file." });
  }

  let record: RecordFields;
  try {
    // Strip accidental code fences, then parse.
    record = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  } catch {
    console.error('Gemini analyze: non-JSON response:', raw.slice(0, 200));
    throw createError({ statusCode: 502, statusMessage: "Couldn't structure that record. Please try again." });
  }

  if (!record.text || record.text.trim().length < 10) {
    throw createError({ statusCode: 422, statusMessage: "Couldn't read enough from that record. Try a clearer file." });
  }

  return { record };
});
