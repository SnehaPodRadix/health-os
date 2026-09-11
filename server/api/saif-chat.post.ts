/**
 * POST /api/saif-chat — Health chat via Gemini.
 *
 * OWNED BY: Saif. Uses the SAME server-side key as the record-extraction feature
 * (runtimeConfig.geminiApiKey / GEMINI_API_KEY), so the key stays secret and the
 * whole app needs only one env var. Model comes from GEMINI_MODEL too.
 *
 * Body:    { messages: { role: 'user' | 'assistant'; text: string }[], report?: string }
 * Returns: { text, model, usage: { promptTokens, outputTokens, totalTokens } }
 * On any failure it throws (5xx) so the client shows its pre-defined demo reply.
 */
interface SaifChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

function saifSystemPrompt(report: string): string {
  const base = [
    'You are Sage, the AI health guide inside Health OS.',
    'Sage reads the user’s medical records and tells them what matters, when it matters —',
    'explaining results in plain, calm language.',
    'GUARDRAILS (never break these): You are NOT a medical practitioner and are NOT authorized',
    'to dispense medical advice. Never diagnose a condition, never prescribe, and never tell the',
    'user to start, stop, or change a medication or dose. If asked to, briefly decline and say to',
    'consult a licensed healthcare professional. Never invent lab values, numbers, or facts that',
    'are not present in the records below. If someone describes an emergency (e.g. chest pain,',
    'trouble breathing, thoughts of self-harm), tell them to contact emergency services immediately.',
    'Keep replies concise — a few short sentences or a tight list. Ground every answer in the',
    'user’s records when they are relevant, and cite the specific value or record you are referring to.',
    'If a question is unrelated to health, gently steer back.',
  ].join(' ');
  return report.trim()
    ? `${base}\n\nThe user’s saved medical records (use these as your source of truth):\n"""\n${report}\n"""`
    : `${base}\n\nThe user has not uploaded any medical records yet. If they ask about their results, invite them to add a record first.`;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  // Prefer the live runtime env var (Netlify Functions expose it directly) and
  // fall back to the build-time runtimeConfig value.
  const geminiApiKey = process.env.GEMINI_API_KEY || (config.geminiApiKey as string) || '';
  const geminiModel = process.env.GEMINI_MODEL || (config.geminiModel as string) || 'gemini-3.1-flash-lite';
  if (!geminiApiKey) {
    throw createError({ statusCode: 503, statusMessage: 'gemini-no-key' });
  }

  const body = await readBody<{ messages?: SaifChatMessage[]; report?: string }>(event);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const report = typeof body?.report === 'string' ? body.report : '';
  const model = (geminiModel as string) || 'gemini-3.1-flash-lite';

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  const data = await $fetch<any>(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      query: { key: geminiApiKey },
      body: {
        system_instruction: { parts: [{ text: saifSystemPrompt(report) }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
      },
    },
  );

  const text: string = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: { text?: string }) => p.text || '')
    .join('')
    .trim();
  if (!text) throw createError({ statusCode: 502, statusMessage: 'gemini-empty' });

  const u = data?.usageMetadata || {};
  return {
    text,
    model,
    usage: {
      promptTokens: u.promptTokenCount || 0,
      outputTokens: u.candidatesTokenCount || 0,
      totalTokens: u.totalTokenCount || 0,
    },
  };
});
