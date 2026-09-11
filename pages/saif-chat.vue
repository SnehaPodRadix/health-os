<script setup lang="ts">
/**
 * saif-chat.vue — Health chat (Gemini) + offline demo fallback. Served at /chat.
 *
 * OWNED BY: Saif. Self-contained so it doesn't collide with other work in
 * progress. Everything is namespaced with `saif` (state key, action fns).
 *
 * This is ONLY the chat. The health report is uploaded by a separate feature;
 * when we merge, that feature just sets `saifState.value.report` and the chat
 * automatically passes it to Gemini as context (via /api/saif-chat).
 *
 * The Gemini call runs server-side (POST /api/saif-chat) using the shared secret
 * key (GEMINI_API_KEY), so the key is never exposed to the browser. If that call
 * fails / times out / has no key, we fall back to a canned "Demo mode" so a live
 * demo never breaks.
 */

// Served at /chat (file stays saif-prefixed to avoid clashing with the other dev).
definePageMeta({ alias: ['/chat'] });

// ---- config -----------------------------------------------------------------
// Snappy mode: the demo key can queue 20-50s, so wait only briefly for a real
// answer, then fall back to the instant demo reply. Raise this once a fast key
// is in place if you'd rather always wait for the live response.
const SAIF_GEMINI_TIMEOUT_MS = 7000;

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
  mode: 'live', // optimistic; flips to 'demo' if the server call fails
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

  // Always try live via the server route — don't stay stuck in demo. The mode
  // badge reflects the LAST attempt, so a single good reply flips it back to live.
  try {
    reply = await saifCallGemini();
    saifState.value.mode = 'live';
    usedDemo = false;
  } catch (err) {
    // Timeout / quota (429) / no key / network → demo reply for THIS message.
    console.warn('[saif-chat] chat API failed, using demo reply:', err);
    saifState.value.mode = 'demo';
    usedDemo = true;
    reply = saifDummyReply(text);
  }

  saifState.value.messages.push({ role: 'assistant', text: reply, demo: usedDemo });
  saifState.value.sending = false;
  saifScrollToBottom();
}

function saifRetryLive() {
  saifState.value.mode = 'live';
}

function saifResetChat() {
  saifState.value.messages = [];
  saifState.value.mode = 'live';
  saifState.value.messages.push({
    role: 'assistant',
    text: "Hi! I'm your Health OS assistant. Ask me anything about your health or your reports. I'm an AI guide, not a substitute for your doctor.",
    demo: false,
  });
}

// ---- Gemini call (via server route, key stays server-side) ------------------
interface SaifChatResponse {
  text: string;
  model: string;
  usage: { promptTokens: number; outputTokens: number; totalTokens: number };
}

async function saifCallGemini(): Promise<string> {
  const t0 = Date.now();
  try {
    const res = await $fetch<SaifChatResponse>('/api/saif-chat', {
      method: 'POST',
      timeout: SAIF_GEMINI_TIMEOUT_MS, // aborts slow calls → demo fallback
      body: {
        messages: saifState.value.messages.map((m) => ({ role: m.role, text: m.text })),
        report: saifState.value.report,
      },
    });
    saifRecordUsage({
      ms: Date.now() - t0,
      ok: true,
      model: res.model,
      promptTokens: res.usage?.promptTokens || 0,
      outputTokens: res.usage?.outputTokens || 0,
      totalTokens: res.usage?.totalTokens || 0,
    });
    if (!res.text) throw new Error('empty');
    return res.text;
  } catch (e) {
    const err = e as { name?: string; statusCode?: number; message?: string };
    const reason =
      err?.name === 'AbortError' || /timeout|aborted/i.test(err?.message || '')
        ? 'timeout'
        : err?.statusCode
          ? `http-${err.statusCode}`
          : 'network';
    saifRecordUsage({ ms: Date.now() - t0, ok: false, reason });
    throw e;
  }
}

// Log one live API call to localStorage so /usage can show real numbers.
// (Google doesn't expose per-key usage via the API key, so we track it here.)
interface SaifUsageEntry {
  ts: number;
  model?: string;
  ms: number;
  ok: boolean;
  reason?: string;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
function saifRecordUsage(partial: Omit<SaifUsageEntry, 'ts'>) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem('saif-usage-log');
    const arr: SaifUsageEntry[] = raw ? JSON.parse(raw) : [];
    arr.push({ ts: Date.now(), ...partial });
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
  <AppTopbar crumb="Chat" />

  <div class="chat-note-row">
    <span class="note-text">Answers are AI-guided · not a substitute for professional care.</span>
    <span class="chat-mode" :class="saifState.mode">
      <span class="dot" />{{ saifState.mode === 'live' ? 'Live · Gemini' : 'Demo mode' }}
    </span>
  </div>

  <div class="chat-body">
    <div v-if="saifState.mode === 'demo'" class="chat-demo-banner">
      <span>⚠️ Live AI is unavailable (quota or error) — showing pre-defined demo replies.</span>
      <button type="button" class="link-btn" @click="saifRetryLive">try live again</button>
    </div>

    <div ref="saifScroller" class="chat-messages">
      <div
        v-for="(m, i) in saifState.messages"
        :key="i"
        class="chat-turn"
        :class="m.role === 'user' ? 'user' : 'ai'"
      >
        <div class="chat-msg">
          <div class="bubble" :class="m.role === 'user' ? 'user' : 'ai'">{{ m.text }}</div>
          <span v-if="m.demo && m.role === 'assistant'" class="demo-tag">demo reply</span>
        </div>
      </div>
      <div v-if="saifState.sending" class="chat-turn ai">
        <div class="chat-msg">
          <div class="bubble ai typing"><span /><span /><span /></div>
        </div>
      </div>
    </div>

    <!-- paste-report panel (opened by the clip) -->
    <div v-if="saifShowAttach" class="attach-panel">
      <label class="attach-label">Paste your health report</label>
      <textarea
        v-model="saifReportDraft"
        class="attach-input"
        rows="5"
        placeholder="Paste lab results or a report here — I'll use it as context."
      ></textarea>
      <div class="attach-row">
        <button type="button" class="btn mint small" @click="saifAttachReport">Attach report</button>
        <button type="button" class="link-btn" @click="saifShowAttach = false">Cancel</button>
      </div>
    </div>

    <div v-if="saifHasReport" class="report-attached">
      <span class="ref-chip">Report attached · {{ saifState.report.length }} chars</span>
      <button type="button" class="link-btn" @click="saifClearReport">remove</button>
    </div>

    <div class="chat-composer">
      <button
        type="button"
        class="mic-btn"
        :class="{ recording: saifHasReport }"
        aria-label="Attach health report"
        title="Paste a health report"
        @click="saifToggleAttach"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
        </svg>
      </button>
      <textarea
        v-model="saifDraft"
        class="input"
        rows="1"
        placeholder="Ask about your health…"
        @keydown="saifOnComposerKey"
      ></textarea>
      <button
        type="button"
        class="send"
        :disabled="!saifDraft.trim() || saifState.sending"
        aria-label="Send"
        @click="saifSend"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M2 8l12-5-4 12-2-5z" /></svg>
      </button>
    </div>
    <div class="composer-hint">
      Attach a report with the clip · replies fall back to a demo when the API is unavailable ·
      <button type="button" class="link-btn" @click="saifResetChat">clear chat</button>
    </div>
  </div>
</template>

<style scoped>
/* full-height chat that fills the shell (overrides sage.css fixed 720px) */
.chat-body { height: auto; flex: 1; min-height: 0; }

/* note row under the top bar */
.chat-note-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 32px; border-bottom: 1px solid var(--sage-soft);
  font-family: 'Geist', system-ui; font-size: 12px; color: var(--ink-3);
}
.chat-mode {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: var(--r-pill);
  letter-spacing: 0.01em;
}
.chat-mode .dot { width: 7px; height: 7px; border-radius: 50%; }
.chat-mode.live { color: var(--forest); background: var(--mint-soft); }
.chat-mode.live .dot { background: #2f9d63; }
.chat-mode.demo { color: var(--warn); background: var(--warn-soft); }
.chat-mode.demo .dot { background: #c98a1f; }

/* demo banner */
.chat-demo-banner {
  max-width: 820px; width: 100%; margin: 16px auto 0; padding: 0 48px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 12.5px; color: var(--warn);
}

/* demo tag under a bubble */
.demo-tag {
  font-family: 'Geist', system-ui; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em; color: var(--warn);
  background: var(--warn-soft); border-radius: 5px; padding: 1px 7px; align-self: flex-start;
}

/* typing dots */
.bubble.typing { display: inline-flex; gap: 4px; align-items: center; }
.bubble.typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--sage); animation: chat-bounce 1.1s infinite ease-in-out; }
.bubble.typing span:nth-child(2) { animation-delay: 0.15s; }
.bubble.typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes chat-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-4px); opacity: 1; } }

/* preserve line breaks in replies */
.bubble { white-space: pre-wrap; word-break: break-word; }

/* real textarea styled like SAGE .input */
.chat-composer textarea.input {
  display: block; height: 46px; min-height: 46px; max-height: 130px;
  padding: 12px 16px; line-height: 1.4; resize: none;
  font-family: 'Geist', system-ui; color: var(--ink);
}
.chat-composer textarea.input:focus { outline: none; border-color: var(--forest); }
.chat-composer .mic-btn.recording { background: var(--mint); border-color: var(--forest); }
.chat-composer .send:disabled { background: var(--sage-soft); color: var(--ink-4); cursor: not-allowed; }

/* report attached row */
.report-attached {
  max-width: 820px; width: 100%; margin: 10px auto 0; padding: 0 48px;
  display: flex; align-items: center; gap: 10px;
}
.ref-chip {
  display: inline-flex; align-items: center; padding: 4px 10px;
  background: var(--mint-quiet); border: 1px solid rgba(164,255,207,0.4);
  border-radius: var(--r-pill); font-size: 11.5px; font-weight: 500; color: var(--forest);
}

/* paste-report panel */
.attach-panel {
  max-width: 820px; width: 100%; margin: 12px auto 0; padding: 14px 48px 0;
  display: flex; flex-direction: column; gap: 10px;
}
.attach-label { font-family: 'Geist', system-ui; font-size: 12px; font-weight: 500; color: var(--ink-3); }
.attach-input {
  width: 100%; box-sizing: border-box; border: 1px solid var(--sage-line);
  border-radius: var(--r); padding: 10px 12px; font-family: 'Geist', system-ui;
  font-size: 13.5px; line-height: 1.5; resize: vertical; background: var(--white); color: var(--ink);
}
.attach-input:focus { outline: none; border-color: var(--forest); }
.attach-row { display: flex; align-items: center; gap: 12px; }

/* small link button */
.link-btn { background: none; border: none; padding: 0; cursor: pointer; font: inherit; font-size: 12px; font-weight: 500; color: var(--forest); text-decoration: underline; }
.link-btn:hover { color: var(--ink); }

/* mobile: tighten the 48px side padding */
@media (max-width: 860px) {
  .chat-note-row { padding: 12px 16px; }
  .chat-messages { padding: 24px 16px; }
  .chat-composer { padding: 14px 16px 16px; }
  .composer-hint, .chat-demo-banner, .report-attached, .attach-panel { padding-left: 16px; padding-right: 16px; }
}
</style>
