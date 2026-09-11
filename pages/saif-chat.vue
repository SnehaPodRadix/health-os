<script setup lang="ts">
/**
 * saif-chat.vue — Health chat (Gemini) + offline demo fallback. Served at /chat.
 *
 * OWNED BY: Saif. Self-contained so it doesn't collide with other work in
 * progress. Everything is namespaced with `saif` (state key, action fns).
 *
 * This is ONLY the chat. The health report is uploaded by a separate feature;
 * when we merge, that feature just sets `saifState.value.report` and the chat
 * automatically passes it to Gemini as context (see saifSystemPrompt()).
 *
 * If the Gemini key is missing / over quota / erroring, we transparently fall
 * back to a canned "Demo mode" so a live demo never breaks.
 *
 * SECURITY NOTE: calls Gemini directly from the browser using a *public* key
 * (NUXT_PUBLIC_SAIF_GEMINI_API_KEY). Fine for a hackathon throwaway key. To keep
 * it secret, move the callGemini() fetch into server/api/saif-chat.post.ts.
 */

// Served at /chat (file stays saif-prefixed to avoid clashing with the other dev).
definePageMeta({ alias: ['/chat'] });

// ---- config -----------------------------------------------------------------
const runtime = useRuntimeConfig();
const SAIF_GEMINI_KEY = (runtime.public.saifGeminiApiKey as string) || '';
// Lite model: ~2s replies with no wasted "thinking" tokens (3.6-flash took ~30s).
// Verified working with the current key (Sept 2026). Older flash models are retired.
const SAIF_GEMINI_MODEL = 'gemini-3.5-flash-lite';
// Snappy mode: this key queues 20-50s, so wait only briefly for a real answer,
// then fall back to the instant demo reply. Raise this if you swap in a fast
// AIzaSy key and want to always wait for the live response.
const SAIF_GEMINI_TIMEOUT_MS = 7000;
const SAIF_GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${SAIF_GEMINI_MODEL}:generateContent`;

// ---- types ------------------------------------------------------------------
type SaifRole = 'user' | 'assistant';
interface SaifMessage {
  role: SaifRole;
  text: string;
  demo?: boolean; // true if this reply came from the offline fallback
}
interface SaifChatState {
  report: string; // MERGE HOOK: upload feature sets this; empty for now.
  messages: SaifMessage[];
  mode: 'live' | 'demo';
  sending: boolean;
}

// ---- state (namespaced so it won't clash with the other dev's state) --------
const saifState = useState<SaifChatState>('saif-chat-state', () => ({
  report: '',
  messages: [],
  mode: SAIF_GEMINI_KEY ? 'live' : 'demo',
  sending: false,
}));

const saifDraft = ref('');
const saifScroller = ref<HTMLElement | null>(null);
const saifHasReport = computed(() => saifState.value.report.trim().length > 0);

// Paperclip → paste-report panel.
const saifShowAttach = ref(false);
const saifReportDraft = ref('');
function saifToggleAttach() {
  saifReportDraft.value = saifState.value.report;
  saifShowAttach.value = !saifShowAttach.value;
}
function saifAttachReport() {
  saifState.value.report = saifReportDraft.value.trim();
  saifShowAttach.value = false;
}
function saifClearReport() {
  saifState.value.report = '';
  saifReportDraft.value = '';
  saifShowAttach.value = false;
}

// Seed a greeting on first load.
if (saifState.value.messages.length === 0) {
  saifState.value.messages.push({
    role: 'assistant',
    text: "Hi! I'm your Health OS assistant. Ask me anything about your health or your reports. I'm an AI guide, not a substitute for your doctor.",
    demo: saifState.value.mode === 'demo',
  });
}

// ---- actions ----------------------------------------------------------------
async function saifSend() {
  const text = saifDraft.value.trim();
  if (!text || saifState.value.sending) return;

  saifState.value.messages.push({ role: 'user', text });
  saifDraft.value = '';
  saifState.value.sending = true;
  saifScrollToBottom();

  let reply: string;
  let usedDemo: boolean;

  // Always try live if we have a key — don't stay stuck in demo. The mode badge
  // reflects the LAST attempt, so a single fast reply flips it back to live.
  if (SAIF_GEMINI_KEY) {
    try {
      reply = await saifCallGemini();
      saifState.value.mode = 'live';
      usedDemo = false;
    } catch (err) {
      // Timeout / quota (429) / network / bad model → demo reply for THIS message.
      console.warn('[saif-chat] Gemini failed, using demo reply:', err);
      saifState.value.mode = 'demo';
      usedDemo = true;
      reply = saifDummyReply(text);
    }
  } else {
    saifState.value.mode = 'demo';
    usedDemo = true;
    reply = saifDummyReply(text);
  }

  saifState.value.messages.push({ role: 'assistant', text: reply, demo: usedDemo });
  saifState.value.sending = false;
  saifScrollToBottom();
}

function saifRetryLive() {
  if (!SAIF_GEMINI_KEY) return;
  saifState.value.mode = 'live';
}

function saifResetChat() {
  saifState.value.messages = [];
  saifState.value.mode = SAIF_GEMINI_KEY ? 'live' : 'demo';
  saifState.value.messages.push({
    role: 'assistant',
    text: "Hi! I'm your Health OS assistant. Ask me anything about your health or your reports. I'm an AI guide, not a substitute for your doctor.",
    demo: saifState.value.mode === 'demo',
  });
}

// ---- Gemini call ------------------------------------------------------------
function saifSystemPrompt(): string {
  const base = [
    'You are Health OS Assistant, a warm, careful AI health guide.',
    'Explain things in plain language. Keep replies concise — a few short sentences or a tight list.',
    'You are NOT a doctor and you do NOT diagnose. For anything concerning, tell the user to consult a licensed healthcare professional.',
    'Never invent lab values or numbers that are not present in the report.',
    'If a question is unrelated to health, gently steer back.',
  ].join(' ');
  if (saifHasReport.value) {
    return `${base}\n\nThe user shared this health report:\n"""\n${saifState.value.report}\n"""`;
  }
  return base;
}

async function saifCallGemini(): Promise<string> {
  if (!SAIF_GEMINI_KEY) throw new Error('no-key');

  const contents = saifState.value.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  // Abort if the request outlives the timeout (throttled key → instant fallback).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SAIF_GEMINI_TIMEOUT_MS);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${SAIF_GEMINI_URL}?key=${encodeURIComponent(SAIF_GEMINI_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: saifSystemPrompt() }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
      }),
    });
  } catch (e) {
    const reason = (e as Error)?.name === 'AbortError' ? 'timeout' : 'network';
    saifRecordUsage({ ms: Date.now() - t0, ok: false, reason });
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    saifRecordUsage({ ms: Date.now() - t0, ok: false, reason: `http-${res.status}` });
    throw new Error(`gemini-http-${res.status}`); // 429 = quota/limit reached
  }
  const data = await res.json();
  const u = data?.usageMetadata || {};
  saifRecordUsage({
    ms: Date.now() - t0,
    ok: true,
    promptTokens: u.promptTokenCount || 0,
    outputTokens: u.candidatesTokenCount || 0,
    totalTokens: u.totalTokenCount || 0,
  });
  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('gemini-empty');
  return text;
}

// Log one live API call to localStorage so /usage can show real numbers.
// (Google doesn't expose per-key usage via the API key, so we track it here.)
interface SaifUsageEntry {
  ts: number;
  model: string;
  ms: number;
  ok: boolean;
  reason?: string;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
function saifRecordUsage(partial: Omit<SaifUsageEntry, 'ts' | 'model'>) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem('saif-usage-log');
    const arr: SaifUsageEntry[] = raw ? JSON.parse(raw) : [];
    arr.push({ ts: Date.now(), model: SAIF_GEMINI_MODEL, ...partial });
    while (arr.length > 300) arr.shift();
    localStorage.setItem('saif-usage-log', JSON.stringify(arr));
  } catch {
    /* ignore storage errors */
  }
}

// ---- offline demo fallback (pre-defined replies) ----------------------------
// Keyword-matched canned answers so the demo works with no API. First match wins.
const SAIF_DEMO_RULES: { match: RegExp; reply: string }[] = [
  {
    match: /\b(hi|hello|hey|start|begin)\b/i,
    reply:
      "Hi! I'm your Health OS assistant. I can walk you through your report, explain what the numbers mean, and flag anything worth a closer look. What would you like to start with? (Demo response.)",
  },
  {
    match: /\b(cholesterol|lipid|ldl|hdl|triglyceride)\b/i,
    reply:
      "Cholesterol panels usually show LDL ('bad'), HDL ('good'), and triglycerides. LDL above ~130 mg/dL or low HDL are the usual flags. Diet, movement, and follow-up bloodwork are the typical next steps — confirm targets with your doctor. (Demo response.)",
  },
  {
    match: /\b(sugar|glucose|diabet|hba1c|a1c)\b/i,
    reply:
      "Blood sugar is often reported as fasting glucose and HbA1c. Fasting 100–125 mg/dL or HbA1c 5.7–6.4% is the 'pre-diabetes' range, and higher suggests diabetes. This is general info — your doctor should interpret your actual numbers. (Demo response.)",
  },
  {
    match: /\b(blood ?pressure|bp|hypertension|systolic|diastolic)\b/i,
    reply:
      "Blood pressure around 120/80 mmHg is considered normal; consistently 130/80+ is elevated. A single high reading isn't a diagnosis — trends over time matter. Please review persistent highs with a clinician. (Demo response.)",
  },
  {
    match: /\b(cbc|hemoglobin|haemoglobin|anemia|anaemia|rbc|wbc|platelet)\b/i,
    reply:
      "A CBC covers red cells, white cells, and platelets. Low hemoglobin can point to anemia; high white cells can suggest infection. These need to be read together with your symptoms — a doctor can tell you what's significant. (Demo response.)",
  },
  {
    match: /\b(thyroid|tsh|t3|t4)\b/i,
    reply:
      "Thyroid panels usually center on TSH, with T3/T4. High TSH often means an underactive thyroid, low TSH an overactive one. Symptoms and repeat testing guide treatment — worth discussing with your physician. (Demo response.)",
  },
  {
    match: /\b(vitamin|deficien|d3|b12|iron|ferritin)\b/i,
    reply:
      "Vitamin/mineral panels (like Vitamin D, B12, iron/ferritin) flag deficiencies that can cause fatigue or other symptoms. Supplements and diet changes are common fixes, but dosing should be confirmed with your doctor. (Demo response.)",
  },
  {
    match: /\b(headache|fever|pain|cough|cold|tired|fatigue|dizzy)\b/i,
    reply:
      "Symptoms like these are usually mild and self-limiting, but seek care promptly if they're severe, persistent, or come with warning signs (very high fever, confusion, breathing trouble). I can't diagnose — a clinician can. (Demo response.)",
  },
  {
    match: /\b(medicine|medication|dose|dosage|tablet|drug|prescription)\b/i,
    reply:
      "I can explain what a medication is generally for, but I can't set or change your dose. Always follow the prescription and check timing, interactions, and side effects with your pharmacist or doctor. (Demo response.)",
  },
  {
    match: /\b(normal|range|mean|explain|understand|what is|whats)\b/i,
    reply:
      "Most reports list your value next to a reference range — results inside the range are typically 'normal', and ones outside get flagged. Tell me the specific line you're curious about and I'll explain it in plain terms. (Demo response.)",
  },
];

const SAIF_DEMO_DEFAULT =
  "Here's the general picture: look for any values marked outside their reference range, and note trends over time rather than a single reading. For anything flagged or concerning, bring it to a licensed healthcare professional. (Demo response.)";

function saifDummyReply(userText: string): string {
  for (const rule of SAIF_DEMO_RULES) {
    if (rule.match.test(userText)) return rule.reply;
  }
  return SAIF_DEMO_DEFAULT;
}

// ---- ui helpers -------------------------------------------------------------
function saifScrollToBottom() {
  nextTick(() => {
    const el = saifScroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function saifOnComposerKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    saifSend();
  }
}
</script>

<template>
  <main class="saif-wrap">
    <header class="saif-head">
      <div class="saif-brand">
        <div class="saif-logo" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
        </div>
        <div>
          <h1>Health Assistant</h1>
          <p class="saif-sub">AI-guided · not a substitute for professional care</p>
        </div>
      </div>
      <span class="saif-mode" :class="saifState.mode">
        <span class="saif-dot"></span>
        {{ saifState.mode === 'live' ? 'Live · Gemini' : 'Demo mode' }}
      </span>
    </header>

    <section class="saif-chat">
      <div v-if="saifHasReport" class="saif-report-chip">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 3v5h5" /><path d="M7 3h8l5 5v13H7z" />
        </svg>
        Report attached ({{ saifState.report.length }} chars)
        <button type="button" class="saif-chip-btn" @click="saifClearReport">remove</button>
      </div>

      <div v-if="saifState.mode === 'demo' && SAIF_GEMINI_KEY" class="saif-banner">
        ⚠️ Live AI is unavailable (quota or error) — showing pre-defined demo replies.
        <button type="button" class="saif-chip-btn" @click="saifRetryLive">try live again</button>
      </div>

      <div ref="saifScroller" class="saif-messages">
        <div v-for="(m, i) in saifState.messages" :key="i" class="saif-msg" :class="m.role">
          <div class="saif-bubble">
            {{ m.text }}
            <span v-if="m.demo && m.role === 'assistant'" class="saif-demo-tag">demo</span>
          </div>
        </div>
        <div v-if="saifState.sending" class="saif-msg assistant">
          <div class="saif-bubble saif-typing"><span></span><span></span><span></span></div>
        </div>
      </div>

      <!-- paste-report panel (opened by the paperclip) -->
      <div v-if="saifShowAttach" class="saif-attach-panel">
        <label class="saif-attach-label">Paste your health report</label>
        <textarea
          v-model="saifReportDraft"
          class="saif-attach-input"
          rows="5"
          placeholder="Paste lab results or a report here — I'll use it as context."
        ></textarea>
        <div class="saif-attach-row">
          <button type="button" class="saif-btn primary" @click="saifAttachReport">Attach report</button>
          <button type="button" class="saif-link" @click="saifShowAttach = false">Cancel</button>
        </div>
      </div>

      <div class="saif-composer">
        <button
          type="button"
          class="saif-clip"
          :class="{ active: saifHasReport }"
          @click="saifToggleAttach"
          aria-label="Attach health report"
          title="Paste a health report"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
          </svg>
        </button>
        <textarea
          v-model="saifDraft"
          class="saif-composer-input"
          rows="1"
          placeholder="Ask about your health…"
          @keydown="saifOnComposerKey"
        ></textarea>
        <button
          type="button"
          class="saif-send"
          :disabled="!saifDraft.trim() || saifState.sending"
          @click="saifSend"
          aria-label="Send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>

      <div class="saif-foot">
        <button type="button" class="saif-link" @click="saifResetChat">Clear chat</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.saif-wrap { max-width: 720px; margin: 40px auto; padding: 0 20px; font-family: system-ui, sans-serif; color: #1a1a1a; display: flex; flex-direction: column; min-height: 80vh; }

/* header */
.saif-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.saif-brand { display: flex; align-items: center; gap: 12px; }
.saif-logo { width: 38px; height: 38px; border-radius: 11px; background: #5b66cc; display: flex; align-items: center; justify-content: center; }
.saif-head h1 { font-size: 19px; margin: 0; }
.saif-sub { font-size: 12px; color: #a8a8a2; margin: 2px 0 0; }
.saif-mode { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 16px; border: 1.5px solid #cfcfc9; background: #fff; color: #6d6d67; }
.saif-mode .saif-dot { width: 8px; height: 8px; border-radius: 50%; background: #b6b6ae; }
.saif-mode.live { color: #2f7a4d; border-color: #bfe0cc; background: #eefaf1; }
.saif-mode.live .saif-dot { background: #3bab68; }
.saif-mode.demo { color: #9a6a2f; border-color: #ecd9bf; background: #fbf3e6; }
.saif-mode.demo .saif-dot { background: #d89b3b; }

/* chat */
.saif-chat { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.saif-report-chip { display: inline-flex; align-items: center; gap: 7px; align-self: flex-start; font-size: 12px; font-weight: 600; color: #6069c0; background: #eef0ff; border: 1.5px solid #d7dbf7; border-radius: 16px; padding: 5px 11px; margin-bottom: 10px; }
.saif-banner { font-size: 13px; color: #9a6a2f; background: #fbf3e6; border: 1.5px solid #ecd9bf; border-radius: 10px; padding: 10px 13px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.saif-chip-btn { border: none; background: none; color: #5b66cc; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; text-decoration: underline; }

.saif-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 18px; background: #fbfbf9; border: 1.5px solid #eceae3; border-radius: 14px; min-height: 340px; }
.saif-msg { display: flex; }
.saif-msg.user { justify-content: flex-end; }
.saif-bubble { max-width: 78%; padding: 12px 15px; font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.saif-msg.assistant .saif-bubble { background: #fff; border: 1.5px solid #e6e4dd; border-radius: 16px 16px 16px 4px; color: #3a3a42; }
.saif-msg.user .saif-bubble { background: #e8ebff; border: 1.5px solid #d7dbf7; border-radius: 16px 16px 4px 16px; color: #4b4f78; }
.saif-demo-tag { display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #9a6a2f; background: #fbf3e6; border-radius: 6px; padding: 1px 6px; vertical-align: middle; }

.saif-typing { display: inline-flex; gap: 4px; align-items: center; }
.saif-typing span { width: 7px; height: 7px; border-radius: 50%; background: #c4c4bd; animation: saif-bounce 1.1s infinite ease-in-out; }
.saif-typing span:nth-child(2) { animation-delay: 0.15s; }
.saif-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes saif-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-4px); opacity: 1; } }

/* attach panel */
.saif-attach-panel { margin-top: 12px; background: #f6f5f0; border: 1.5px solid #d1cec4; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.saif-attach-label { font-size: 13px; font-weight: 600; color: #55555c; }
.saif-attach-input { width: 100%; box-sizing: border-box; border: 1.5px solid #cfcfc9; border-radius: 8px; padding: 10px 12px; font-family: inherit; font-size: 13.5px; line-height: 1.5; resize: vertical; background: #fff; color: #1a1a1a; }
.saif-attach-input:focus { outline: none; border-color: #5b66cc; }
.saif-attach-row { display: flex; align-items: center; gap: 12px; }
.saif-btn { padding: 9px 15px; border-radius: 20px; border: 1.5px solid #5b66cc; background: #5b66cc; color: #fff; font-size: 13.5px; font-weight: 600; cursor: pointer; }
.saif-btn.primary:hover { background: #4a55bb; }

/* composer */
.saif-composer { display: flex; align-items: flex-end; gap: 10px; margin-top: 14px; }
.saif-clip { width: 44px; height: 44px; flex-shrink: 0; border: 1.5px solid #cfcfc9; border-radius: 50%; background: #fff; color: #6d6d67; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: color 0.15s, border-color 0.15s; }
.saif-clip:hover { color: #5b66cc; border-color: #5b66cc; }
.saif-clip.active { color: #5b66cc; border-color: #5b66cc; background: #eef0ff; }
.saif-composer-input { flex: 1; box-sizing: border-box; border: 1.5px solid #cfcfc9; border-radius: 22px; padding: 13px 18px; font-family: inherit; font-size: 14.5px; line-height: 1.4; resize: none; max-height: 140px; background: #fff; color: #1a1a1a; }
.saif-composer-input:focus { outline: none; border-color: #5b66cc; }
.saif-send { width: 48px; height: 48px; flex-shrink: 0; border: none; border-radius: 50%; background: #5b66cc; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s; }
.saif-send:hover:not(:disabled) { background: #4a55bb; }
.saif-send:disabled { background: #c4c4bd; cursor: not-allowed; }

.saif-foot { margin-top: 12px; text-align: center; }
.saif-link { color: #5b66cc; font-size: 13px; text-decoration: none; background: none; border: none; cursor: pointer; font-family: inherit; }
.saif-link:hover { text-decoration: underline; }
</style>
