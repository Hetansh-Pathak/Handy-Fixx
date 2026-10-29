import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Light / Dark / System (default System), remembered in this browser. */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="apnabanda.appearance" disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
