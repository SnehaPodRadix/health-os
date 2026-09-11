export interface CareTeamMember {
  id: string;
  name: string;
  role: string;
  facility: string;
  recordCount: number;
  createdAt: string;
}

const STORAGE_KEY = 'healthos.careteam';

/** Match doctors ignoring an optional "Dr." prefix and case. */
function normalizeName(name: string) {
  return name.trim().replace(/^dr\.?\s*/i, '').toLowerCase();
}

/**
 * Care team store — doctors pulled from saved records (deduped by name),
 * shown on the Profile page. Client-side only (useState + localStorage), like
 * records; no DB.
 */
export function useCareTeam() {
  const members = useState<CareTeamMember[]>('careteam', () => []);

  if (import.meta.client && !members.value.length) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) members.value = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }

  function persist() {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(members.value));
    } catch {
      /* ignore */
    }
  }

  /** Add the doctor from a record, or bump their record count if already known. */
  function upsertFromRecord(input: { name?: string; role?: string; facility?: string }) {
    const name = input.name?.trim();
    if (!name) return;
    const key = normalizeName(name);
    const existing = members.value.find((m) => normalizeName(m.name) === key);

    if (existing) {
      existing.recordCount += 1;
      if (!existing.role && input.role?.trim()) existing.role = input.role.trim();
      if (!existing.facility && input.facility?.trim()) existing.facility = input.facility.trim();
      members.value = [...members.value];
    } else {
      members.value = [
        ...members.value,
        {
          id: (import.meta.client && crypto.randomUUID?.()) || `dr_${Date.now()}`,
          name,
          role: input.role?.trim() || '',
          facility: input.facility?.trim() || '',
          recordCount: 1,
          createdAt: new Date().toISOString(),
        },
      ];
    }
    persist();
  }

  function removeMember(id: string) {
    members.value = members.value.filter((m) => m.id !== id);
    persist();
  }

  return { members, upsertFromRecord, removeMember };
}
