<script setup lang="ts">
import type { CareTeamMember } from '~/composables/useCareTeam';

useHead({ title: 'Profile · Health OS' });

const { members } = useCareTeam();

function initials(name: string) {
  return name
    .replace(/^dr\.?\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function roleLine(m: CareTeamMember) {
  return [m.role, m.facility, `${m.recordCount} record${m.recordCount === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(' · ');
}
</script>

<template>
  <AppTopbar crumb="Profile" />

  <div class="pbody pbody-narrow">
    <h1 class="h1 large">Priya Sharma</h1>
    <p class="sub mt-8">34 · Mumbai · Managing your own records</p>

    <div class="mt-40" />

    <div class="profile-section">
      <div class="eyebrow">Basics</div>
      <div class="profile-row"><div class="k">Date of birth</div><div>14 March 1991</div><div class="edit">Edit</div></div>
      <div class="profile-row"><div class="k">Blood type</div><div>O+</div><div class="edit">Edit</div></div>
      <div class="profile-row"><div class="k">Allergies</div><div>Penicillin (severe)</div><div class="edit">Edit</div></div>
      <div class="profile-row"><div class="k">Emergency contact</div><div>Raj Sharma · +91 98••• •••23</div><div class="edit">Edit</div></div>
      <div class="profile-row"><div class="k">Preferred language</div><div>English + Hindi</div><div class="edit">Change</div></div>
    </div>

    <div class="profile-section">
      <div class="eyebrow">Care team</div>

      <div v-if="members.length" class="care-list">
        <div v-for="m in members" :key="m.id" class="care-item">
          <div class="care-avatar">{{ initials(m.name) }}</div>
          <div class="care-info">
            <div class="care-name">{{ m.name }}</div>
            <div class="care-role">{{ roleLine(m) }}</div>
          </div>
          <button class="btn small" type="button">Manage</button>
        </div>
      </div>
      <p v-else class="sub" style="padding: 4px 0 8px;">
        Doctors mentioned in your records show up here automatically. Add a record with a
        doctor's name and they'll appear.
      </p>

      <button class="btn mt-16" type="button">Add someone</button>
    </div>

    <div class="profile-section">
      <div class="eyebrow">Privacy &amp; sharing</div>
      <div class="profile-row"><div class="k">Active shared links</div><div>None yet</div><div class="edit">Manage</div></div>
      <div class="profile-row"><div class="k">Family view</div><div>Off</div><div class="edit">Set up</div></div>
      <div class="profile-row"><div class="k">Emergency card on lock screen</div><div>On</div><div class="edit">Change</div></div>
      <div class="profile-row"><div class="k">Data export</div><div>Everything, anytime</div><NuxtLink to="/records" class="edit">Export</NuxtLink></div>
    </div>
  </div>
</template>
