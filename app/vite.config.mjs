import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// すべてを1つのHTMLにまとめる（ローカルで直接開ける・アーティファクトとして公開できる）
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: 100000000, cssCodeSplit: false, chunkSizeWarningLimit: 4000 },
});
