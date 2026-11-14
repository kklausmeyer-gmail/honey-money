import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { sourcemap: false },
  plugins: [{
    name: 'development-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      // Vite injects styles and uses a local websocket in development only.
      return html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*");
    },
  }],
});
