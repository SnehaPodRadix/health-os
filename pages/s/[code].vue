<script setup lang="ts">
/**
 * /s/[code] — public read-only view of a share created on /shared.
 *
 * OWNED BY: Saif. Standalone (no app sidebar). Resolves the share from
 * localStorage by its code — links open in the same browser that made them.
 * We deliberately keep share data in storage (not the URL) so nothing
 * sensitive is ever exposed in the link itself.
 */
definePageMeta({ layout: false });
useHead({ title: 'Shared via Sage' });

interface SaifShareLite {
  code?: string;
  who: string;
  tag?: string;
  what: string;
  sharedOn: string;
  expiry: string;
  status: 'active' | 'expiring' | 'expired' | 'revoked';
}

const route = useRoute();
const code = computed(() => String(route.params.code || ''));

const share = ref<SaifShareLite | null>(null);
const state = ref<'loading' | 'ok' | 'expired' | 'revoked' | 'missing'>('loading');

onMounted(() => {
  try {
    const raw = localStorage.getItem('saif-shares');
    const arr = raw ? JSON.parse(raw) : [];
    const found: SaifShareLite | undefined = Array.isArray(arr)
      ? arr.find((s: SaifShareLite) => s.code === code.value)
      : undefined;
    if (!found) state.value = 'missing';
    else if (found.status === 'revoked') state.value = 'revoked';
    else if (found.status === 'expired') state.value = 'expired';
    else {
      share.value = found;
      state.value = 'ok';
    }
  } catch {
    state.value = 'missing';
  }
});

const title = computed(() => (share.value?.what || '').split(' · ')[0] || 'Shared health summary');
const detail = computed(() => (share.value?.what || '').split(' · ').slice(1).join(' · '));
</script>

<template>
  <div class="share-public">
    <div class="brand"><span class="mark" />Sage</div>

    <div v-if="state === 'ok' && share" class="share-card">
      <div class="eyebrow">Shared with you</div>
      <h1>{{ title }}</h1>
      <p v-if="detail" class="detail">{{ detail }}</p>

      <div class="rows">
        <div class="row"><span class="k">For</span><span class="v">{{ share.who }}<span v-if="share.tag"> · {{ share.tag }}</span></span></div>
        <div class="row"><span class="k">Shared</span><span class="v">{{ share.sharedOn.replace(/^Shared /, '') }}</span></div>
        <div class="row"><span class="k">Access</span><span class="v">{{ share.expiry }}</span></div>
      </div>

      <p class="read-note">You're viewing a read-only summary shared from someone's Health OS records.</p>
    </div>

    <div v-else-if="state !== 'loading'" class="share-card muted-card">
      <div class="lock">🔒</div>
      <h1>
        {{ state === 'expired' ? 'This link has expired' : state === 'revoked' ? 'Access was revoked' : 'Link not available' }}
      </h1>
      <p class="detail">
        {{ state === 'expired'
          ? 'The person who shared this set it to expire, and it’s no longer active.'
          : state === 'revoked'
            ? 'The person who shared this has turned off access to the link.'
            : 'This share link can’t be opened here. Ask the sender for a fresh link.' }}
      </p>
    </div>

    <div class="foot">Shared securely via Sage · Sage is not a medical practitioner and is not authorized to dispense medical advice.</div>
  </div>
</template>

<style scoped>
.share-public {
  min-height: 100vh;
  box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 22px; padding: 40px 20px;
  background:
    radial-gradient(1100px 520px at 100% -8%, var(--mint-quiet), transparent 60%),
    radial-gradient(900px 500px at -5% 110%, var(--mint-soft), transparent 55%),
    var(--off-white);
  font-family: 'Geist', system-ui;
}
.brand {
  display: flex; align-items: center; gap: 9px;
  font-family: 'Familjen Grotesk', system-ui; font-weight: 700;
  font-size: 18px; letter-spacing: -0.02em; color: var(--forest);
}
.brand .mark {
  width: 20px; height: 20px; border-radius: 6px; background: var(--forest);
  position: relative; flex-shrink: 0;
}
.brand .mark::after {
  content: ''; position: absolute; right: 4px; bottom: 4px;
  width: 6px; height: 6px; border-radius: 50%; background: var(--mint);
}

.share-card {
  width: 100%; max-width: 480px;
  background: var(--white);
  border: 1px solid var(--sage-line);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(20, 50, 35, 0.10);
  padding: 30px 30px 26px;
}
.eyebrow {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
  font-weight: 600; color: var(--forest); margin-bottom: 10px;
}
.share-card h1 {
  font-family: 'Familjen Grotesk', system-ui;
  font-size: 24px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.15;
  color: var(--ink); margin-bottom: 8px;
}
.detail { font-size: 13.5px; line-height: 1.55; color: var(--ink-2); }

.rows { margin-top: 22px; border-top: 1px solid var(--sage-soft); }
.row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid var(--sage-soft); font-size: 13.5px;
}
.row .k { color: var(--ink-3); }
.row .v { color: var(--ink); font-weight: 500; }

.read-note {
  margin-top: 18px; font-size: 12px; color: var(--ink-3); line-height: 1.5;
  background: var(--mint-quiet); border: 1px solid rgba(164, 255, 207, 0.5);
  border-radius: 12px; padding: 11px 13px;
}

.muted-card { text-align: center; }
.muted-card .lock { font-size: 26px; margin-bottom: 10px; }
.muted-card .detail { max-width: 340px; margin: 0 auto; }

.foot {
  max-width: 480px; text-align: center;
  font-size: 11.5px; color: var(--ink-3); line-height: 1.5;
}

@media (max-width: 520px) {
  .share-card { padding: 24px 20px; }
  .share-card h1 { font-size: 21px; }
}
</style>
