import { createRoot } from 'react-dom/client';
import App from './App'

window.addEventListener('DOMContentLoaded', () => {
  const appDiv = document.createElement('div')
  document.body.appendChild(appDiv)
  const root = createRoot(appDiv)
  root.render(<App />)
})