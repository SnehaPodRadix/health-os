<script setup lang="ts">
const route = useRoute();
const { records } = useRecords();

const record = computed(() => records.value.find((r) => r.id === route.params.id));
useHead(() => ({ title: `${record.value?.title ?? 'Record'} · Health OS` }));

type View = 'plain' | 'clinical' | 'original';
const view = ref<View>('plain');

const findings = computed(() => record.value?.findings ?? []);

const metaParts = computed(() => {
  const r = record.value;
  if (!r) return [] as string[];
  return [r.date, r.source, r.orderedBy ? `Ordered by ${r.orderedBy}` : '', r.origin]
    .filter(Boolean) as string[];
});

const note = computed(() => record.value?.context?.symptoms || '');

function flag(f: string) {
  const v = (f || '').toLowerCase();
  if (v === 'low') return { cls: 'low', label: 'Low' };
  if (v === 'high') return { cls: 'high', label: 'High' };
  if (v === 'normal' || v === 'ok') return { cls: 'normal', label: 'Normal' };
  return null;
}
</script>

<template>
  <AppTopbar>
    <NuxtLink to="/records">Records</NuxtLink>
    <span class="sep">/</span>
    <span class="this">{{ record?.title ?? 'Record' }}</span>
  </AppTopbar>

  <div class="pbody">
    <template v-if="record">
      <div class="detail-head">
        <div class="eyebrow">{{ record.type || record.category }}</div>
        <h1 class="h1">{{ record.title }}</h1>
        <div class="meta">
          <span v-for="m in metaParts" :key="m">{{ m }}</span>
        </div>
      </div>

      <div class="detail-toggle">
        <button class="seg" :class="{ on: view === 'plain' }" type="button" @click="view = 'plain'">Plain English</button>
        <button class="seg" :class="{ on: view === 'clinical' }" type="button" @click="view = 'clinical'">Clinical view</button>
        <button class="seg" :class="{ on: view === 'original' }" type="button" @click="view = 'original'">Original document</button>
      </div>

      <div class="detail-grid">
        <div>
          <!-- PLAIN ENGLISH -->
          <template v-if="view === 'plain'">
            <div v-if="findings.length" class="value-list">
              <div v-for="(f, i) in findings" :key="i" class="val">
                <div>
                  <div class="name">{{ f.name }}</div>
                  <div v-if="f.explanation" class="expl">{{ f.explanation }}</div>
                </div>
                <div class="num">{{ f.value }}</div>
                <div v-if="flag(f.flag)" class="flag" :class="flag(f.flag)!.cls">{{ flag(f.flag)!.label }}</div>
                <div v-else />
              </div>
            </div>
            <p v-else class="sub">
              {{ record.summary || 'No structured values were extracted from this record — see the original document.' }}
            </p>

            <template v-if="note">
              <div class="mt-32" />
              <div class="eyebrow">Your note</div>
              <p style="color: var(--text-2); font-size: 13.5px; margin: 0;">"{{ note }}"</p>
            </template>
          </template>

          <!-- CLINICAL -->
          <template v-else-if="view === 'clinical'">
            <div v-if="findings.length" class="value-list">
              <div v-for="(f, i) in findings" :key="i" class="val">
                <div><div class="name">{{ f.name }}</div></div>
                <div class="num">{{ f.value }}</div>
                <div v-if="flag(f.flag)" class="flag" :class="flag(f.flag)!.cls">{{ flag(f.flag)!.label }}</div>
                <div v-else />
              </div>
            </div>
            <p v-else class="sub">No structured values were extracted — the original text is under “Original document.”</p>
          </template>

          <!-- ORIGINAL -->
          <template v-else>
            <div class="eyebrow" style="margin-bottom: 8px;">Text read from your record</div>
            <pre class="record-original">{{ record.text }}</pre>
          </template>
        </div>

        <!-- side -->
        <div class="detail-side">
          <div v-if="record.summary" class="side-block">
            <div class="eyebrow">In short</div>
            <p style="font-size: 13px; color: var(--text-2); margin: 0; line-height: 1.55;">{{ record.summary }}</p>
          </div>
          <div class="side-block detail-facts">
            <div class="eyebrow">Details</div>
            <div v-if="record.type" class="f"><div class="k">Type</div><div>{{ record.type }}</div></div>
            <div v-if="record.date" class="f"><div class="k">Date</div><div>{{ record.date }}</div></div>
            <div v-if="record.source" class="f"><div class="k">Source</div><div>{{ record.source }}</div></div>
            <div v-if="record.orderedBy" class="f"><div class="k">Doctor</div><div>{{ record.orderedBy }}</div></div>
            <div v-if="record.origin" class="f"><div class="k">Added as</div><div>{{ record.origin }}</div></div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="empty-hero" style="margin-top: 24px; max-width: 820px;">
      <h2>Record not found</h2>
      <p>It may have been removed, or this link was opened on another device (records are stored in your browser).</p>
      <div class="empty-options">
        <NuxtLink to="/records" class="btn primary large">Back to records</NuxtLink>
      </div>
    </div>
  </div>
</template>
