<script setup lang="ts">
// Home — first-use (empty) state. Entry screen for the app.
useHead({ title: 'Home · Health OS' });

const { records } = useRecords();
const showAdd = ref(false);
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function onSaved() {
  showAdd.value = false;
  toast.value = 'Saved to your records';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2400);
}
</script>

<template>
  <AppTopbar crumb="Home" />

  <div class="pbody pbody-narrow">
    <h1 class="h1 large">Hello, Priya.</h1>
    <p class="sub mt-8">Let's get your health records in one place.</p>

    <div class="mt-32" />

    <div class="empty-hero">
      <h2>No records yet</h2>
      <p>
        Add your first record and we'll start building your history. One at a time
        or in batches — reports, prescriptions, scans.
      </p>
      <div class="empty-options">
        <button class="btn primary large" type="button" @click="showAdd = true">Add your first record</button>
      </div>
      <p v-if="records.length" class="small muted mt-16">
        {{ records.length }} record{{ records.length === 1 ? '' : 's' }} saved this session.
      </p>
    </div>

    <div class="empty-secondary">
      <div class="empty-item">
        <div class="eyebrow">While we're empty</div>
        <div class="name">Set up your emergency card</div>
        <p>Blood type, allergies, current medications. Accessible from your lock screen if you need it.</p>
        <button class="btn small" type="button">Set up</button>
      </div>
      <div class="empty-item">
        <div class="eyebrow">Optional</div>
        <div class="name">Add your care team</div>
        <p>Your GP, therapist, specialists. Makes sharing records instant later.</p>
        <NuxtLink to="/profile" class="btn small">Add doctors</NuxtLink>
      </div>
    </div>
  </div>

  <AddRecordModal v-if="showAdd" @close="showAdd = false" @saved="onSaved" />
  <div v-if="toast" class="toast">{{ toast }}</div>
</template>
