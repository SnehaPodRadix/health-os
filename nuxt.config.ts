// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  // sage.css = SAGE design system, app.css = reskin/responsive layer (loads after).
  css: ['~/assets/css/sage.css', '~/assets/css/app.css'],
  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Familjen+Grotesk:ital,wght@0,400;0,500;0,700;1,500&family=Geist:wght@400;500;600&display=swap',
        },
      ],
    },
  },
  runtimeConfig: {
    // Server-only (never exposed to the client). Filled from .env at runtime.
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  },
});
