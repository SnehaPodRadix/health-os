<script setup lang="ts">
defineProps<{ crumb?: string }>();
const navOpen = useState('ui-nav-open', () => false);
</script>

<template>
  <div class="pbar">
    <button class="nav-toggle" type="button" aria-label="Menu" @click="navOpen = !navOpen">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    </button>
    <div class="crumb">
      <slot><span class="this">{{ crumb }}</span></slot>
    </div>
    <div class="search">Search everything…</div>
    <div class="avatar">P</div>
  </div>
</template>
