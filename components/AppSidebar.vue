<script setup lang="ts">
const route = useRoute();

const links = [
  { label: 'Home', to: '/' },
  { label: 'Records', to: '/records' },
  { label: 'Chat', to: '/chat' }, // built by Saif
  { label: 'Insights', to: '/insights' },
];

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to);
}
</script>

<template>
  <nav class="pnav">
    <div class="logo"><span class="mark" />Health OS</div>
    <NuxtLink
      v-for="l in links"
      :key="l.to"
      :to="l.to"
      class="plink"
      :class="{ active: isActive(l.to) }"
    >{{ l.label }}</NuxtLink>
    <div class="divider" />
    <NuxtLink to="/profile" class="plink" :class="{ active: isActive('/profile') }">Profile</NuxtLink>
    <div class="foot"><div class="name">Priya</div>Free plan</div>
  </nav>
</template>
