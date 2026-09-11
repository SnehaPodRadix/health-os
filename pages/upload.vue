<script setup lang="ts">
// Dev harness for the record-upload → text-extraction step of the Add-record flow.
// FileUpload does all the work client-side and emits the extracted text.
const extracted = ref('');

function onText(text: string) {
  extracted.value = text;
  // Next step in the flow: hand `text` to the analysis/extraction backend
  // (e.g. a future POST /api/records/analyze) to structure it into a record.
}
</script>

<template>
  <main class="wrap">
    <h1>Add a record</h1>
    <p class="note">
      Upload a report, prescription, or scan. We read the text on your device — a
      text PDF is most reliable; for photos use a sharp, well-lit image.
    </p>

    <FileUpload @extracted="onText" />

    <section v-if="extracted" class="result">
      <h2>Extracted text ({{ extracted.length }} chars)</h2>
      <pre>{{ extracted }}</pre>
      <p class="next">Next: this text feeds the analysis step to structure it into a record.</p>
    </section>

    <p class="link"><NuxtLink to="/">← Back to login harness</NuxtLink></p>
  </main>
</template>

<style scoped>
.wrap { max-width: 560px; margin: 56px auto; padding: 0 20px; font-family: system-ui, sans-serif; color: #1a1a1a; }
h1 { font-size: 22px; margin: 0 0 6px; }
.note { color: #7a7a7a; font-size: 13.5px; line-height: 1.5; margin: 0 0 20px; max-width: 480px; }
.result { margin-top: 28px; }
.result h2 { font-size: 14px; color: #555; margin: 0 0 8px; }
.result pre {
  background: #f6f5f0; border: 1px solid #d1cec4; border-radius: 6px;
  padding: 14px; font-size: 12.5px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto;
}
.next { font-size: 12.5px; color: #7a7a7a; margin-top: 10px; }
.link { margin-top: 24px; font-size: 14px; }
.link a { color: #2b3856; }
</style>
