<script setup lang="ts">
const route = useRoute();
const navOpen = useState('ui-nav-open', () => false);

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
    <div class="brand"><SageLogo class="logo" /></div>
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
        <div class="name">Vikram</div>
        <div class="plan">Free plan</div>
      </div>
    </div>
  </nav>
</template>
