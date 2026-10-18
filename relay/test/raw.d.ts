// A file's text, imported with Vite's `?raw` (test/routes.test.ts reads
// README.md this way).
declare module '*?raw' {
  const text: string;
  export default text;
}
