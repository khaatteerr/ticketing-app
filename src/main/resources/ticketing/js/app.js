/**
 * HelpDesk Pro — Common Application Module
 */

// ══ API CONFIG ══
const API_BASE = (window.location.origin && window.location.origin.startsWith('http'))
  ? window.location.origin
  : 'http://localhost:6080';

// ══ AUTH & STATE ══
const token = localStorage.getItem('hd_token');
const user  = JSON.parse(localStorage.getItem('hd_user') || 'null');

function requireAuth() {
  if (!token || !user) {
    window.location.href = 'login.html';
  }
}
requireAuth();

// ══ API CLIENT ══
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (res.status === 401) {
      doLogout(false);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`API Error [${method} ${path}]:`, err);
    return null;
  }
}

// ══ HEALTH CHECK ══
async function checkHealth() {
  const dot = document.getElementById('apiDot');
  const status = document.getElementById('apiStatus');
  if (!dot || !status) return;

  try {
    const r = await fetch(`${API_BASE}/health`);
    const ok = r.ok;
    dot.className = 'api-dot ' + (ok ? 'online' : 'offline');
    status.textContent = ok ? `Connected — ${API_BASE}` : 'API Offline';
  } catch {
    dot.className = 'api-dot offline';
    status.textContent = 'Cannot reach server';
  }
}

// ══ SIDEBAR & USER DISPLAY ══
function initSidebar(activePage = '') {
  if (user) {
    const sidebarUser = document.getElementById('sidebarUser');
    const sidebarRole = document.getElementById('sidebarRole');
    const avatarInitial = document.getElementById('avatarInitial');

    if (sidebarUser) sidebarUser.textContent = user.name || user.username;
    if (sidebarRole) sidebarRole.textContent = user.role;
    if (avatarInitial) avatarInitial.textContent = (user.name || user.username || 'U').charAt(0).toUpperCase();
  }

  if (activePage) {
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.dataset.page === activePage) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }
}

// ══ THEME ══
function initTheme() {
  const saved = localStorage.getItem('hd_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeUI(saved);
}

function updateThemeUI(theme) {
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  if (label) label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hd_theme', next);
  updateThemeUI(next);
}

// ══ LOGOUT ══
function doLogout(confirmPrompt = true) {
  if (!confirmPrompt || confirm('Log out of HelpDesk Pro?')) {
    localStorage.removeItem('hd_token');
    localStorage.removeItem('hd_user');
    window.location.href = 'login.html';
  }
}

// ══ TOAST NOTIFICATIONS ══
function toast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${esc(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ══ MODALS ══
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ══ UTILITY & ESCAPE HELPERS ══
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function priBadge(p) {
  const m = { Urgent: 'badge-urgent', High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low' };
  return `<span class="badge ${m[p] || 'badge-medium'}">${esc(p)}</span>`;
}

function stBadge(s) {
  const m = {
    'Open': 'badge-open',
    'In Progress': 'badge-inprogress',
    'Pending': 'badge-pending',
    'Resolved': 'badge-resolved',
    'Closed': 'badge-closed'
  };
  return `<span class="badge ${m[s] || 'badge-open'}">${esc(s)}</span>`;
}

function roleBadge(r) {
  const m = { 'Admin': 'badge-admin', 'Support Agent': 'badge-support', 'User': 'badge-user' };
  return `<span class="badge ${m[r] || 'badge-user'}">${esc(r)}</span>`;
}

// ══ ACTIVITY LOGS STORAGE ══
function addLog(msg, type = 'info') {
  try {
    const logs = JSON.parse(localStorage.getItem('hd_logs') || '[]');
    logs.unshift({ msg, type, time: new Date().toLocaleString() });
    if (logs.length > 100) logs.pop();
    localStorage.setItem('hd_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Error saving log:', e);
  }
}

function getLogs() {
  try {
    return JSON.parse(localStorage.getItem('hd_logs') || '[]');
  } catch {
    return [];
  }
}

function clearAllLogs() {
  localStorage.removeItem('hd_logs');
}

// ══ AUTO-INIT ══
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkHealth();
  setInterval(checkHealth, 30000);
});
