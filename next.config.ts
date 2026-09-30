import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['pdfjs-dist', '@electric-sql/pglite', 'pg', '@wecom/aibot-node-sdk'], outputFileTracingIncludes:{'/api/pdf-worker':['./node_modules/pdfjs-dist/build/pdf.worker.min.mjs']}, poweredByHeader: false, async headers() { return [{ source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'same-origin' }, { key: 'X-Frame-Options', value: 'DENY' }] }]; } };
export default config;
