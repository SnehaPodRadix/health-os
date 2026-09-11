// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      // Saif — Gemini chat feature. Filled from NUXT_PUBLIC_SAIF_GEMINI_API_KEY.
      saifGeminiApiKey: '',
    },
  },
});
