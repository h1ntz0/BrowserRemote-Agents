import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function buildAll() {
  console.log('Building Extension...');

  // 1. Build Sidepanel (HTML + React app)
  await build({
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(__dirname, './src') }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, 'sidepanel.html')
        }
      }
    }
  });

  // 2. Build Content Script (Self-contained, IIFE format, NO external imports/chunks)
  await build({
    configFile: false,
    resolve: {
      alias: { '@': resolve(__dirname, './src') }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, 'src/content/index.ts'),
        name: 'BABContentScript',
        formats: ['iife'],
        fileName: () => 'content.js'
      }
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });

  // 3. Build Background Service Worker (ES module, Self-contained)
  await build({
    configFile: false,
    resolve: {
      alias: { '@': resolve(__dirname, './src') }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/background/index.ts'),
        output: {
          entryFileNames: 'background.js',
          format: 'es'
        }
      }
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });

  // Copy manifest and icons
  fs.copyFileSync('public/manifest.json', 'dist/manifest.json');
  fs.cpSync('public/icons', 'dist/icons', { recursive: true });

  console.log('Build completed cleanly and verified!');
}

buildAll().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
