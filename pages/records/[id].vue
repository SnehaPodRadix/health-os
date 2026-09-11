<script setup lang="ts">
const route = useRoute();
const { records } = useRecords();

const record = computed(() => records.value.find((r) => r.id === route.params.id));
useHead(() => ({ title: `${record.value?.title ?? 'Record'} · Health OS` }));

const metaLine = computed(() => {
  const r = record.value;
  if (!r) return '';
  return [r.type, r.source, r.date, r.orderedBy ? `Ordered by ${r.orderedBy}` : '']
    .filter(Boolean)
    .join(' · ');
});
</script>

<template>
  <AppTopbar>
    <NuxtLink to="/records">Records</NuxtLink>
    <span class="sep">/</span>
    <span class="this">{{ record?.title ?? 'Record' }}</span>
  </AppTopbar>

  <div class="pbody pbody-narrow">
    <template v-if="record">
      <div class="hstack" style="gap: 10px;">
        <span class="chip plain small">{{ record.category }}</span>
        <h1 class="h1" style="margin: 0;">{{ record.title }}</h1>
      </div>
      <p v-if="metaLine" class="sub mt-8">{{ metaLine }}</p>

      <div v-if="record.summary" class="card accent mt-24">
        <div class="eyebrow" style="margin: 0 0 6px;">In short</div>
        <div>{{ record.summary }}</div>
      </div>

      <div class="mt-32" />
      <div class="eyebrow">Original text</div>
      <pre class="record-text">{{ record.text }}</pre>

      <p class="small muted mt-16">
        A fuller view (plain-English / clinical / original document) is coming.
      </p>
    </template>

    <div v-else class="empty-hero" style="margin-top: 24px;">
      <h2>Record not found</h2>
      <p>It may have been removed, or this link was opened on another device (records are stored in your browser).</p>
      <div class="empty-options">
        <NuxtLink to="/records" class="btn primary large">Back to records</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.record-text {
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--panel);
  border-radius: var(--r-control);
  padding: 16px;
  margin-top: 8px;
  font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text);
}
</style>
