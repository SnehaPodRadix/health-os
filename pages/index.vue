<script setup lang="ts">
// TEMPORARY dev harness to exercise the auth API end-to-end.
// This is throwaway UI — replace with the real login screen when it's ready.
interface PublicUser {
  id: string;
  username: string;
  createdAt: string;
}

const username = ref('demo');
const password = ref('password123');
const status = ref('');
const currentUser = ref<PublicUser | null>(null);

function errorMessage(e: unknown): string {
  const data = (e as { data?: { statusMessage?: string; message?: string } })?.data;
  return data?.statusMessage || data?.message || 'Request failed';
}

async function login() {
  status.value = 'Logging in…';
  try {
    const res = await $fetch<{ user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    });
    currentUser.value = res.user;
    status.value = `Logged in as ${res.user.username}`;
  } catch (e) {
    currentUser.value = null;
    status.value = errorMessage(e);
  }
}

async function whoAmI() {
  try {
    const res = await $fetch<{ user: PublicUser }>('/api/auth/me');
    currentUser.value = res.user;
    status.value = `Session valid: ${res.user.username}`;
  } catch {
    currentUser.value = null;
    status.value = 'No active session';
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' });
  currentUser.value = null;
  status.value = 'Logged out';
}
</script>

<template>
  <main class="wrap">
    <h1>Health OS — auth dev harness</h1>
    <p class="note">Temporary page for testing the login API. The real UI plugs in later.</p>

    <label>Username
      <input v-model="username" autocomplete="username" />
    </label>
    <label>Password
      <input v-model="password" type="password" autocomplete="current-password" />
    </label>

    <div class="row">
      <button type="button" @click="login">Log in</button>
      <button type="button" @click="whoAmI">Who am I</button>
      <button type="button" @click="logout">Log out</button>
    </div>

    <p class="status"><strong>{{ status || '—' }}</strong></p>
    <pre v-if="currentUser">{{ currentUser }}</pre>

    <p class="link"><NuxtLink to="/upload">→ File upload / text extraction demo</NuxtLink></p>
  </main>
</template>

<style scoped>
.wrap { max-width: 360px; margin: 72px auto; font-family: system-ui, sans-serif; display: flex; flex-direction: column; gap: 12px; color: #1a1a1a; }
.note { color: #888; margin: 0 0 8px; font-size: 14px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
input { padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; }
.row { display: flex; gap: 8px; margin-top: 4px; }
button { padding: 8px 12px; border: 1px solid #999; border-radius: 6px; background: #f4f4f4; cursor: pointer; }
.status { min-height: 20px; }
pre { background: #f6f6f6; padding: 10px; border-radius: 6px; font-size: 12px; overflow: auto; }
.link { margin-top: 16px; font-size: 14px; }
.link a { color: #2b3856; }
</style>
