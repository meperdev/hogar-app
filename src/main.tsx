import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Evita el gesto nativo de pellizco/zoom en iOS Safari cuando corre como PWA.
if (typeof document !== 'undefined') {
  const bloquearGesto = (evento: Event) => {
    evento.preventDefault();
  };
  for (const tipo of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(tipo, bloquearGesto, { passive: false });
  }
}

const contenedor = document.getElementById('root');

if (!contenedor) {
  throw new Error('Falta el elemento #root en index.html');
}

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
