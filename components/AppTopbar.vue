<script setup lang="ts">
defineProps<{ crumb?: string }>();
</script>

<template>
  <div class="pbar">
    <div class="crumb">
      <slot>
        <span class="this">{{ crumb }}</span>
      </slot>
    </div>
    <div class="search">Search everything…</div>
    <div class="avatar">P</div>
  </div>
</template>
