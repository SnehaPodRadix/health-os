export interface Finding {
  name: string;
  value: string;
  flag: string; // 'low' | 'high' | 'normal' | ''
  explanation: string;
}

export interface HealthRecord {
  id: string;
  title: string;
  type: string;
  category: string;
  source: string;
  date: string;
  dateISO?: string;
  orderedBy?: string;
  doctorRole?: string;
  summary: string;
  text: string;
  findings?: Finding[];
  origin?: 'PDF' | 'Photo' | 'Note';
  context?: Record<string, string>;
  createdAt: string;
}

const STORAGE_KEY = 'healthos.records';

/**
 * Client-side records store (no DB yet — auth/persistence was cut for the
 * hackathon). Kept in Nuxt shared state and mirrored to localStorage so saved
 * records survive reloads and can feed the Records list / populated Home later.
 */
export function useRecords() {
  const records = useState<HealthRecord[]>('records', () => []);

  // Hydrate once on the client.
  if (import.meta.client && !records.value.length) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) records.value = JSON.parse(raw);
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }

  function persist() {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records.value));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }

  function updateRecord(id: string, patch: Partial<HealthRecord>) {
    const idx = records.value.findIndex((r) => r.id === id);
    if (idx < 0) return;
    records.value = records.value.map((r) => (r.id === id ? { ...r, ...patch } : r));
    persist();
  }

  function addRecord(fields: Omit<HealthRecord, 'id' | 'createdAt'>): HealthRecord {
    const record: HealthRecord = {
      ...fields,
      id: (import.meta.client && crypto.randomUUID?.()) || `rec_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    records.value = [record, ...records.value];
    persist();
    return record;
  }

  return { records, addRecord, updateRecord };
}
