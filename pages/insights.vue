<script setup lang="ts">
import type { HealthRecord } from '~/composables/useRecords';

useHead({ title: 'Insights · Sage' });

const { records, updateRecord } = useRecords();
const dismissed = ref<Set<string>>(new Set());

// Backfill: records saved before structured extraction have no `findings`. Re-run
// the analyzer over their stored text so they contribute to Insights.
const backfilling = ref(false);
onMounted(async () => {
  const missing = records.value.filter(
    (r) => r.findings === undefined && r.text && r.text.trim().length > 10,
  );
  if (!missing.length) return;
  backfilling.value = true;
  for (const r of missing) {
    try {
      const { record } = await $fetch<{ record: { findings?: typeof r.findings; doctorRole?: string } }>(
        '/api/records/analyze',
        { method: 'POST', body: { text: r.text } },
      );
      updateRecord(r.id, {
        findings: record.findings ?? [],
        ...(r.doctorRole ? {} : { doctorRole: record.doctorRole }),
      });
    } catch {
      updateRecord(r.id, { findings: [] }); // mark attempted so we don't retry in a loop
    }
  }
  backfilling.value = false;
});

function parseNum(s: string): number | null {
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function recDate(r: HealthRecord): Date {
  const d = r.dateISO ? new Date(r.dateISO) : new Date(r.createdAt);
  return Number.isNaN(d.getTime()) ? new Date(r.createdAt) : d;
}
function isFlag(f: string) {
  return f === 'low' || f === 'high';
}

interface Point { num: number | null; raw: string; flag: string; expl: string; date: Date }
interface Series { key: string; name: string; points: Point[] }

const series = computed<Series[]>(() => {
  const map = new Map<string, Series>();
  for (const r of records.value) {
    for (const f of r.findings ?? []) {
      const key = f.name.trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, name: f.name.trim(), points: [] });
      map.get(key)!.points.push({
        num: parseNum(f.value),
        raw: f.value,
        flag: (f.flag || '').toLowerCase(),
        expl: f.explanation,
        date: recDate(r),
      });
    }
  }
  for (const s of map.values()) s.points.sort((a, b) => a.date.getTime() - b.date.getTime());
  return [...map.values()];
});

function bars(nums: number[], flag = ''): number[] {
  const last = nums.slice(-6);
  // Single reading: height hints at the flag rather than being arbitrary.
  if (last.length === 1) {
    const f = flag.toLowerCase();
    return [f === 'low' ? 34 : f === 'high' ? 92 : 62];
  }
  const min = Math.min(...last);
  const max = Math.max(...last);
  return last.map((n) => (max === min ? 60 : Math.round(20 + ((n - min) / (max - min)) * 80)));
}

const observations = computed(() => {
  const list = series.value
    .filter((s) => !dismissed.value.has(s.key))
    .map((s) => {
      const pts = s.points;
      const latest = pts[pts.length - 1];
      const prev = [...pts].slice(0, -1).reverse().find((p) => p.num != null);
      const numeric = pts.filter((p) => p.num != null);
      // A "measured" value is a lab reading (has a low/high/normal flag) — worth charting
      // even with a single reading. Non-measurements (e.g. a medication dose) only chart
      // once there's an actual trend (2+ readings).
      const measured = ['low', 'high', 'normal'].includes(latest.flag);
      let delta = latest.raw;
      if (prev && latest.num != null && prev.num != null) {
        const dir = latest.num > prev.num ? 'up' : latest.num < prev.num ? 'down' : 'unchanged';
        delta = dir === 'unchanged' ? `${latest.raw} · unchanged` : `${latest.raw} · ${dir} from ${prev.raw}`;
      }
      const showGraph = numeric.length >= 2 || (numeric.length >= 1 && measured);
      return {
        key: s.key,
        name: s.name,
        delta,
        expl: latest.expl,
        flagged: isFlag(latest.flag),
        graph: showGraph ? bars(numeric.map((p) => p.num as number), latest.flag) : null,
      };
    });
  return list
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || Number(!!b.graph) - Number(!!a.graph))
    .slice(0, 8);
});

function joinNames(a: string[]) {
  if (a.length <= 1) return a[0] ?? '';
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
}

const flaggedNames = computed(() =>
  series.value.filter((s) => isFlag(s.points[s.points.length - 1].flag)).map((s) => s.name),
);

const headline = computed(() => {
  if (!series.value.length) return null;
  if (flaggedNames.value.length) {
    return {
      k: 'From your latest results',
      pre: '',
      accent: joinNames(flaggedNames.value),
      post: flaggedNames.value.length > 1 ? ' are outside the normal range.' : ' is outside the normal range.',
    };
  }
  const n = series.value.length;
  return {
    k: 'From your records',
    pre: 'Nothing is flagged right now — ',
    accent: `${n} marker${n === 1 ? '' : 's'}`,
    post: ' tracked.',
  };
});

function dismiss(key: string) {
  dismissed.value = new Set([...dismissed.value, key]);
}
</script>

<template>
  <AppTopbar crumb="Insights" />

  <div class="pbody pbody-narrow">
    <h1 class="h1 large">Worth <span class="italic">noticing</span></h1>
    <p class="sub mt-8">Patterns from your own records. Not diagnoses.</p>

    <div class="mt-32" />

    <template v-if="observations.length">
      <div v-if="headline" class="insight-headline">
        <div class="k">{{ headline.k }}</div>
        <div class="v">{{ headline.pre }}<span v-if="headline.accent" class="accent">{{ headline.accent }}</span>{{ headline.post }}</div>
      </div>

      <div
        v-for="(o, i) in observations"
        :key="o.key"
        class="observation"
        :class="{ last: i === observations.length - 1 }"
      >
        <div class="obs-h">
          <div class="metric">{{ o.name }}</div>
          <div class="delta">{{ o.delta }}</div>
        </div>
        <p v-if="o.expl">{{ o.expl }}</p>
        <div v-if="o.graph" class="mini-graph">
          <div v-for="(h, gi) in o.graph" :key="gi" class="col" :style="{ height: h + '%' }" />
        </div>
        <div class="obs-actions">
          <button class="btn small ghost" type="button" @click="dismiss(o.key)">Dismiss</button>
        </div>
      </div>

      <p class="small muted mt-24">More insights show up as you add records. Not a substitute for medical advice.</p>
    </template>

    <div v-else-if="backfilling" class="insight-headline">
      <div class="k">One moment</div>
      <div class="v">Reading your records for patterns…</div>
    </div>

    <div v-else class="empty-hero" style="margin-top: 24px;">
      <h2>No insights yet</h2>
      <p>Add records with lab values or prescriptions and patterns — trends, out-of-range values — will show up here.</p>
      <div class="empty-options">
        <NuxtLink to="/records" class="btn dark large">Go to records</NuxtLink>
      </div>
    </div>
  </div>
</template>
