import {createRoot} from 'react-dom/client';
import {App} from './ui/App';
import './style.css';

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js'));
}
