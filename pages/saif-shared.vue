<script setup lang="ts">
/**
 * saif-shared.vue — "Who has what" sharing manager. Served at /shared.
 *
 * OWNED BY: Saif. Namespaced with `saif` to avoid clashing with the other dev.
 *
 * Lets the user see every share link (active / expiring / expired / revoked),
 * revoke or extend access, and mint a new share from a template. State is kept
 * in Nuxt shared state and mirrored to localStorage (`saif-shares`) so it
 * survives reloads. UI ported from UI/sage-FINAL.html (Shared tab + drawer).
 */
definePageMeta({ alias: ['/shared'] });
useHead({ title: 'Shared · Health OS' });

type SaifShareStatus = 'active' | 'expiring' | 'expired' | 'revoked';
interface SaifShare {
  id: string;
  who: string;
  tag?: string; // e.g. "family"
  what: string;
  sharedOn: string;
  expiry: string;
  opened: string;
  status: SaifShareStatus;
}

// ---- demo seed (matches the reference: Active 3 · Expired 4 · Revoked 2) -----
const SAIF_SEED: SaifShare[] = [
  { id: 's1', who: 'Dr. Ananya Kapoor', what: 'Summary for a new doctor · Basics, active meds, recent labs, diagnoses', sharedOn: 'Shared 12 Aug 2026', expiry: 'Expires in 5 days', opened: 'Opened 3 times · last on 14 Aug', status: 'active' },
  { id: 's2', who: 'Dr. Sameer Rao', what: 'Therapy history · Session notes since June, GAD-7 assessments', sharedOn: 'Shared 28 Jul 2026', expiry: 'Never expires', opened: 'Opened 8 times · last today', status: 'active' },
  { id: 's3', who: 'Anjali Menon', tag: 'family', what: 'Emergency card · Blood type, allergies, meds, contact', sharedOn: 'Shared 20 Jul 2026', expiry: 'Expires in 2 days', opened: 'Opened once · on 22 Jul', status: 'expiring' },
  { id: 's4', who: 'Dr. Rehan Shaikh', what: 'Lab results · Lipid panel, HbA1c', sharedOn: 'Shared 2 Jun 2026', expiry: 'Expired 9 Jun 2026', opened: 'Opened 2 times', status: 'expired' },
  { id: 's5', who: 'City Diagnostics', what: 'Full report · CBC + metabolic panel', sharedOn: 'Shared 15 May 2026', expiry: 'Expired 22 May 2026', opened: 'Opened once', status: 'expired' },
  { id: 's6', who: 'Dr. Meera Iyer', what: 'Summary for a new doctor · Basics, active meds', sharedOn: 'Shared 3 Apr 2026', expiry: 'Expired 10 Apr 2026', opened: 'Opened 4 times', status: 'expired' },
  { id: 's7', who: 'Apollo Pharmacy', what: 'Prescription · Active medications list', sharedOn: 'Shared 20 Mar 2026', expiry: 'Expired 27 Mar 2026', opened: 'Never opened', status: 'expired' },
  { id: 's8', who: 'Dr. Vivek Nair', what: 'Therapy history · Session notes', sharedOn: 'Shared 10 Feb 2026', expiry: 'Revoked 15 Feb 2026', opened: 'Opened once', status: 'revoked' },
  { id: 's9', who: 'MaxLife Insurance', what: 'Full report · Annual checkup', sharedOn: 'Shared 5 Jan 2026', expiry: 'Revoked 8 Jan 2026', opened: 'Opened 3 times', status: 'revoked' },
];

const STORAGE_KEY = 'saif-shares';
const shares = useState<SaifShare[]>('saif-shares', () => [...SAIF_SEED]);

// Hydrate once on the client (fall back to the seed).
if (import.meta.client) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) shares.value = parsed;
    }
  } catch {
    /* ignore malformed storage */
  }
}
function saifPersist() {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shares.value));
  } catch {
    /* ignore quota / private-mode */
  }
}

// ---- filter tabs ------------------------------------------------------------
type SaifTab = 'active' | 'expired' | 'revoked';
const tab = ref<SaifTab>('active');

const activeCount = computed(() => shares.value.filter((s) => s.status === 'active' || s.status === 'expiring').length);
const expiredCount = computed(() => shares.value.filter((s) => s.status === 'expired').length);
const revokedCount = computed(() => shares.value.filter((s) => s.status === 'revoked').length);

const visibleShares = computed(() => {
  if (tab.value === 'active') return shares.value.filter((s) => s.status === 'active' || s.status === 'expiring');
  if (tab.value === 'expired') return shares.value.filter((s) => s.status === 'expired');
  return shares.value.filter((s) => s.status === 'revoked');
});

// ---- toast ------------------------------------------------------------------
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function saifToast(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2400);
}

function saifCode() {
  return Math.random().toString(36).slice(2, 8);
}
function saifTodayLabel() {
  try {
    return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return 'today';
  }
}

// ---- per-share actions ------------------------------------------------------
function saifViewLink(s: SaifShare) {
  saifToast(`Link copied — sage.app/s/${saifCode()}`);
}
function saifRevoke(s: SaifShare) {
  s.status = 'revoked';
  s.expiry = `Revoked ${saifTodayLabel()}`;
  saifPersist();
  saifToast('Access revoked');
}
function saifExtend(s: SaifShare) {
  s.status = 'active';
  s.expiry = 'Expires in 30 days';
  saifPersist();
  saifToast('Extended by 30 days');
}
function saifReshare(s: SaifShare) {
  s.status = 'active';
  s.expiry = 'Expires in 7 days';
  s.sharedOn = `Shared ${saifTodayLabel()}`;
  saifPersist();
  tab.value = 'active';
  saifToast('Re-shared · link copied');
}

// ---- template drawer → mint a new share -------------------------------------
interface SaifTemplate {
  key: string;
  name: string;
  hint: string;
  who: string;
  what: string;
  expiry: string;
}
const SAIF_TEMPLATES: SaifTemplate[] = [
  { key: 'doctor', name: 'A new doctor', hint: 'Basics, active meds, allergies, recent labs · 1 page', who: 'A new doctor', what: 'Summary for a new doctor · Basics, active meds, allergies, recent labs', expiry: 'Expires in 7 days' },
  { key: 'emergency', name: 'Emergency / hospital', hint: 'Blood type, allergies, meds, emergency contact — first', who: 'Emergency / hospital', what: 'Emergency card · Blood type, allergies, meds, emergency contact', expiry: 'Never expires' },
  { key: 'therapist', name: 'Therapist', hint: 'Mental health history, mood log, assessments', who: 'Therapist', what: 'Therapy history · Mental health history, mood log, assessments', expiry: 'Expires in 30 days' },
  { key: 'family', name: 'Family member', hint: 'Emergency card only. Nothing clinical.', who: 'Family member', tag: 'family', what: 'Emergency card · Nothing clinical', expiry: 'Expires in 30 days' } as SaifTemplate & { tag?: string },
  { key: 'custom', name: 'Custom', hint: 'Pick your own sections and time range', who: 'Custom share', what: 'Custom share · Your selected sections', expiry: 'Expires in 7 days' },
];

const drawerOpen = ref(false);
function saifOpenDrawer() {
  drawerOpen.value = true;
}
function saifCloseDrawer() {
  drawerOpen.value = false;
}
function saifPickTemplate(t: SaifTemplate) {
  const nw: SaifShare = {
    id: (import.meta.client && crypto.randomUUID?.()) || `share_${Date.now()}`,
    who: t.who,
    tag: (t as SaifTemplate & { tag?: string }).tag,
    what: t.what,
    sharedOn: `Shared ${saifTodayLabel()}`,
    expiry: t.expiry,
    opened: 'Not opened yet',
    status: 'active',
  };
  shares.value = [nw, ...shares.value];
  saifPersist();
  tab.value = 'active';
  drawerOpen.value = false;
  saifToast(`Link copied — sage.app/s/${saifCode()}`);
}
</script>

<template>
  <AppTopbar crumb="Shared" />

  <div class="pbody pbody-narrow">
    <div class="home-header">
      <div>
        <h1 class="h-hero">Who has <span class="italic">what</span></h1>
        <p class="sub mt-8">
          {{ activeCount }} active share{{ activeCount === 1 ? '' : 's' }} · you can revoke access at any time.
        </p>
      </div>
      <button class="btn small dark" type="button" @click="saifOpenDrawer">Share something new</button>
    </div>

    <div class="filter-bar">
      <span class="chip" :class="{ on: tab === 'active' }" @click="tab = 'active'">Active <span class="count">{{ activeCount }}</span></span>
      <span class="chip" :class="{ on: tab === 'expired' }" @click="tab = 'expired'">Expired <span class="count">{{ expiredCount }}</span></span>
      <span class="chip" :class="{ on: tab === 'revoked' }" @click="tab = 'revoked'">Revoked <span class="count">{{ revokedCount }}</span></span>
    </div>

    <div v-if="visibleShares.length" class="shared-list">
      <div v-for="s in visibleShares" :key="s.id" class="share-item">
        <div>
          <div class="who">
            {{ s.who }}<span v-if="s.tag" class="who-tag"> — {{ s.tag }}</span>
          </div>
          <div class="what">{{ s.what }}</div>
          <div class="meta">
            <span>{{ s.sharedOn }}</span>
            <span class="dot">·</span>
            <span>{{ s.expiry }}</span>
            <span class="dot">·</span>
            <span>{{ s.opened }}</span>
          </div>
        </div>
        <div class="actions">
          <span
            class="status-tag"
            :class="{ expiring: s.status === 'expiring', muted: s.status === 'expired' || s.status === 'revoked' }"
          >
            <span class="live-dot" />
            {{ s.status === 'active' ? 'Active' : s.status === 'expiring' ? 'Expiring' : s.status === 'expired' ? 'Expired' : 'Revoked' }}
          </span>
          <div class="hstack">
            <template v-if="s.status === 'active'">
              <button class="btn tiny outline" type="button" @click="saifViewLink(s)">View link</button>
              <button class="btn tiny outline" type="button" @click="saifRevoke(s)">Revoke</button>
            </template>
            <template v-else-if="s.status === 'expiring'">
              <button class="btn tiny outline" type="button" @click="saifExtend(s)">Extend</button>
              <button class="btn tiny outline" type="button" @click="saifRevoke(s)">Revoke</button>
            </template>
            <template v-else>
              <button class="btn tiny outline" type="button" @click="saifReshare(s)">Re-share</button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="shared-empty">
      No {{ tab }} shares.
    </div>

    <p class="small muted mt-32">
      Sharing always happens from the record itself — open a record and tap Share. Templates like
      "Summary for a new doctor" also live inside the share panel.
    </p>
  </div>

  <!-- template drawer -->
  <div class="drawer-scrim" :class="{ open: drawerOpen }" @click="saifCloseDrawer" />
  <aside class="drawer" :class="{ open: drawerOpen }" :aria-hidden="!drawerOpen">
    <div class="drawer-head">
      <div class="title">Start from a template</div>
      <button class="close" type="button" aria-label="Close" @click="saifCloseDrawer">×</button>
    </div>
    <div class="drawer-body">
      <button class="back-link" type="button" @click="saifCloseDrawer">← Back to shares</button>

      <div class="drawer-section">
        <div class="eyebrow">Who's it for?</div>
        <div class="template-list">
          <div
            v-for="t in SAIF_TEMPLATES"
            :key="t.key"
            class="template-opt"
            @click="saifPickTemplate(t)"
          >
            <div class="name">{{ t.name }}</div>
            <div class="hint">{{ t.hint }}</div>
          </div>
        </div>
      </div>

      <p class="small muted">
        Templates set defaults for what's included and the depth. You can still adjust everything after choosing.
      </p>
    </div>
  </aside>

  <div v-if="toast" class="toast show">{{ toast }}</div>
</template>

<style scoped>
/* ---- shared list (ported from UI/sage-FINAL.html) ---- */
.shared-list { display: flex; flex-direction: column; }
.share-item {
  padding: 22px 0;
  border-bottom: 1px solid var(--sage-soft);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 20px;
  align-items: baseline;
}
.share-item:last-child { border-bottom: none; }
.share-item .who {
  font-family: 'Familjen Grotesk', system-ui;
  font-size: 16px; font-weight: 500;
  letter-spacing: -0.012em;
  color: var(--ink);
  margin-bottom: 4px;
}
.share-item .who-tag { color: var(--ink-4); font-size: 12px; font-weight: 400; }
.share-item .what {
  font-size: 13px; color: var(--ink-2);
  margin-bottom: 8px;
  letter-spacing: -0.003em;
  line-height: 1.5;
}
.share-item .meta {
  font-size: 12px; color: var(--ink-3);
  display: flex; gap: 10px;
  letter-spacing: -0.003em;
  align-items: center; flex-wrap: wrap;
}
.share-item .meta .dot { color: var(--sage); }
.share-item .actions {
  display: flex; gap: 6px;
  flex-direction: column;
  align-items: flex-end;
}
.hstack { display: flex; gap: 4px; margin-top: 6px; }

.status-tag {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px;
  color: var(--forest);
  font-weight: 500;
  padding: 3px 10px;
  background: var(--mint-quiet);
  border-radius: var(--r-pill);
  letter-spacing: -0.003em;
}
.status-tag .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #2f9d63; }
.status-tag.expiring { background: rgba(200, 150, 40, 0.12); color: #7a5a10; }
.status-tag.expiring .live-dot { background: #c89628; }
.status-tag.muted { background: var(--sage-soft); color: var(--ink-3); }
.status-tag.muted .live-dot { background: var(--ink-4); }

.shared-empty {
  padding: 48px 0; text-align: center;
  font-family: 'Geist', system-ui; font-size: 13.5px; color: var(--ink-3);
}

/* ---- template drawer (fixed overlay) ---- */
.drawer-scrim {
  position: fixed; inset: 0;
  background: rgba(20, 30, 25, 0.28);
  z-index: 400;
  opacity: 0; pointer-events: none;
  transition: opacity 0.22s;
}
.drawer-scrim.open { opacity: 1; pointer-events: auto; }
.drawer {
  position: fixed; top: 0; right: 0;
  height: 100%; width: 460px; max-width: 92vw;
  background: var(--white);
  border-left: 1px solid var(--sage-line);
  box-shadow: -12px 0 40px rgba(20, 30, 20, 0.10);
  z-index: 500;
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0.15, 1);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.drawer.open { transform: translateX(0); }
.drawer-head {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--sage-soft);
  display: flex; align-items: center; justify-content: space-between;
}
.drawer-head .title {
  font-family: 'Familjen Grotesk', system-ui;
  font-size: 17px; font-weight: 500; letter-spacing: -0.014em; color: var(--ink);
}
.drawer-head .close {
  color: var(--ink-3); font-size: 22px; cursor: pointer;
  padding: 0 4px; line-height: 1; background: none; border: none;
}
.drawer-head .close:hover { color: var(--ink); }
.drawer-body { flex: 1; overflow-y: auto; padding: 22px 24px 24px; }
.drawer-section { margin-bottom: 24px; }
.drawer-section .eyebrow { margin-bottom: 10px; }

.template-list { display: flex; flex-direction: column; gap: 8px; }
.template-opt {
  padding: 14px 16px;
  border: 1px solid var(--sage-line);
  border-radius: var(--r);
  background: var(--glass-white);
  cursor: pointer;
  transition: all 0.15s;
}
.template-opt:hover { border-color: var(--forest); background: var(--mint-quiet); }
.template-opt .name {
  font-family: 'Familjen Grotesk', system-ui;
  font-size: 14px; font-weight: 500; letter-spacing: -0.008em; margin-bottom: 3px;
}
.template-opt .hint { font-size: 12px; color: var(--ink-3); letter-spacing: -0.003em; }
.back-link {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--ink-3); cursor: pointer;
  margin-bottom: 16px; font-weight: 500; background: none; border: none; padding: 0;
}
.back-link:hover { color: var(--forest); }

/* filter chips are clickable here */
.filter-bar .chip { cursor: pointer; }

/* ---- responsive ---- */
@media (max-width: 640px) {
  .share-item { grid-template-columns: 1fr; gap: 12px; }
  .share-item .actions { flex-direction: row; align-items: center; justify-content: space-between; }
  .drawer { width: 100%; max-width: 100%; }
}
</style>
