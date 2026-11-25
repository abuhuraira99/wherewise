import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/martian-mono/400.css';
import '@fontsource/martian-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/landing.css';
import './styles/studio.css';
import './styles/print.css';
import { usePath } from './router';
import { Landing } from './landing/Landing';
import { ErrorBoundary } from './ui/ErrorBoundary';

const Studio = lazy(() => import('./studio/Studio').then((m) => ({ default: m.Studio })));
const Guide = lazy(() => import('./landing/Guide').then((m) => ({ default: m.Guide })));

function App() {
  const path = usePath();
  const page = path.startsWith('/studio') ? <Studio /> : path.startsWith('/guide') ? <Guide /> : <Landing />;
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="boot"><span className="plotting-line" /></div>}>{page}</Suspense>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
