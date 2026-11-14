import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './pages/Landing.jsx';
import Admin from './pages/Admin.jsx';
import './styles.css';

// Dua halaman saja, jadi cukup cek alamat tanpa library router
const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin';
document.title = isAdmin ? 'Admin · Smart Order' : 'Smart Order – AI agent pemeriksa pesanan';

createRoot(document.getElementById('root')).render(
  <StrictMode>{isAdmin ? <Admin /> : <Landing />}</StrictMode>,
);
