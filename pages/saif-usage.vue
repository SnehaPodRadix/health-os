<script setup lang="ts">
/**
 * saif-usage.vue — API usage dashboard. Served at /usage.
 *
 * OWNED BY: Saif. Reads the local usage log that saif-chat.vue writes to
 * localStorage ('saif-usage-log') after every live Gemini call, and shows real
 * token counts + latency.
 *
 * NOTE: Google does NOT expose per-API-key quota/usage through the API key
 * itself (that needs Cloud Monitoring + OAuth). So these numbers are tracked
 * client-side from each response's usageMetadata — accurate for calls made in
 * THIS browser, not a billing-grade figure across all machines.
 */

definePageMeta({ alias: ['/usage'] });

// Which model powers which feature. Keep in sync with each feature file.
const SAIF_FEATURE_MODELS = [
  { feature: 'Health chat', route: '/chat', model: 'gemini-3.1-flash-lite', note: 'Server-side via GEMINI_API_KEY (set GEMINI_MODEL to override)' },
  // Add rows here as features land (e.g. report analysis, summaries).
];

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

const saifLog = ref<SaifUsageEntry[]>([]);

function saifLoad() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem('saif-usage-log');
    saifLog.value = raw ? JSON.parse(raw) : [];
  } catch {
    saifLog.value = [];
  }
}
onMounted(saifLoad);

function saifClear() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem('saif-usage-log');
  saifLog.value = [];
}

const saifStats = computed(() => {
  const all = saifLog.value;
  const ok = all.filter((e) => e.ok);
  const failed = all.filter((e) => !e.ok);
  const prompt = ok.reduce((s, e) => s + (e.promptTokens || 0), 0);
  const output = ok.reduce((s, e) => s + (e.outputTokens || 0), 0);
  const total = ok.reduce((s, e) => s + (e.totalTokens || 0), 0);
  const avgMs = ok.length ? Math.round(ok.reduce((s, e) => s + e.ms, 0) / ok.length) : 0;
  const successRate = all.length ? Math.round((ok.length / all.length) * 100) : 0;
  // group failures by reason
  const reasons: Record<string, number> = {};
  for (const f of failed) reasons[f.reason || 'error'] = (reasons[f.reason || 'error'] || 0) + 1;
  return { count: all.length, ok: ok.length, failed: failed.length, prompt, output, total, avgMs, successRate, reasons };
});

const saifRecent = computed(() => [...saifLog.value].reverse().slice(0, 20));

function saifTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
}
function saifFmt(n: number) {
  return n.toLocaleString();
}
</script>

<template>
  <main class="su-wrap">
    <header class="su-head">
      <div>
        <h1>API Usage</h1>
        <p class="su-sub">Gemini API key · tracked locally from response token counts</p>
      </div>
      <div class="su-actions">
        <button type="button" class="su-link" @click="saifLoad">Refresh</button>
        <NuxtLink to="/chat" class="su-link">← Back to chat</NuxtLink>
      </div>
    </header>

    <!-- summary cards -->
    <section class="su-cards">
      <div class="su-card">
        <span class="su-card-num">{{ saifFmt(saifStats.count) }}</span>
        <span class="su-card-label">Live requests</span>
      </div>
      <div class="su-card">
        <span class="su-card-num">{{ saifStats.successRate }}%</span>
        <span class="su-card-label">Success rate</span>
      </div>
      <div class="su-card">
        <span class="su-card-num">{{ saifFmt(saifStats.total) }}</span>
        <span class="su-card-label">Total tokens</span>
      </div>
      <div class="su-card">
        <span class="su-card-num">{{ saifStats.avgMs ? (saifStats.avgMs / 1000).toFixed(1) + 's' : '—' }}</span>
        <span class="su-card-label">Avg latency</span>
      </div>
    </section>

    <!-- models per feature -->
    <section class="su-block">
      <h2>Models by feature</h2>
      <table class="su-table">
        <thead>
          <tr><th>Feature</th><th>Route</th><th>Model</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr v-for="f in SAIF_FEATURE_MODELS" :key="f.route">
            <td>{{ f.feature }}</td>
            <td><code>{{ f.route }}</code></td>
            <td><span class="su-model">{{ f.model }}</span></td>
            <td class="su-muted">{{ f.note }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- token breakdown -->
    <section class="su-block">
      <h2>Token breakdown</h2>
      <div class="su-breakdown">
        <div><span class="su-muted">Prompt (input)</span><strong>{{ saifFmt(saifStats.prompt) }}</strong></div>
        <div><span class="su-muted">Output (reply)</span><strong>{{ saifFmt(saifStats.output) }}</strong></div>
        <div><span class="su-muted">Total</span><strong>{{ saifFmt(saifStats.total) }}</strong></div>
      </div>
      <div v-if="saifStats.failed" class="su-fail">
        {{ saifStats.failed }} failed call(s):
        <span v-for="(n, r) in saifStats.reasons" :key="r" class="su-tag">{{ r }} × {{ n }}</span>
        <span class="su-muted"> — these fell back to demo replies.</span>
      </div>
    </section>

    <!-- recent calls -->
    <section class="su-block">
      <h2>Recent calls</h2>
      <p v-if="!saifRecent.length" class="su-empty">
        No calls yet. Head to <NuxtLink to="/chat" class="su-link">/chat</NuxtLink> and send a message.
      </p>
      <table v-else class="su-table">
        <thead>
          <tr><th>Time</th><th>Status</th><th>Prompt</th><th>Output</th><th>Total</th><th>Latency</th></tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in saifRecent" :key="i">
            <td>{{ saifTime(e.ts) }}</td>
            <td>
              <span :class="['su-status', e.ok ? 'ok' : 'bad']">{{ e.ok ? 'ok' : (e.reason || 'error') }}</span>
            </td>
            <td>{{ e.ok ? saifFmt(e.promptTokens || 0) : '—' }}</td>
            <td>{{ e.ok ? saifFmt(e.outputTokens || 0) : '—' }}</td>
            <td>{{ e.ok ? saifFmt(e.totalTokens || 0) : '—' }}</td>
            <td>{{ (e.ms / 1000).toFixed(1) }}s</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="su-foot">
      <button type="button" class="su-danger" @click="saifClear">Clear usage data</button>
      <p class="su-muted su-note">
        Tracked in this browser only. Google doesn't expose per-key usage via the API key, so this
        is computed from each reply's token metadata — not an official billing figure.
      </p>
    </footer>
  </main>
</template>

<style scoped>
.su-wrap { max-width: 820px; margin: 40px auto; padding: 0 20px 60px; font-family: system-ui, sans-serif; color: #1a1a1a; }
.su-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
.su-head h1 { font-size: 22px; margin: 0; }
.su-sub { font-size: 13px; color: #a8a8a2; margin: 3px 0 0; }
.su-actions { display: flex; gap: 14px; align-items: center; white-space: nowrap; }

.su-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 26px; }
.su-card { background: #f6f5f0; border: 1.5px solid #e6e4dd; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.su-card-num { font-size: 24px; font-weight: 700; color: #3a3f66; }
.su-card-label { font-size: 12px; color: #7a7a7a; }

.su-block { margin-bottom: 26px; }
.su-block h2 { font-size: 14px; color: #55555c; margin: 0 0 10px; }

.su-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.su-table th { text-align: left; font-weight: 600; color: #9a9a94; padding: 6px 10px; border-bottom: 1.5px solid #e6e4dd; font-size: 12px; }
.su-table td { padding: 8px 10px; border-bottom: 1px solid #f0efe9; color: #3a3a42; }
.su-table code { background: #f2f1ec; padding: 1px 6px; border-radius: 5px; font-size: 12px; }
.su-model { font-weight: 600; color: #5b66cc; background: #eef0ff; border: 1px solid #d7dbf7; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.su-muted { color: #9a9a94; }

.su-breakdown { display: flex; gap: 28px; flex-wrap: wrap; background: #fbfbf9; border: 1.5px solid #eceae3; border-radius: 12px; padding: 16px 20px; }
.su-breakdown div { display: flex; flex-direction: column; gap: 3px; }
.su-breakdown strong { font-size: 20px; color: #3a3f66; }
.su-breakdown .su-muted { font-size: 12px; }

.su-fail { margin-top: 12px; font-size: 13px; color: #9a6a2f; }
.su-tag { display: inline-block; background: #fbf3e6; border: 1px solid #ecd9bf; border-radius: 6px; padding: 1px 7px; margin: 0 4px; font-size: 12px; }

.su-status { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.su-status.ok { color: #2f7a4d; background: #eefaf1; }
.su-status.bad { color: #9a6a2f; background: #fbf3e6; }

.su-empty { font-size: 13px; color: #7a7a7a; }
.su-foot { margin-top: 30px; border-top: 1px solid #eceae3; padding-top: 18px; }
.su-danger { padding: 8px 14px; border: 1.5px solid #d1cec4; border-radius: 8px; background: #fff; color: #8b4a4a; font-size: 13px; font-weight: 600; cursor: pointer; }
.su-danger:hover { border-color: #8b4a4a; }
.su-note { margin: 12px 0 0; font-size: 12px; line-height: 1.5; max-width: 620px; }

.su-link { color: #5b66cc; font-size: 13px; text-decoration: none; background: none; border: none; cursor: pointer; font-family: inherit; }
.su-link:hover { text-decoration: underline; }

@media (max-width: 620px) {
  .su-cards { grid-template-columns: repeat(2, 1fr); }
}
</style>
