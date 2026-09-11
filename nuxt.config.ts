// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  css: ['~/assets/css/app.css'],
  runtimeConfig: {
    // Server-only (never exposed to the client). Filled from .env at runtime.
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  },
});
