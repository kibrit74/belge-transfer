import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/shared.css'
import './index.css'
import { AppEntry } from './app-entry.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppEntry />
  </StrictMode>,
)
