<script setup lang="ts">
/**
 * saif-chat.vue — Sage, the Health OS chat. Served at /chat.
 *
 * OWNED BY: Saif. Namespaced with `saif` so it doesn't collide with other work.
 *
 * What it does:
 *  - CONTEXT: automatically reads the user's saved medical records (useRecords)
 *    and passes them to Gemini, so Sage answers grounded in the real reports.
 *    A manually pasted report (clip button) is added on top as extra context.
 *  - VOICE: a mic button uses the browser Speech API to transcribe speech into
 *    the input box. It only fills the box — the user still presses Send.
 *  - GUARDRAILS: a standing Sage disclaimer, plus deterministic intercepts for
 *    emergencies and requests for diagnosis/prescriptions (no API call needed).
 *
 * The Gemini call runs server-side (POST /api/saif-chat) with the shared secret
 * key, and falls back to a canned "Demo mode" reply if it fails/times out.
 */

// Served at /chat (file stays saif-prefixed to avoid clashing with the other dev).
definePageMeta({ alias: ['/chat'] });

// ---- config -----------------------------------------------------------------
// Snappy mode: wait only briefly for a real answer, then fall back to the demo.
const SAIF_GEMINI_TIMEOUT_MS = 7000;

// The exact Sage guardrail line — shown as the standing disclaimer AND as the
// reply when someone asks Sage to diagnose or prescribe.
const SAIF_SAGE_DISCLAIMER =
  'Sage reads your medical records and gives you what matters, when it matters. Sage is not a medical practitioner and is not authorized to dispense medical advice.';

const SAIF_EMERGENCY_MSG =
  'This sounds like it may be urgent. Please contact your local emergency services or go to the nearest emergency room right now. Sage can’t help with medical emergencies.';

// ---- types ------------------------------------------------------------------
type SaifRole = 'user' | 'assistant';
type SaifKind = 'normal' | 'guard' | 'emergency';
interface SaifMessage {
  role: SaifRole;
  text: string;
  demo?: boolean; // reply came from the offline fallback
  kind?: SaifKind; // guardrail styling
  uiLang?: string; // language the reader picked for this reply (label)
  uiTx?: Record<string, string>; // cached translations per language label
}
interface SaifChatState {
  messages: SaifMessage[];
  mode: 'live' | 'demo';
  sending: boolean;
}

// ---- state (namespaced so it won't clash with the other dev's state) --------
const saifState = useState<SaifChatState>('saif-chat-state', () => ({
  messages: [],
  mode: 'live',
  sending: false,
}));

const saifDraft = ref('');
const saifScroller = ref<HTMLElement | null>(null);

// ---- medical-records context (Sneha's upload feature feeds this) ------------
const { records } = useRecords();
const saifRecordCount = computed(() => (records.value || []).length);

// Compact, token-friendly view of every saved record: title, date, summary,
// and each finding with its flag. Full OCR text is only used when a record has
// no structured findings.
const saifRecordsContext = computed(() => {
  const recs = records.value || [];
  if (!recs.length) return '';
  const blocks = recs.slice(0, 25).map((r) => {
    const head = [r.title || r.type || 'Record', r.date ? `(${r.date})` : '', r.category ? `· ${r.category}` : '']
      .filter(Boolean)
      .join(' ');
    const lines = [`# ${head}`];
    if (r.summary) lines.push(r.summary);
    if (r.orderedBy) lines.push(`Ordered by: ${r.orderedBy}${r.doctorRole ? ` (${r.doctorRole})` : ''}`);
    if (r.findings?.length) {
      for (const f of r.findings) {
        const flag = f.flag && f.flag !== 'normal' ? ` [${f.flag.toUpperCase()}]` : '';
        lines.push(`- ${f.name}: ${f.value}${flag}${f.explanation ? ` — ${f.explanation}` : ''}`);
      }
    } else if (r.text) {
      lines.push(r.text.slice(0, 400));
    }
    return lines.join('\n');
  });
  let out = blocks.join('\n\n');
  if (out.length > 7000) out = `${out.slice(0, 7000)}\n…(truncated)`;
  return out;
});

// The user's saved medical records are the chat's context.
const saifContext = computed(() => saifRecordsContext.value);

// Seed a greeting on first load.
const SAIF_GREETING =
  'Hi, I’m Sage. I read your medical records and help you understand what matters. Ask me about any result and I’ll point you to the exact number and what it means. I’m not a doctor and can’t give medical advice.';
if (saifState.value.messages.length === 0) {
  saifState.value.messages.push({ role: 'assistant', text: SAIF_GREETING });
}

// ---- guardrails -------------------------------------------------------------
// Deterministic, client-side checks that run BEFORE any API call so the guard
// message is instant and never depends on the model.
const SAIF_GUARD_EMERGENCY =
  /\b(chest pain|can'?t breathe|cannot breathe|trouble breathing|difficulty breathing|heart attack|stroke|suicid|kill myself|end my life|overdos|unconscious|passed out|severe bleeding|bleeding heavily)\b/i;
const SAIF_GUARD_ADVICE =
  /\b(diagnos(e|is|ed)?|prescrib(e|ing|tion)?|what (medicine|medication|drug|dose|dosage|pills?) (should|do|can)|(should|can) i (take|stop|start|change|increase|lower) (my |the |a )?(med|medicine|medication|drug|dose|pill|tablet|supplement|treatment|dosage))\b/i;

// ---- actions ----------------------------------------------------------------
async function saifSend() {
  const text = saifDraft.value.trim();
  if (!text || saifState.value.sending) return;

  if (saifListening.value) saifStopMic(); // don't keep the mic hot after send

  saifState.value.messages.push({ role: 'user', text });
  saifDraft.value = '';
  saifScrollToBottom();

  // Guardrails first — instant, no network.
  if (SAIF_GUARD_EMERGENCY.test(text)) {
    saifState.value.messages.push({ role: 'assistant', kind: 'emergency', text: SAIF_EMERGENCY_MSG });
    saifScrollToBottom();
    return;
  }
  if (SAIF_GUARD_ADVICE.test(text)) {
    saifState.value.messages.push({ role: 'assistant', kind: 'guard', text: SAIF_SAGE_DISCLAIMER });
    saifScrollToBottom();
    return;
  }

  saifState.value.sending = true;
  saifScrollToBottom();

  let reply: string;
  let usedDemo: boolean;

  // Always try live via the server route. The mode badge reflects the LAST
  // attempt, so a single good reply flips it back to live.
  try {
    reply = await saifCallGemini();
    saifState.value.mode = 'live';
    usedDemo = false;
  } catch (err) {
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
  saifState.value.messages.push({ role: 'assistant', text: SAIF_GREETING });
}

// ---- voice input (browser Speech API → fills the box, never auto-sends) ------
const saifMicSupported = ref(false);
const saifListening = ref(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let saifRecognition: any = null;
let saifMicBase = ''; // text already in the box when recording started

onMounted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return; // Safari/Firefox without support → mic button hidden
  saifMicSupported.value = true;
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onresult = (e: any) => {
    let finalText = '';
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    if (finalText) saifMicBase = `${saifMicBase} ${finalText}`.trim();
    saifDraft.value = `${saifMicBase} ${interim}`.trim();
  };
  rec.onend = () => {
    saifListening.value = false;
  };
  rec.onerror = () => {
    saifListening.value = false;
  };
  saifRecognition = rec;
});

onBeforeUnmount(() => {
  try {
    saifRecognition?.stop();
  } catch {
    /* ignore */
  }
});

function saifStopMic() {
  if (!saifRecognition) return;
  try {
    saifRecognition.stop();
  } catch {
    /* ignore */
  }
  saifListening.value = false;
}
function saifToggleMic() {
  if (!saifRecognition) return;
  if (saifListening.value) {
    saifStopMic();
    return;
  }
  saifMicBase = saifDraft.value.trim();
  try {
    saifRecognition.start();
    saifListening.value = true;
  } catch {
    // start() throws if it's already running — just reflect the state.
    saifListening.value = true;
  }
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
      timeout: SAIF_GEMINI_TIMEOUT_MS,
      body: {
        messages: saifState.value.messages.map((m) => ({ role: m.role, text: m.text })),
        report: saifContext.value,
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
const SAIF_DEMO_RULES: { match: RegExp; reply: string }[] = [
  {
    match: /\b(hi|hello|hey|start|begin)\b/i,
    reply:
      "Hi! I'm Sage. I can walk you through your report, explain what the numbers mean, and flag anything worth a closer look. What would you like to start with? (Demo response.)",
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

// ---- language transcription + read-aloud (chatbot output) -------------------
// Each AI reply can be translated (shown in the bubble) and read aloud in the
// chosen language. Translation runs via /api/translate (Gemini); speech uses the
// browser's SpeechSynthesis.
const SAIF_LANGS = [
  { label: 'English', en: 'English', code: 'en-US' },
  { label: 'हिन्दी (Hindi)', en: 'Hindi', code: 'hi-IN' },
  { label: 'मराठी (Marathi)', en: 'Marathi', code: 'mr-IN' },
  { label: 'தமிழ் (Tamil)', en: 'Tamil', code: 'ta-IN' },
];
const saifOpenMenu = ref<number | null>(null);
const saifPlaying = ref<number | null>(null);
const saifTranslating = ref<number | null>(null);
const saifTtsSupported = ref(false);
onMounted(() => {
  saifTtsSupported.value = typeof window !== 'undefined' && 'speechSynthesis' in window;
});
onBeforeUnmount(() => saifStopSpeaking());

function saifLangLabel(m: SaifMessage) {
  return m.uiLang || 'English';
}
function saifDisplayText(m: SaifMessage) {
  const l = m.uiLang;
  return l && l !== 'English' && m.uiTx?.[l] ? m.uiTx[l] : m.text;
}
function saifToggleMenu(i: number) {
  saifOpenMenu.value = saifOpenMenu.value === i ? null : i;
}

async function saifPickLang(m: SaifMessage, i: number, lang: (typeof SAIF_LANGS)[number]) {
  saifOpenMenu.value = null;
  if (saifPlaying.value === i) saifStopSpeaking();

  if (lang.label !== 'English' && !m.uiTx?.[lang.label]) {
    saifTranslating.value = i;
    try {
      const res = await $fetch<{ text: string }>('/api/translate', {
        method: 'POST',
        body: { text: m.text, target: lang.en },
      });
      m.uiTx = { ...(m.uiTx || {}), [lang.label]: res.text || m.text };
    } catch {
      m.uiTx = { ...(m.uiTx || {}), [lang.label]: m.text }; // fall back to original
    } finally {
      saifTranslating.value = null;
    }
  }
  m.uiLang = lang.label;
  saifScrollToBottom();
}

function saifStopSpeaking() {
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  saifPlaying.value = null;
}

function saifListen(m: SaifMessage, i: number) {
  if (!saifTtsSupported.value) return;
  if (saifPlaying.value === i) {
    saifStopSpeaking();
    return;
  }
  saifStopSpeaking();
  const lang = SAIF_LANGS.find((l) => l.label === saifLangLabel(m)) ?? SAIF_LANGS[0];
  const u = new SpeechSynthesisUtterance(saifDisplayText(m));
  u.lang = lang.code;
  u.onend = () => {
    if (saifPlaying.value === i) saifPlaying.value = null;
  };
  u.onerror = () => {
    if (saifPlaying.value === i) saifPlaying.value = null;
  };
  saifPlaying.value = i;
  window.speechSynthesis.speak(u);
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
    <span class="note-text">
      <template v-if="saifRecordCount">
        Grounded in {{ saifRecordCount }} saved record{{ saifRecordCount === 1 ? '' : 's' }} ·
        <NuxtLink to="/records" class="note-link">manage</NuxtLink>
      </template>
      <template v-else>
        No records yet · <NuxtLink to="/records" class="note-link">add one</NuxtLink> so Sage can use them
      </template>
    </span>
    <span class="chat-mode" :class="saifState.mode">
      <span class="dot" />{{ saifState.mode === 'live' ? 'Live · Gemini' : 'Demo mode' }}
    </span>
  </div>

  <!-- standing guardrail / disclaimer -->
  <div class="sage-guard">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
    <span>{{ SAIF_SAGE_DISCLAIMER }}</span>
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
          <div
            class="bubble"
            :class="[m.role === 'user' ? 'user' : 'ai', m.kind === 'guard' ? 'guard' : '', m.kind === 'emergency' ? 'emergency' : '']"
          >{{ saifDisplayText(m) }}</div>
          <span v-if="m.demo && m.role === 'assistant'" class="demo-tag">demo reply</span>
          <span v-else-if="m.kind === 'guard'" class="guard-tag">guardrail</span>
          <span v-else-if="m.kind === 'emergency'" class="emergency-tag">safety</span>

          <!-- read this reply aloud / in another language -->
          <div v-if="m.role === 'assistant'" class="listen-menu-wrap">
            <button
              type="button"
              class="listen-btn"
              :class="{ playing: saifPlaying === i }"
              :aria-label="saifPlaying === i ? 'Stop playback' : 'Play this message aloud'"
              @click="saifListen(m, i)"
            >
              <span class="play">
                <svg v-if="saifPlaying === i" viewBox="0 0 12 12" width="9" height="9" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="2.5" height="8" /><rect x="6.5" y="2" width="2.5" height="8" /></svg>
                <svg v-else viewBox="0 0 12 12" width="9" height="9" fill="currentColor" aria-hidden="true"><path d="M3 2l7 4-7 4z" /></svg>
              </span>
              <span class="label">{{ saifTranslating === i ? 'Translating…' : saifPlaying === i ? 'Playing…' : 'Listen' }}</span>
              <span class="lang-pick" role="button" tabindex="0" @click.stop="saifToggleMenu(i)" @keydown.enter.stop="saifToggleMenu(i)">
                {{ saifLangLabel(m) }} <span class="caret">▾</span>
              </span>
            </button>
            <div v-if="saifOpenMenu === i" class="listen-menu">
              <div class="head">Hear it in</div>
              <div
                v-for="l in SAIF_LANGS"
                :key="l.label"
                class="opt"
                :class="{ on: saifLangLabel(m) === l.label }"
                @click="saifPickLang(m, i, l)"
              >
                <span>{{ l.label }}</span>
                <span v-if="saifLangLabel(m) === l.label" class="check">✓</span>
              </div>
              <div class="foot">Voice is spoken by Sage. Not the doctor.</div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="saifState.sending" class="chat-turn ai">
        <div class="chat-msg">
          <div class="bubble ai typing"><span /><span /><span /></div>
        </div>
      </div>
    </div>

    <div class="chat-composer">
      <textarea
        v-model="saifDraft"
        class="input"
        rows="1"
        :placeholder="saifListening ? 'Listening… speak now' : 'Ask about your health…'"
        @keydown="saifOnComposerKey"
      ></textarea>
      <button
        v-if="saifMicSupported"
        type="button"
        class="mic-btn voice"
        :class="{ 'mic-live': saifListening }"
        :aria-label="saifListening ? 'Stop voice input' : 'Start voice input'"
        :title="saifListening ? 'Stop dictating' : 'Dictate your message'"
        @click="saifToggleMic"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
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
      <template v-if="saifMicSupported">Tap the mic to dictate · </template>replies fall back to a demo when the API is unavailable ·
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
.note-link { color: var(--forest); font-weight: 500; text-decoration: underline; }
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

/* standing guardrail / disclaimer */
.sage-guard {
  display: flex; align-items: flex-start; gap: 9px;
  margin: 14px 32px 0; padding: 10px 14px;
  background: var(--mint-quiet); border: 1px solid rgba(164, 255, 207, 0.5);
  border-radius: var(--r); color: var(--forest);
  font-family: 'Geist', system-ui; font-size: 12px; line-height: 1.5;
}
.sage-guard svg { flex-shrink: 0; margin-top: 1px; opacity: 0.85; }

/* demo banner */
.chat-demo-banner {
  max-width: 820px; width: 100%; margin: 16px auto 0; padding: 0 48px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 12.5px; color: var(--warn);
}

/* tags under a bubble */
.demo-tag, .guard-tag, .emergency-tag {
  font-family: 'Geist', system-ui; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  border-radius: 5px; padding: 1px 7px; align-self: flex-start;
}
.demo-tag { color: var(--warn); background: var(--warn-soft); }
.guard-tag { color: var(--forest); background: var(--mint-soft); }
.emergency-tag { color: #b42318; background: #fee4e2; }

/* guardrail + emergency bubbles */
.bubble.guard { background: var(--mint-quiet); border: 1px solid rgba(164, 255, 207, 0.55); color: var(--forest); }
.bubble.emergency { background: #fef3f2; border: 1px solid #fecdca; color: #b42318; }

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
.chat-composer .send:disabled { background: var(--sage-soft); color: var(--ink-4); cursor: not-allowed; }

/* voice mic: live = pulsing red */
.chat-composer .mic-btn.voice.mic-live {
  background: #fee4e2; border-color: #f97066; color: #b42318;
  animation: mic-pulse 1.2s infinite ease-in-out;
}
@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(240, 68, 56, 0.35); }
  50% { box-shadow: 0 0 0 6px rgba(240, 68, 56, 0); }
}

/* small link button */
.link-btn { background: none; border: none; padding: 0; cursor: pointer; font: inherit; font-size: 12px; font-weight: 500; color: var(--forest); text-decoration: underline; }
.link-btn:hover { color: var(--ink); }

/* ---- read-aloud + language pick (from sage-FINAL chat design) ---- */
.listen-menu-wrap { position: relative; align-self: flex-start; }
.listen-btn {
  display: inline-flex; align-items: stretch;
  border: 1px solid var(--sage-line); border-radius: var(--r-pill);
  background: var(--glass-light);
  font-family: 'Geist', system-ui; font-size: 11.5px; color: var(--ink-3);
  cursor: pointer; overflow: hidden; align-self: flex-start;
  transition: border-color 0.12s, color 0.12s;
}
.listen-btn:hover { border-color: var(--forest); color: var(--forest); }
.listen-btn .play { display: inline-flex; align-items: center; justify-content: center; width: 24px; background: var(--white); color: var(--forest); border-right: 1px solid var(--sage-line); }
.listen-btn:hover .play { background: var(--mint-soft); }
.listen-btn .label { padding: 0 8px; display: inline-flex; align-items: center; letter-spacing: -0.003em; }
.listen-btn .lang-pick { padding: 4px 10px 4px 6px; display: inline-flex; align-items: center; gap: 4px; border-left: 1px solid var(--sage-line); color: var(--ink); font-weight: 500; }
.listen-btn .lang-pick:hover { background: var(--white); }
.listen-btn .caret { font-size: 8px; color: var(--ink-4); }
.listen-btn.playing { border-color: var(--forest); color: var(--forest); background: var(--mint-quiet); }
.listen-btn.playing .play { background: var(--forest); color: var(--mint); border-right-color: var(--forest); }
.listen-menu {
  position: absolute; top: calc(100% + 8px); left: 0; min-width: 210px;
  background: var(--white); border: 1px solid var(--sage-line); border-radius: var(--r);
  box-shadow: 0 8px 32px rgba(20,30,20,0.10); padding: 6px; z-index: 20;
}
.listen-menu .head { font-family: 'Geist', system-ui; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); font-weight: 500; padding: 8px 10px 6px; }
.listen-menu .opt { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 4px; font-size: 13px; color: var(--ink); cursor: pointer; }
.listen-menu .opt:hover { background: var(--off-white); }
.listen-menu .opt.on { color: var(--forest); font-weight: 600; background: var(--mint-quiet); }
.listen-menu .opt .check { color: var(--forest); font-size: 13px; }
.listen-menu .foot { padding: 10px 10px 4px; font-size: 11.5px; color: var(--ink-3); border-top: 1px solid var(--sage-soft); margin-top: 6px; line-height: 1.45; }

/* mobile: tighten the 48px side padding */
@media (max-width: 860px) {
  .chat-note-row { padding: 12px 16px; }
  .sage-guard { margin: 12px 16px 0; }
  .chat-messages { padding: 24px 16px; }
  .chat-composer { padding: 14px 16px 16px; }
  .composer-hint, .chat-demo-banner { padding-left: 16px; padding-right: 16px; }
}
</style>
