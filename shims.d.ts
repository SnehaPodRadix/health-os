// Vite `?url` imports resolve to an asset URL string.
declare module '*?url' {
  const src: string;
  export default src;
}
