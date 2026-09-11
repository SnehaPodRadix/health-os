export interface CareTeamMember {
  id: string;
  name: string;
  role: string;
  facility: string;
  recordCount: number;
  createdAt: string;
}

/** Match doctors ignoring an optional "Dr." prefix and case. */
function normalizeName(name: string) {
  return name.trim().replace(/^dr\.?\s*/i, '').toLowerCase();
}

/**
 * Care team = doctors DERIVED from saved records (grouped by name, deduped
 * ignoring "Dr."/case). Deriving from records means every record — including
 * ones saved before this feature — is counted automatically, with no drift.
 *
 * Role/facility come from the record fields; for records saved before we stored
 * the doctor's role, we fall back (read-only) to the legacy `healthos.careteam`
 * store so their specialty isn't lost.
 */
export function useCareTeam() {
  const { records } = useRecords();

  const legacy = useState<Record<string, { role?: string; facility?: string }>>(
    'care-legacy',
    () => ({}),
  );
  if (import.meta.client && !Object.keys(legacy.value).length) {
    try {
      const raw = localStorage.getItem('healthos.careteam');
      if (raw) {
        const map: Record<string, { role?: string; facility?: string }> = {};
        for (const m of JSON.parse(raw) as CareTeamMember[]) {
          map[normalizeName(m.name)] = { role: m.role, facility: m.facility };
        }
        legacy.value = map;
      }
    } catch {
      /* ignore */
    }
  }

  const members = computed<CareTeamMember[]>(() => {
    const map = new Map<string, CareTeamMember>();
    for (const r of records.value) {
      const name = r.orderedBy?.trim();
      if (!name) continue;
      const key = normalizeName(name);
      const existing = map.get(key);
      if (existing) {
        existing.recordCount += 1;
        if (!existing.role && r.doctorRole?.trim()) existing.role = r.doctorRole.trim();
        if (!existing.facility && r.source?.trim()) existing.facility = r.source.trim();
      } else {
        const lg = legacy.value[key] ?? {};
        map.set(key, {
          id: key,
          name,
          role: r.doctorRole?.trim() || lg.role || '',
          facility: r.source?.trim() || lg.facility || '',
          recordCount: 1,
          createdAt: r.createdAt,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.recordCount - a.recordCount);
  });

  return { members };
}
