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
    'You are Health OS Assistant, a warm, careful AI health guide.',
    'Explain things in plain language. Keep replies concise — a few short sentences or a tight list.',
    'You are NOT a doctor and you do NOT diagnose. For anything concerning, tell the user to consult a licensed healthcare professional.',
    'Never invent lab values or numbers that are not present in the report.',
    'If a question is unrelated to health, gently steer back.',
  ].join(' ');
  return report.trim()
    ? `${base}\n\nThe user shared this health report:\n"""\n${report}\n"""`
    : base;
}

export default defineEventHandler(async (event) => {
  const { geminiApiKey, geminiModel } = useRuntimeConfig();
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
