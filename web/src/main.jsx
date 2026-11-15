import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './pages/Landing.jsx';
import Admin from './pages/Admin.jsx';
import OrderForm from './pages/OrderForm.jsx';
import './styles.css';

// Tiga halaman saja, jadi cukup cek alamat tanpa library router
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const PAGES = {
  '/admin': [Admin, 'Admin · Smart Order'],
  '/pesan': [OrderForm, 'Form pesanan · Smart Order'],
};
const [Page, title] = PAGES[path] || [Landing, 'Smart Order – AI agent pemeriksa pesanan'];
document.title = title;
// Halaman depan dan admin bertema neon gelap; form pesanan untuk pembeli tetap terang
if (Page !== OrderForm) document.body.classList.add('neon-body');

createRoot(document.getElementById('root')).render(
  <StrictMode><Page /></StrictMode>,
);
