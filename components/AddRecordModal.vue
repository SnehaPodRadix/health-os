<script setup lang="ts">
import type { Finding, HealthRecord } from '~/composables/useRecords';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', record: HealthRecord): void;
}>();

const { addRecord } = useRecords();

type Step = 'source' | 'upload' | 'type' | 'processing' | 'confirm';
const step = ref<Step>('source');

const ACCEPTED = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_BYTES = 20 * 1024 * 1024;

// --- upload state ---
const uploadMode = ref<'file' | 'photo'>('file');
const file = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const dragging = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const uploadError = ref('');

// --- type state ---
const typedText = ref('');

// --- analysis state ---
const analyzing = ref(false);
const analyzeError = ref('');
const analyzedFindings = ref<Finding[]>([]);

// --- editable fields (confirm) ---
const fields = reactive({
  title: '',
  type: '',
  category: '',
  source: '',
  date: '',
  dateISO: '',
  orderedBy: '',
  doctorRole: '',
  whoseRecord: 'Priya (me)',
  summary: '',
  text: '',
});

// --- optional context ---
const context = reactive({ occasion: '', symptoms: '' });
const occasions = ['Routine', 'Follow-up on a symptom', 'Something else', 'Skip'];

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function chooseSource(kind: 'file' | 'photo' | 'type') {
  if (kind === 'type') { step.value = 'type'; return; }
  uploadMode.value = kind;
  step.value = 'upload';
}

function openPicker() { inputEl.value?.click(); }

function setFile(f: File) {
  uploadError.value = '';
  if (!ACCEPTED.includes(f.type)) { uploadError.value = `"${f.name}" isn't a PDF, PNG, or JPG.`; return; }
  if (f.size > MAX_BYTES) { uploadError.value = 'That file is over 20 MB.'; return; }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  file.value = f;
  previewUrl.value = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
}

function onInput(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) setFile(f);
  (e.target as HTMLInputElement).value = '';
}
function onDrop(e: DragEvent) { e.preventDefault(); dragging.value = false; const f = e.dataTransfer?.files?.[0]; if (f) setFile(f); }
function removeFile() { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); file.value = null; previewUrl.value = null; }

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).slice((r.result as string).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

async function runAnalysis(body: Record<string, unknown>) {
  step.value = 'processing';
  analyzing.value = true;
  analyzeError.value = '';
  try {
    const { record } = await $fetch<{
      record: Omit<HealthRecord, 'id' | 'createdAt'> & { doctorRole?: string };
    }>('/api/records/analyze', { method: 'POST', body });
    fields.title = record.title || 'Untitled record';
    fields.type = record.type || '';
    fields.category = record.category || 'Medical';
    fields.source = record.source || '';
    fields.date = record.date || '';
    fields.dateISO = record.dateISO || '';
    fields.orderedBy = record.orderedBy || '';
    fields.doctorRole = record.doctorRole || '';
    fields.summary = record.summary || '';
    fields.text = record.text || '';
    analyzedFindings.value = record.findings ?? [];
  } catch (err) {
    analyzeError.value =
      (err as { data?: { statusMessage?: string } })?.data?.statusMessage ??
      'Something went wrong reading that record. Please try again.';
  } finally {
    analyzing.value = false;
  }
}

async function readFile() {
  if (!file.value) return;
  const data = await fileToBase64(file.value);
  await runAnalysis({ mimeType: file.value.type, data, filename: file.value.name });
}
function readText() {
  if (typedText.value.trim().length < 3) return;
  runAnalysis({ text: typedText.value.trim() });
}

const previewName = computed(() => file.value?.name ?? (step.value === 'type' ? 'Typed note' : 'Record'));

function save() {
  const origin: 'PDF' | 'Photo' | 'Note' = file.value
    ? (file.value.type === 'application/pdf' ? 'PDF' : 'Photo')
    : 'Note';
  const record = addRecord({
    title: fields.title,
    type: fields.type,
    category: fields.category,
    source: fields.source,
    date: fields.date,
    dateISO: fields.dateISO || undefined,
    orderedBy: fields.orderedBy || undefined,
    doctorRole: fields.doctorRole || undefined,
    summary: fields.summary,
    text: fields.text,
    findings: analyzedFindings.value,
    origin,
    context: {
      ...(context.occasion ? { occasion: context.occasion } : {}),
      ...(context.symptoms ? { symptoms: context.symptoms } : {}),
      whoseRecord: fields.whoseRecord,
    },
  });

  // Care team is derived from records (see useCareTeam) — nothing else to do here.
  emit('saved', record);
}

onBeforeUnmount(() => { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); });

const confirmSub = computed(() =>
  [fields.source, fields.date, fields.orderedBy ? `Ordered by ${fields.orderedBy}` : '']
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <!-- STEP: choose source -->
    <div v-if="step === 'source'" class="modal">
      <div class="modal-head">
        <div class="title">Add a record</div>
        <button class="close" type="button" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <p class="sub small">Where's it coming from? We'll figure out what it is on the next step.</p>
        <div class="source-grid">
          <button class="source-opt" type="button" @click="chooseSource('file')">
            <div class="name">Upload a file</div>
            <div class="hint">PDF, JPG, PNG · up to 20 MB</div>
          </button>
          <button class="source-opt" type="button" @click="chooseSource('photo')">
            <div class="name">Take a photo</div>
            <div class="hint">Snap a physical report or prescription</div>
          </button>
          <button class="source-opt" type="button" @click="chooseSource('type')">
            <div class="name">Type it out</div>
            <div class="hint">Symptoms, notes, a medication</div>
          </button>
        </div>
      </div>
    </div>

    <!-- STEP: upload -->
    <div v-else-if="step === 'upload'" class="modal">
      <div class="modal-head">
        <div class="title">{{ uploadMode === 'photo' ? 'Take a photo' : 'Upload a file' }}</div>
        <button class="close" type="button" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div
          class="dropzone"
          :class="{ drag: dragging }"
          role="button"
          tabindex="0"
          @click="openPicker"
          @keydown.enter.prevent="openPicker"
          @drop="onDrop"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
        >
          <div class="dz-title">{{ uploadMode === 'photo' ? 'Take or choose a photo' : 'Drop a file here' }}</div>
          <div class="hint">or click to browse — PDF, JPG, PNG</div>
          <input
            ref="inputEl"
            type="file"
            :accept="uploadMode === 'photo' ? 'image/png,image/jpeg' : 'application/pdf,image/png,image/jpeg'"
            :capture="uploadMode === 'photo' ? 'environment' : undefined"
            hidden
            @change="onInput"
          />
        </div>

        <p v-if="uploadError" class="modal-error mt-16">{{ uploadError }}</p>

        <template v-if="file">
          <div class="eyebrow mt-24">Selected</div>
          <div class="file-row">
            <div class="thumb" />
            <div class="fname">{{ file.name }}</div>
            <div class="size">{{ fileSize(file.size) }}</div>
            <button class="remove" type="button" @click="removeFile">Remove</button>
          </div>
        </template>
      </div>
      <div class="modal-foot">
        <div class="step">Step 1 of 3 — Upload</div>
        <div class="actions">
          <button class="btn" type="button" @click="step = 'source'">Back</button>
          <button class="btn primary" type="button" :disabled="!file" @click="readFile">Read this</button>
        </div>
      </div>
    </div>

    <!-- STEP: type it out -->
    <div v-else-if="step === 'type'" class="modal">
      <div class="modal-head">
        <div class="title">Type it out</div>
        <button class="close" type="button" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <p class="sub small" style="margin-bottom:12px;">Symptoms, a medication, a note — we'll organise it into a record.</p>
        <textarea v-model="typedText" class="type-area" placeholder="e.g. Started Metformin 500mg twice daily on 5 Aug, prescribed by Dr. Kapoor…" />
      </div>
      <div class="modal-foot">
        <div class="step">Step 1 of 3 — Write</div>
        <div class="actions">
          <button class="btn" type="button" @click="step = 'source'">Back</button>
          <button class="btn primary" type="button" :disabled="typedText.trim().length < 3" @click="readText">Read this</button>
        </div>
      </div>
    </div>

    <!-- STEP: processing -->
    <div v-else-if="step === 'processing'" class="modal wide">
      <div class="modal-head">
        <div class="title">Reading your record</div>
        <button class="close" type="button" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="processing-split">
          <div>
            <div class="doc-preview">
              <img v-if="previewUrl" :src="previewUrl" alt="Uploaded record preview" />
              <template v-else>
                <span class="bar dark long" /><span class="bar med" /><span class="bar short" />
                <div style="height:6px" />
                <span class="bar long" /><span class="bar long" /><span class="bar med" /><span class="bar long" />
                <div style="height:6px" />
                <span class="bar dark med" /><span class="bar long" /><span class="bar long" />
              </template>
            </div>
            <div class="small muted mt-8" style="text-align:center;word-break:break-all;">{{ previewName }}</div>
          </div>

          <div>
            <div v-if="analyzeError" class="modal-error">{{ analyzeError }}</div>
            <template v-else>
              <div class="extract-status">
                <span class="pulse" />
                {{ analyzing ? 'Understanding this document…' : 'Here\'s what we found' }}
              </div>
              <div :class="['extract-item', { pending: analyzing }]"><div class="k">Looks like</div><div class="v">{{ analyzing ? '' : fields.type || '—' }}</div></div>
              <div :class="['extract-item', { pending: analyzing }]"><div class="k">Source</div><div class="v">{{ analyzing ? '' : fields.source || '—' }}</div></div>
              <div :class="['extract-item', { pending: analyzing }]"><div class="k">Date on document</div><div class="v">{{ analyzing ? '' : fields.date || '—' }}</div></div>
              <div :class="['extract-item', { pending: analyzing }]"><div class="k">Ordered by</div><div class="v">{{ analyzing ? '' : fields.orderedBy || '—' }}</div></div>
              <div :class="['extract-item', { pending: analyzing }]"><div class="k">Category</div><div class="v">{{ analyzing ? '' : fields.category || '—' }}</div></div>
              <p class="small muted mt-16">You'll get to check and correct everything on the next screen.</p>
            </template>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <div class="step">Step 2 of 3 — Reading</div>
        <div class="actions">
          <button v-if="analyzeError" class="btn" type="button" @click="step = file ? 'upload' : 'type'">Back</button>
          <button class="btn primary" type="button" :disabled="analyzing || !!analyzeError" @click="step = 'confirm'">Continue</button>
        </div>
      </div>
    </div>

    <!-- STEP: confirm -->
    <div v-else class="modal confirm">
      <div class="modal-head">
        <div class="title">Does this look right?</div>
        <button class="close" type="button" @click="emit('close')">×</button>
      </div>
      <div class="modal-body" style="max-height:520px;overflow-y:auto;">
        <div class="confirm-header">
          <div class="eyebrow">{{ fields.category || 'Record' }}</div>
          <div class="c-title">{{ fields.title || 'Untitled record' }}</div>
          <div v-if="confirmSub" class="c-sub">{{ confirmSub }}</div>
        </div>

        <div class="eyebrow">What we found — edit anything that's off</div>
        <div class="confirm-fields">
          <div class="cf"><div class="k">Type</div><input v-model="fields.type" /></div>
          <div class="cf"><div class="k">Source</div><input v-model="fields.source" /></div>
          <div class="cf"><div class="k">Date</div><input v-model="fields.date" /></div>
          <div class="cf"><div class="k">Ordered by</div><input v-model="fields.orderedBy" placeholder="—" /></div>
          <div class="cf"><div class="k">Whose record</div><input v-model="fields.whoseRecord" /></div>
        </div>

        <div class="eyebrow">Optional context — helps future you</div>
        <div class="context-q">
          <div class="q">Was this part of a routine check-up, or was something wrong?</div>
          <div class="opts">
            <button
              v-for="o in occasions"
              :key="o"
              class="chip"
              :class="{ on: context.occasion === o }"
              type="button"
              @click="context.occasion = context.occasion === o ? '' : o"
            >{{ o }}</button>
          </div>
        </div>
        <div class="context-q">
          <div class="q">What were you experiencing at the time? <span class="muted">(optional)</span></div>
          <textarea v-model="context.symptoms" class="free" rows="2" placeholder="e.g. Fatigue, low energy — you can leave this blank" />
        </div>
      </div>
      <div class="modal-foot">
        <div class="step">Step 3 of 3 — Confirm</div>
        <div class="actions">
          <button class="btn" type="button" @click="step = 'processing'">Back</button>
          <button class="btn primary" type="button" @click="save">Save record</button>
        </div>
      </div>
    </div>
  </div>
</template>
