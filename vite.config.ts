import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { visualizer } from 'rollup-plugin-visualizer'
import type { OutputChunk } from 'rollup'
import tailwindcssPlugin from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'

// Create .env file if it does not exist
if (!fs.existsSync('.env')) {
  fs.copyFileSync('.env_example', '.env')
}

dotenv.config()

// Set default value for POSTS_SERVER_URL if not provided
if (!process.env.VITE_POSTS_SERVER_URL) {
  process.env.VITE_POSTS_SERVER_URL = 'http://127.0.0.1:3000'
}

// Custom plugin to force all CSS to be inlined
const forceCssInline: Plugin = {
  name: 'force-css-inline',
  enforce: 'post',
  generateBundle(options, bundle) {
    // Find all CSS chunks (including processed SCSS and PostCSS)
    const cssAssets = Object.keys(bundle).filter(name => name.endsWith('.css'));
    
    // Find the entry JavaScript chunk
    const entryChunk = Object.values(bundle).find(
      (chunk): chunk is OutputChunk => chunk.type === 'chunk' && 'isEntry' in chunk && chunk.isEntry
    );
    
    if (!entryChunk) return;
    
    // Inject CSS directly into the entry JavaScript
    for (const cssName of cssAssets) {
      const cssAsset = bundle[cssName];
      if (cssAsset.type === 'asset') {
        // Create JS to inject the CSS
        const cssContent = cssAsset.source.toString();
        const cssInjection = `
          (function() {
            var style = document.createElement('style');
            style.textContent = ${JSON.stringify(cssContent)};
            document.head.appendChild(style);
          })();
        `;
        
        // Append to the entry chunk
        entryChunk.code = entryChunk.code + cssInjection;
        
        // Remove the CSS asset
        delete bundle[cssName];
      }
    }
  }
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: process.env.ANALYZE === 'true',
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
    forceCssInline,
    // Middleware to serve the bundle.js in development
    {
      name: 'serve-bundle',
      apply: 'serve',
      configureServer(server) {
        // Build bundle.js on server start
        server.httpServer?.once('listening', () => {
          console.log('Building bundle.js for development server...');
          try {
            // Run the build synchronously
            const { execSync } = require('child_process');
            execSync('yarn build', { stdio: 'inherit' });
            console.log('Bundle successfully built');
          } catch (err) {
            console.error('Failed to build bundle:', err);
          }
        });

        // Serve the bundle.js file
        server.middlewares.use((req, res, next) => {
          if (req.url === '/bundle.js') {
            const bundlePath = path.resolve(__dirname, 'dist/bundle.js');
            
            // Stream the bundle file
            try {
              const stream = fs.createReadStream(bundlePath);
              res.setHeader('Content-Type', 'application/javascript');
              stream.pipe(res);
            } catch (err) {
              console.error('Error serving bundle.js:', err);
              res.statusCode = 500;
              res.end('Error serving bundle.js');
            }
            return;
          }
          next();
        });
      }
    }
  ],
  // CSS preprocessing options
  css: {
    preprocessorOptions: {
      scss: {
        // Add any Sass options if needed
        additionalData: '$primary-color: #4a8bfc;', // Example of injecting global SCSS variables
      },
    },
    // Ensure PostCSS runs on all CSS, including CSS imported in JS
    postcss: {
      plugins: [
        tailwindcssPlugin,
        autoprefixer,
      ],
    },
  },
  // Configure the development server
  server: {
    port: 8080,
    strictPort: true, // Don't try another port if 8080 is in use
    host: true, // Listen on all network interfaces
  },
  build: {
    // Don't extract CSS into separate files
    cssCodeSplit: false,
    // Disable code splitting entirely
    target: 'esnext',
    rollupOptions: {
      input: path.resolve(__dirname, 'src/main.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'bundle.js',
        inlineDynamicImports: true,
      },
    },
    sourcemap: true,
    // Configure Vite to inline assets under this size threshold
    assetsInlineLimit: 100000000, // Basically infinite - force inline all assets
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.scss', '.css'],
  },
})
