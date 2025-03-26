import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { visualizer } from 'rollup-plugin-visualizer'
import type { OutputChunk } from 'rollup'
import tailwindcssPlugin from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import { execSync } from 'child_process'

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

// CORS plugin to ensure CORS is always enabled in development
const corsPlugin: Plugin = {
  name: 'vite-plugin-cors',
  apply: 'serve',
  configureServer(server) {
    // Add CORS headers to all responses in development
    server.middlewares.use((req, res, next) => {
      // Allow requests from any origin in development for easier debugging
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-looker-appid');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      // Handle preflight OPTIONS requests
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      
      next();
    });
  }
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  
  return {
    plugins: [
      react(),
      visualizer({
        open: process.env.ANALYZE === 'true',
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
      forceCssInline,
      // Always add CORS plugin in development
      corsPlugin,
      // Middleware to serve the bundle.js in development
      {
        name: 'serve-bundle',
        apply: 'serve',
        configureServer(server) {
          // Build bundle.js on server start with no minification
          server.httpServer?.once('listening', () => {
            console.log('Building bundle.js for development server...');
            try {
              // Run the build synchronously with minify=false
              execSync('yarn build --mode development', { stdio: 'inherit' });
              console.log('Bundle successfully built');
            } catch (err) {
              console.error('Failed to build bundle:', err);
            }
          });
  
          // Set up file watcher to rebuild bundle when files change
          const { watcher } = server;
          watcher.on('change', (path) => {
            // Check if the changed file is a source file we care about
            if (/\.(tsx?|jsx?|css|scss|less|vue)$/.test(path)) {
              console.log(`File changed: ${path}, rebuilding bundle.js...`);
              try {
                // Run the build asynchronously to avoid blocking the HMR
                execSync('yarn build --mode development', { stdio: 'inherit' });
                console.log('Bundle successfully rebuilt');
              } catch (err) {
                console.error('Failed to rebuild bundle:', err);
              }
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
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
      // Set CORS to true to enable it for all origins in development
      cors: true,
    },
    build: {
      // Don't extract CSS into separate files
      cssCodeSplit: false,
      // Disable code splitting entirely
      target: 'esnext',
      // Disable minification for both development and production
      minify: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/index.tsx'),
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
  };
});
