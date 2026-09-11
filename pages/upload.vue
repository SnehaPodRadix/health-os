<script setup lang="ts">
// Dev harness for the record-upload → text-extraction step of the Add-record flow.
// FileUpload does all the work client-side and emits the extracted text.
// Standalone for now — the real Add-record flow is a modal in the v2 design.
definePageMeta({ layout: false });

const extracted = ref<string | null>(null);

function onText(text: string) {
  extracted.value = text;
  // Next step in the flow: hand the (user-corrected) `extracted` text to the
  // analysis backend (a future POST /api/records/analyze) to structure it into
  // a record. Because on-device OCR is imperfect, the user edits it here first.
}
</script>

<template>
  <main class="wrap">
    <h1>Add a record</h1>
    <p class="note">
      Upload a report, prescription, or scan. We use Google Gemini to read the text —
      it handles photos, scans, and multiple languages (English, Hindi, Marathi).
      Your file is sent for extraction and not stored.
    </p>

    <FileUpload @extracted="onText" />

    <section v-if="extracted !== null" class="result">
      <h2>Extracted text — review and fix before continuing</h2>
      <p class="review">On-device OCR isn't perfect. Correct anything that came out wrong.</p>
      <textarea v-model="extracted" rows="12" spellcheck="false"></textarea>
      <p class="next">Next: this (corrected) text feeds the analysis step to structure it into a record.</p>
    </section>

    <p class="link"><NuxtLink to="/">← Back to Home</NuxtLink></p>
  </main>
</template>

<style scoped>
.wrap { max-width: 560px; margin: 56px auto; padding: 0 20px; font-family: system-ui, sans-serif; color: #1a1a1a; }
h1 { font-size: 22px; margin: 0 0 6px; }
.note { color: #7a7a7a; font-size: 13.5px; line-height: 1.5; margin: 0 0 20px; max-width: 480px; }
.result { margin-top: 28px; }
.result h2 { font-size: 14px; color: #555; margin: 0 0 4px; }
.review { font-size: 12.5px; color: #7a7a7a; margin: 0 0 10px; }
.result textarea {
  width: 100%; box-sizing: border-box;
  background: #f6f5f0; border: 1px solid #d1cec4; border-radius: 6px;
  padding: 14px; font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #1a1a1a; resize: vertical; white-space: pre-wrap;
}
.next { font-size: 12.5px; color: #7a7a7a; margin-top: 10px; }
.link { margin-top: 24px; font-size: 14px; }
.link a { color: #2b3856; }
</style>
