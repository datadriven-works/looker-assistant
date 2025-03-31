import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { visualizer } from 'rollup-plugin-visualizer'
import type { OutputChunk } from 'rollup'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
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

// Plugin to make process.env available in client code
const processEnvPlugin: Plugin = {
  name: 'process-env',
  config() {
    // Load env variables from .env file - required for the side effect
    dotenv.config()

    // Get all environment variables
    const processEnv = { ...process.env }

    // Create a define object for Vite
    return {
      define: {
        'process.env': JSON.stringify(processEnv),
      },
    }
  },
}

// Custom plugin to force all CSS to be inlined
const forceCssInline: Plugin = {
  name: 'force-css-inline',
  enforce: 'post',
  generateBundle(options, bundle) {
    // Find all CSS chunks (including processed SCSS and PostCSS)
    const cssAssets = Object.keys(bundle).filter((name) => name.endsWith('.css'))

    // Find the entry JavaScript chunk
    const entryChunk = Object.values(bundle).find(
      (chunk): chunk is OutputChunk => chunk.type === 'chunk' && 'isEntry' in chunk && chunk.isEntry
    )

    if (!entryChunk) return

    // Inject CSS directly into the entry JavaScript
    for (const cssName of cssAssets) {
      const cssAsset = bundle[cssName]
      if (cssAsset.type === 'asset') {
        // Create JS to inject the CSS
        const cssContent = cssAsset.source.toString()
        const cssInjection = `
          (function() {
            var style = document.createElement('style');
            style.textContent = ${JSON.stringify(cssContent)};
            document.head.appendChild(style);
          })();
        `

        // Append to the entry chunk
        entryChunk.code = entryChunk.code + cssInjection

        // Remove the CSS asset
        delete bundle[cssName]
      }
    }
  },
}

// CORS plugin to ensure CORS is always enabled in development
const corsPlugin: Plugin = {
  name: 'vite-plugin-cors',
  apply: 'serve',
  configureServer(server) {
    // Add CORS headers to all responses in development
    server.middlewares.use((req, res, next) => {
      // Allow requests from any origin in development for easier debugging
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, x-looker-appid'
      )
      res.setHeader('Access-Control-Allow-Credentials', 'true')

      // Handle preflight OPTIONS requests
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      next()
    })
  },
}

// Simple plugin to serve bundle.js for Looker extension development
const lookerBundlePlugin: Plugin = {
  name: 'looker-bundle',
  apply: 'serve',
  configureServer(server) {
    // Build a production bundle to get the compiled code
    server.httpServer?.once('listening', () => {
      console.log('Building production bundle for Looker extension...')
      try {
        execSync('yarn build --mode production', { stdio: 'inherit' })
        console.log('Bundle successfully built - available at http://localhost:8080/bundle.js')
        console.log('To see changes, manually refresh your Looker extension after editing files.')
      } catch (err) {
        console.error('Failed to build bundle:', err)
      }
    })

    // Serve a completely self-contained bundle.js
    server.middlewares.use((req, res, next) => {
      if (req.url === '/bundle.js') {
        console.log('Serving bundle.js for Looker extension')

        const bundlePath = path.resolve(__dirname, 'dist/bundle.js')

        if (!fs.existsSync(bundlePath)) {
          res.statusCode = 404
          res.end(
            'Bundle not found. Please wait for the build to complete or run "yarn build" manually.'
          )
          return
        }

        // Get the host from request headers
        const host = req.headers.host || 'localhost:8080'
        const protocol = req.headers.referer?.startsWith('https') ? 'https' : 'http'
        const fullHostUrl = `${protocol}://${host}`

        try {
          // Read the compiled bundle
          const bundleContent = fs.readFileSync(bundlePath, 'utf8')

          // Set appropriate headers
          res.setHeader('Content-Type', 'application/javascript')
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')

          // Create a wrapper with automatic refresh on changes
          const finalBundle = `
            // Self-contained bundle with auto-refresh for Looker extension
            (function() {
              // The actual compiled application code
              ${bundleContent}
              
              // Setup polling for changes
              let lastModified = ${Date.now()};
              
              // Poll for changes every 2 seconds
              setInterval(function() {
                // Check if bundle has been rebuilt by comparing timestamps - use full URL
                fetch('${fullHostUrl}/bundle-version?ts=' + new Date().getTime())
                  .then(response => response.text())
                  .then(newTimestamp => {
                    const timestamp = parseInt(newTimestamp, 10);
                    if (timestamp > lastModified) {
                      console.log('[HMR] Bundle updated, reloading...');
                      lastModified = timestamp;
                      window.location.reload();
                    }
                  })
                  .catch(err => {
                    console.error('[HMR] Failed to check for updates:', err);
                  });
              }, 2000);
              
              console.log('[HMR] Change detection enabled for Looker extension');
            })();
          `

          res.end(finalBundle)
        } catch (err: any) {
          console.error('Error serving bundle.js:', err)
          res.statusCode = 500
          res.end('Error serving bundle.js: ' + err.message)
        }

        return
      }

      // Serve the bundle version timestamp
      if (req.url?.startsWith('/bundle-version')) {
        const bundlePath = path.resolve(__dirname, 'dist/bundle.js')
        let timestamp = Date.now() // Default to current time

        if (fs.existsSync(bundlePath)) {
          // Get the actual file modification time
          const stats = fs.statSync(bundlePath)
          timestamp = stats.mtimeMs
        }

        res.setHeader('Content-Type', 'text/plain')
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.end(timestamp.toString())
        return
      }

      next()
    })

    // Watch for changes and rebuild the bundle
    const { watcher } = server
    let isRebuilding = false
    let rebuildTimeout: NodeJS.Timeout | null = null

    const rebuildBundle = () => {
      if (isRebuilding) return

      isRebuilding = true
      console.log('Rebuilding bundle.js after changes...')

      try {
        execSync('yarn build --mode production', { stdio: 'inherit' })
        console.log('Bundle successfully rebuilt.')
        console.log('Refresh your Looker extension to see the changes.')
      } catch (err) {
        console.error('Failed to rebuild bundle:', err)
      } finally {
        isRebuilding = false
      }
    }

    watcher.on('change', (filePath) => {
      if (/\.(tsx?|jsx?|css|scss|less|vue)$/.test(filePath)) {
        console.log(`File changed: ${filePath}, scheduling bundle rebuild...`)

        // Clear previous timeout
        if (rebuildTimeout) {
          clearTimeout(rebuildTimeout)
        }

        // Schedule rebuild with debounce
        rebuildTimeout = setTimeout(rebuildBundle, 1000)
      }
    })
  },
}

// Plugin to handle YAML files
const yamlPlugin: Plugin = {
  name: 'yaml-loader',
  transform(code, id) {
    if (id.endsWith('.yaml') || id.endsWith('.yml')) {
      try {
        // Return the YAML as a JS module
        return {
          code: `export default ${JSON.stringify(code)};`,
          map: null,
        }
      } catch (error) {
        console.error('Error processing YAML file:', error)
        return null
      }
    }
  },
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development'

  return {
    plugins: [
      react(),
      processEnvPlugin,
      yamlPlugin,
      visualizer({
        open: process.env.ANALYZE === 'true',
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
      forceCssInline,
      corsPlugin,
      lookerBundlePlugin,
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
        plugins: [tailwindcss, autoprefixer],
      },
    },
    // Configure the development server
    server: {
      port: 8080,
      strictPort: true, // Don't try another port if 8080 is in use
      host: true, // Listen on all network interfaces
      cors: true,
      hmr: true, // Ensure HMR is enabled for regular development
    },
    build: {
      // Don't extract CSS into separate files
      cssCodeSplit: false,
      // Disable code splitting entirely
      target: 'esnext',
      // Conditionally apply minification based on mode
      minify: isDevelopment ? false : 'terser',
      // Configure Terser options for production
      terserOptions: isDevelopment
        ? undefined
        : {
            compress: {
              drop_console: true,
              drop_debugger: true,
            },
          },
      rollupOptions: {
        input: path.resolve(__dirname, 'src/index.tsx'),
        output: {
          // Use appropriate format based on mode
          format: isDevelopment ? 'iife' : 'es',
          entryFileNames: 'bundle.js',
          // Always inline dynamic imports for both dev and prod to maintain compatibility with format
          inlineDynamicImports: true,
        },
      },
      sourcemap: isDevelopment,
      // Configure Vite to inline assets with different thresholds based on mode
      assetsInlineLimit: isDevelopment ? 100000000 : 4096, // Large for dev, 4KB for production
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.scss', '.css'],
    },
  }
})
