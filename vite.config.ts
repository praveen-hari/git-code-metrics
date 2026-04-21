import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Connect } from 'vite';

// Holds the current Gitea base URL — updated at runtime via POST /dev/set-gitea-url
let giteaTarget = '';

function attachMiddlewares(middlewares: import('vite').Connect.Server) {
  // Endpoint: Settings page POSTs the Gitea URL here on save/test
  middlewares.use(
    '/dev/set-gitea-url',
    ((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        try {
          const { url } = JSON.parse(body) as { url: string };
          giteaTarget = url.replace(/\/$/, '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, target: giteaTarget }));
        } catch {
          res.writeHead(400);
          res.end('Bad request');
        }
      });
    }) as Connect.NextHandleFunction,
  );

  // Proxy: all /gitea-api/* → giteaTarget/*
  const proxy = createProxyMiddleware<Connect.IncomingMessage>({
    router: () => giteaTarget || 'http://localhost',
    changeOrigin: true,
    secure: false,           // allow self-signed TLS certs
    followRedirects: true,
    pathRewrite: { '^/gitea-api': '' },
    on: {
      proxyReq(proxyReq, req) {
        const auth = (req as import('http').IncomingMessage).headers['authorization'];
        if (auth) proxyReq.setHeader('Authorization', auth);
        proxyReq.removeHeader('origin');
        proxyReq.removeHeader('referer');
        console.log(`[proxy] ${req.method} ${giteaTarget}${proxyReq.path}`);
      },
      proxyRes(proxyRes, req) {
        if (proxyRes.statusCode === 403) {
          console.warn(`[proxy] 403 Forbidden — ${req.url}`);
          console.warn('[proxy] Check: token permissions (needs read:user, repo scopes) and Gitea allowed hosts config.');
        }
      },
      error(err, _req, res) {
        const r = res as import('http').ServerResponse;
        r.writeHead(502, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify({ error: (err as Error).message }));
      },
    },
  });

  middlewares.use('/gitea-api', proxy as Connect.NextHandleFunction);
}

function giteaDynamicProxy(): import('vite').Plugin {
  return {
    name: 'gitea-dynamic-proxy',
    // Dev server
    configureServer(server) {
      attachMiddlewares(server.middlewares);
    },
    // Preview server (vite preview / local production deployment)
    configurePreviewServer(server) {
      attachMiddlewares(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), giteaDynamicProxy()],
  // In GitHub Actions VITE_BASE_PATH=/git-code-metrics/ is injected by the workflow.
  // Locally it stays '/' so dev and preview work without any path prefix.
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    // Explicitly configure HMR so the browser client connects to the right port
    hmr: {
      port: 5173,
    },
  },
  build: {
    // Target modern browsers — smaller output, faster parse
    target: 'es2020',
    // Raise chunk size warning threshold (recharts is intentionally large)
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split vendor libraries into stable, cacheable chunks
        // Users re-downloading only the chunk that changed between deploys
        manualChunks: (
          (id: string) => {
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
            if (id.includes('@tanstack')) return 'vendor-query';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('react-window') || id.includes('react-virtualized')) return 'vendor-virtual';
            if (id.includes('date-fns') || id.includes('lucide') || id.includes('axios')) return 'vendor-utils';
          }
        ),
      },
    },
  },
});
