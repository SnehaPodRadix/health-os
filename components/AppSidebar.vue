<script setup lang="ts">
const route = useRoute();
const navOpen = useState('ui-nav-open', () => false);

const links = [
  { label: 'Home', to: '/' },
  { label: 'Records', to: '/records' },
  { label: 'Chat', to: '/chat' }, // built by Saif
  { label: 'Insights', to: '/insights' },
  { label: 'Shared', to: '/shared' }, // built by Saif
];

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to);
}
</script>

<template>
  <nav class="pnav">
    <div class="brand"><span class="mark" />Health OS</div>
    <NuxtLink
      v-for="l in links"
      :key="l.to"
      :to="l.to"
      class="plink"
      :class="{ active: isActive(l.to) }"
      @click="navOpen = false"
    >{{ l.label }}</NuxtLink>
    <div class="divider" />
    <NuxtLink
      to="/profile"
      class="plink"
      :class="{ active: isActive('/profile') }"
      @click="navOpen = false"
    >Profile</NuxtLink>
    <div class="foot">
      <div class="avatar">P</div>
      <div class="who">
        <div class="name">Priya</div>
        <div class="plan">Free plan</div>
      </div>
    </div>
  </nav>
</template>
