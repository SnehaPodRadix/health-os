<script setup lang="ts">
import type { HealthRecord } from '~/composables/useRecords';

useHead({ title: 'Records · Health OS' });

const { records } = useRecords();
const showAdd = ref(false);
const activeCat = ref<string>('All');

const CAT_ORDER = ['Medical', 'Mental', 'Lifestyle', 'Family'];

const counts = computed(() => {
  const m: Record<string, number> = {};
  for (const r of records.value) m[r.category] = (m[r.category] ?? 0) + 1;
  return m;
});
const cats = computed(() => ['All', ...CAT_ORDER.filter((c) => counts.value[c])]);

const filtered = computed(() =>
  activeCat.value === 'All'
    ? records.value
    : records.value.filter((r) => r.category === activeCat.value),
);

function recDate(r: HealthRecord): Date {
  const d = r.dateISO ? new Date(r.dateISO) : new Date(r.createdAt);
  return Number.isNaN(d.getTime()) ? new Date(r.createdAt) : d;
}

const groups = computed(() => {
  const sorted = [...filtered.value].sort((a, b) => recDate(b).getTime() - recDate(a).getTime());
  const out: { label: string; items: HealthRecord[] }[] = [];
  for (const r of sorted) {
    const label = recDate(r).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    let g = out[out.length - 1];
    if (!g || g.label !== label) { g = { label, items: [] }; out.push(g); }
    g.items.push(r);
  }
  return out;
});

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

function metaLine(r: HealthRecord) {
  const parts = [r.source, r.orderedBy].filter(Boolean);
  return parts.length ? parts.join(' · ') : r.summary || '';
}

const rangeLabel = computed(() => {
  if (!records.value.length) return '';
  const years = records.value.map((r) => recDate(r).getFullYear());
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min} – ${max}`;
});

function exportAll() {
  const blob = new Blob([JSON.stringify(records.value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'health-os-records.json';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <AppTopbar crumb="Records" />

  <div class="pbody">
    <div class="home-header">
      <div>
        <h1 class="h1 large">Your health, <span class="italic">over time</span></h1>
        <p class="sub mt-8">
          {{ records.length }} record{{ records.length === 1 ? '' : 's' }}<span v-if="rangeLabel"> · {{ rangeLabel }}</span>
        </p>
      </div>
      <div class="hstack">
        <button class="btn" type="button" :disabled="!records.length" @click="exportAll">Export all</button>
        <button class="btn primary" type="button" @click="showAdd = true">Add record</button>
      </div>
    </div>

    <template v-if="records.length">
      <div class="filter-bar">
        <span
          v-for="c in cats"
          :key="c"
          class="chip"
          :class="{ on: activeCat === c }"
          @click="activeCat = c"
        >{{ c }} <span class="count">{{ c === 'All' ? records.length : counts[c] }}</span></span>
      </div>

      <div class="timeline">
        <template v-for="g in groups" :key="g.label">
          <div class="timeline-month">{{ g.label }}</div>
          <NuxtLink v-for="r in g.items" :key="r.id" :to="`/records/${r.id}`" class="tl-entry">
            <div class="day">{{ dayLabel(r) }}</div>
            <div class="cat">{{ catLabel(r) }}</div>
            <div class="main">
              <div class="title">{{ r.title }}</div>
              <div class="meta">{{ metaLine(r) }}</div>
            </div>
            <div class="aside">{{ r.origin || '' }}</div>
          </NuxtLink>
        </template>
      </div>
    </template>

    <div v-else class="empty-hero" style="margin-top: 24px;">
      <h2>No records yet</h2>
      <p>Add your first record and it'll appear here on your timeline.</p>
      <div class="empty-options">
        <button class="btn primary large" type="button" @click="showAdd = true">Add a record</button>
      </div>
    </div>
  </div>

  <AddRecordModal v-if="showAdd" @close="showAdd = false" @saved="showAdd = false" />
</template>
