import { StrictMode, useState, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { makeTheme } from './theme';
import App from './App';
import { ModelContext } from './ModelContext';
import type { ModelId } from './types';

declare global {
  interface Window {
    getTheme: () => 'light' | 'dark';
    setTheme: (mode: 'light' | 'dark') => void;
  }
}

function getUrlMode(): 'light' | 'dark' {
  return new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark';
}

function setUrlMode(mode: 'light' | 'dark') {
  const url = new URL(window.location.href);
  url.searchParams.set('theme', mode);
  window.history.replaceState(null, '', url);
}

// eslint-disable-next-line react-refresh/only-export-components
function Root() {
  const [mode, setMode] = useState<'light' | 'dark'>(getUrlMode);
  const [model, setModelState] = useState<ModelId>('claude-haiku-4-5');

  // Keep in sync if the user edits the URL manually (back/forward navigation).
  useEffect(() => {
    const handler = () => setMode(getUrlMode());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const getTheme = useCallback(() => mode, [mode]);

  const setTheme = useCallback((target: 'light' | 'dark') => {
    setMode((prev) => {
      if (prev === target) return prev;
      setUrlMode(target);
      return target;
    });
  }, []);

  useEffect(() => {
    window.getTheme = getTheme;
    window.setTheme = setTheme;
    console.info('[BrowserAgent] extensions mounted: window.getTheme, window.setTheme');
  }, [getTheme, setTheme]);

  return (
    <ModelContext.Provider value={model}>
      <ThemeProvider theme={makeTheme(mode)}>
        <CssBaseline />
        <App mode={mode} onSetTheme={setTheme} model={model} onSetModel={setModelState} />
      </ThemeProvider>
    </ModelContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
