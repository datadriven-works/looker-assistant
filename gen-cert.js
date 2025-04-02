import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const certsDir = path.join(__dirname, 'certs')

// Create certs directory if it doesn't exist
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true })
}

// Generate self-signed certificate
console.log('Generating self-signed certificate for localhost...')

try {
  // Generate a private key
  execSync('openssl genrsa -out certs/key.pem 2048', { stdio: 'inherit' })

  // Generate a Certificate Signing Request (CSR)
  execSync('openssl req -new -key certs/key.pem -out certs/csr.pem -subj "/CN=localhost"', {
    stdio: 'inherit',
  })

  // Generate a self-signed certificate
  execSync(
    'openssl x509 -req -days 365 -in certs/csr.pem -signkey certs/key.pem -out certs/cert.pem',
    { stdio: 'inherit' }
  )

  console.log('Certificate generated successfully!')
  console.log('You can now start the development server.')
} catch (error) {
  console.error('Error generating certificate:', error)
  process.exit(1)
}
