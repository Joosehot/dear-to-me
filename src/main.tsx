import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startNavigation } from './nav';
import './styles.css';

// before the first draw: an old /#/... address is already its path
startNavigation();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
