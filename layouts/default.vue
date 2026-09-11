<script setup lang="ts">
// Shared mobile-drawer state for the sidebar (toggled from AppTopbar's hamburger).
const navOpen = useState('ui-nav-open', () => false);
</script>

<template>
  <div class="pshell" :class="{ 'nav-open': navOpen }">
    <div class="nav-scrim" @click="navOpen = false" />
    <AppSidebar />
    <div class="pmain">
      <slot />
    </div>
  </div>
</template>
