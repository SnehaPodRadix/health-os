<script setup lang="ts">
import type { HealthRecord } from '~/composables/useRecords';

useHead({ title: 'Home · Health OS' });

const { records } = useRecords();
const showAdd = ref(false);
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function onSaved() {
  showAdd.value = false;
  toast.value = 'Saved to your records';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2400);
}

// --- greeting ---
const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
});

// --- record helpers ---
function recDate(r: HealthRecord): Date {
  const d = r.dateISO ? new Date(r.dateISO) : new Date(r.createdAt);
  return Number.isNaN(d.getTime()) ? new Date(r.createdAt) : d;
}
function dayLabel(r: HealthRecord) {
  return recDate(r).toLocaleString('en-US', { month: 'short', day: '2-digit' });
}
function catLabel(r: HealthRecord) {
  const t = `${r.type} ${r.title}`.toLowerCase();
  if (/prescription|\brx\b|tablet|\bmg\b/.test(t)) return 'Rx';
  if (/scan|x-?ray|mri|\bct\b|ultrasound|imaging/.test(t)) return 'Scan';
  if (/lab|blood|cbc|panel|\btest\b|report/.test(t)) return 'Lab';
  if (/visit|check-?up|consult/.test(t)) return 'Visit';
  if (r.category === 'Mental') return 'Mental';
  if (r.category === 'Lifestyle') return 'Lifestyle';
  return r.category || 'Note';
}

const sorted = computed(() =>
  [...records.value].sort((a, b) => recDate(b).getTime() - recDate(a).getTime()),
);
const recent = computed(() => sorted.value.slice(0, 5));
const yearsSpan = computed(() => {
  if (!records.value.length) return '';
  const ys = records.value.map((r) => recDate(r).getFullYear());
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  return min === max ? `${min}` : `${min}–${max}`;
});

// derived "worth noting": most recent flagged finding
const note = computed(() => {
  for (const r of sorted.value) {
    const f = (r.findings ?? []).find((x) => ['low', 'high'].includes((x.flag || '').toLowerCase()));
    if (f) return `${f.name} was ${f.flag} in your ${catLabel(r).toLowerCase()} on ${dayLabel(r)}. Worth keeping an eye on.`;
  }
  return '';
});
</script>

<template>
  <AppTopbar crumb="Home" />

  <!-- ===================== POPULATED HOME ===================== -->
  <div v-if="records.length" class="pbody">
    <div class="home-header">
      <div>
        <h1 class="h-hero">{{ greeting }}, <span class="italic">Priya.</span></h1>
        <p class="sub mt-8">
          {{ records.length }} record{{ records.length === 1 ? '' : 's' }}<span v-if="yearsSpan"> · {{ yearsSpan }}</span>.
        </p>
      </div>
      <button class="btn mint large" type="button" @click="showAdd = true">Add record</button>
    </div>

    <div class="home-grid">
      <!-- LEFT -->
      <div>
        <template v-if="note">
          <div class="section-head"><div class="eyebrow" style="margin:0;">Worth noting</div></div>
          <div class="today-list">
            <div class="today-item">
              <div class="when">Note</div>
              <div class="body">
                <div class="title" style="font-weight:400;color:var(--ink-2);">{{ note }}</div>
              </div>
            </div>
          </div>
          <div class="mt-48" />
        </template>

        <div class="section-head">
          <div class="eyebrow" style="margin:0;">Recent activity</div>
          <NuxtLink class="more" to="/records">See all →</NuxtLink>
        </div>
        <div class="recent-list">
          <NuxtLink v-for="r in recent" :key="r.id" class="recent-row" :to="`/records/${r.id}`">
            <div class="date">{{ dayLabel(r) }}</div>
            <div class="type">{{ catLabel(r) }}</div>
            <div class="desc">{{ r.title }}</div>
            <div class="src">{{ r.source || r.orderedBy || '' }}</div>
          </NuxtLink>
        </div>
      </div>

      <!-- RIGHT -->
      <div>
        <div class="ask-card">
          <div class="ask-title">Ask about your records</div>
          <p class="sub small mt-8" style="margin-top:4px;font-size:12.5px;">Answers pulled only from what you've added.</p>
          <NuxtLink class="ask-input" to="/chat">When did I last have a blood test?</NuxtLink>
          <div class="ask-suggestions">
            <NuxtLink class="ask-link" to="/chat">→ Explain my last lab report</NuxtLink>
            <NuxtLink class="ask-link" to="/chat">→ What are my current medications?</NuxtLink>
          </div>
        </div>

        <div class="mt-32" />
        <div class="section-head"><div class="eyebrow" style="margin:0;">Shortcuts</div></div>
        <div>
          <NuxtLink class="shortcut-btn" to="/insights">View your insights <span class="arrow">→</span></NuxtLink>
          <NuxtLink class="shortcut-btn" to="/records">Browse all records <span class="arrow">→</span></NuxtLink>
          <NuxtLink class="shortcut-btn" to="/profile">Your care team <span class="arrow">→</span></NuxtLink>
        </div>
      </div>
    </div>
  </div>

  <!-- ===================== FIRST-USE EMPTY ===================== -->
  <div v-else class="pbody pbody-narrow">
    <h1 class="h-hero">Hello, <span class="italic">Priya.</span></h1>
    <p class="sub mt-8">Let's get your health records in one place.</p>

    <div class="mt-32" />

    <div class="empty-hero">
      <h2>No records yet</h2>
      <p>
        Add your first record and we'll start building your history. One at a time
        or in batches — reports, prescriptions, scans.
      </p>
      <div class="empty-options">
        <button class="btn mint large" type="button" @click="showAdd = true">Add your first record</button>
      </div>
    </div>

    <div class="empty-secondary">
      <div class="empty-item">
        <div class="eyebrow">While we're empty</div>
        <div class="name">Set up your emergency card</div>
        <p>Blood type, allergies, current medications. Accessible from your lock screen if you need it.</p>
        <button class="btn small light" type="button">Set up</button>
      </div>
      <div class="empty-item">
        <div class="eyebrow">Optional</div>
        <div class="name">Add your care team</div>
        <p>Your GP, therapist, specialists. Makes sharing records instant later.</p>
        <NuxtLink to="/profile" class="btn small light">Add doctors</NuxtLink>
      </div>
    </div>
  </div>

  <AddRecordModal v-if="showAdd" @close="showAdd = false" @saved="onSaved" />
  <div v-if="toast" class="toast">{{ toast }}</div>
</template>
