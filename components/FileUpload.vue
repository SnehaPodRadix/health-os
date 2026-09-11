<script setup lang="ts">
/**
 * Text extraction for medical records via Gemini.
 * The file is sent (base64) to our server route `/api/records/extract`, which
 * calls Google Gemini to OCR PDFs and images — including photos, scans,
 * handwriting, and multiple languages. Only the extracted text comes back.
 */

const emit = defineEmits<{
  (e: 'extracted', text: string): void;
}>();

type State = 'idle' | 'reading' | 'error';

const ACCEPTED = ['application/pdf', 'image/png', 'image/jpeg'];
const MIN_TEXT_LENGTH = 10;
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const state = ref<State>('idle');
const message = ref('');
const fileName = ref('');
const progress = ref<number | null>(null); // 0–100, or null when indeterminate
const dragging = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

function openPicker() {
  if (state.value === 'reading') return;
  inputEl.value?.click();
}

function onInputChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length) handleFile(files[0]);
  // reset so selecting the same file again re-triggers change
  (e.target as HTMLInputElement).value = '';
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  dragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length) handleFile(files[0]);
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  if (state.value !== 'reading') dragging.value = true;
}

function onDragLeave() {
  dragging.value = false;
}

function fail(msg: string) {
  state.value = 'error';
  message.value = msg;
  progress.value = null;
}

async function handleFile(file: File) {
  if (!ACCEPTED.includes(file.type)) {
    fail(`"${file.name}" isn't a supported file. Please use a PDF, PNG, or JPG.`);
    return;
  }
  if (file.size > MAX_BYTES) {
    fail('That file is over 20 MB. Please use a smaller file.');
    return;
  }

  fileName.value = file.name;
  state.value = 'reading';
  message.value = 'Extracting text…';
  progress.value = null; // server call — indeterminate

  try {
    const text = await extractViaGemini(file);
    if (text.trim().length < MIN_TEXT_LENGTH) {
      fail("Couldn't read any text from that file — try a clearer copy.");
      return;
    }
    state.value = 'idle';
    progress.value = null;
    message.value = '';
    emit('extracted', text.trim());
  } catch (err) {
    console.error('Extraction failed:', err);
    const msg =
      (err as { data?: { statusMessage?: string } })?.data?.statusMessage ??
      'Something went wrong extracting the text. Try again, or use a different file.';
    fail(msg);
  }
}

/** Send the file to our server route, which runs Gemini extraction. */
async function extractViaGemini(file: File): Promise<string> {
  const data = await fileToBase64(file);
  const res = await $fetch<{ text: string }>('/api/records/extract', {
    method: 'POST',
    body: { mimeType: file.type, data, filename: file.name },
  });
  return res.text ?? '';
}

/** Read a File as base64 (without the data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function reset() {
  state.value = 'idle';
  message.value = '';
  fileName.value = '';
  progress.value = null;
}
</script>

<template>
  <div class="upload">
    <div
      class="dropzone"
      :class="{ dragging, reading: state === 'reading', error: state === 'error' }"
      role="button"
      tabindex="0"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
    >
      <input
        ref="inputEl"
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        hidden
        @change="onInputChange"
      />

      <!-- idle -->
      <template v-if="state === 'idle'">
        <div class="icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 16V4M8 8l4-4 4 4" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
        </div>
        <div class="title">Drop a record here, or click to browse</div>
        <div class="hint">PDF, PNG, or JPG</div>
      </template>

      <!-- reading -->
      <template v-else-if="state === 'reading'">
        <div class="title">{{ message || 'Reading…' }}</div>
        <div class="progress">
          <div
            class="bar"
            :class="{ indeterminate: progress === null }"
            :style="progress !== null ? { width: progress + '%' } : {}"
          ></div>
        </div>
        <div class="hint">{{ fileName }}</div>
      </template>

      <!-- error -->
      <template v-else>
        <div class="title err">{{ message }}</div>
        <button type="button" class="retry" @click.stop="reset">Try another file</button>
      </template>
    </div>

    <p class="privacy">
      🔒 Your file is sent securely to Google Gemini to read the text. We don't store it.
    </p>
  </div>
</template>

<style scoped>
.upload { max-width: 480px; }
.dropzone {
  border: 1.5px dashed #b8b5ac;
  border-radius: 8px;
  background: #f6f5f0;
  padding: 40px 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  color: #1a1a1a;
}
.dropzone:hover { border-color: #2b3856; }
.dropzone.dragging { border-color: #2b3856; background: #e6e8f0; }
.dropzone.reading { cursor: default; border-style: solid; border-color: #d1cec4; }
.dropzone.error { border-color: #8b4a4a; background: #faf3f3; }
.icon { color: #2b3856; margin-bottom: 10px; opacity: 0.8; }
.title { font-size: 14px; font-weight: 500; }
.title.err { color: #8b4a4a; }
.hint { font-size: 12px; color: #7a7a7a; margin-top: 4px; }
.progress {
  height: 6px; background: #e1ded6; border-radius: 3px;
  overflow: hidden; margin: 14px auto 4px; max-width: 300px;
}
.progress .bar { height: 100%; background: #2b3856; border-radius: 3px; transition: width 0.2s; }
.progress .bar.indeterminate { width: 40%; animation: slide 1.1s ease-in-out infinite; }
@keyframes slide { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
.retry {
  margin-top: 12px; padding: 6px 12px; font-size: 13px;
  border: 1px solid #d1cec4; border-radius: 4px; background: #fff; cursor: pointer;
}
.privacy { font-size: 12px; color: #7a7a7a; margin-top: 12px; line-height: 1.5; }
</style>
