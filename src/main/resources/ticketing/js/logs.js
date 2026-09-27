/**
 * HelpDesk Pro — Activity Logs Logic
 */

function renderActivityLogs() {
  const container = document.getElementById('logList');
  const typeFilter = document.getElementById('logTypeFilter')?.value || '';
  const search = (document.getElementById('logSearch')?.value || '').toLowerCase().trim();

  let logs = getLogs();

  if (typeFilter) {
    logs = logs.filter(l => l.type === typeFilter);
  }
  if (search) {
    logs = logs.filter(l => l.msg.toLowerCase().includes(search));
  }

  const countEl = document.getElementById('logCount');
  if (countEl) countEl.textContent = logs.length;

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">📋</div>
        <p>No activity logs recorded yet.</p>
      </div>`;
    return;
  }

  const logColors = {
    create: 'var(--green)',
    edit: 'var(--accent)',
    delete: 'var(--red)',
    info: 'var(--text3)'
  };

  container.innerHTML = logs.map(l => `
    <div class="log-item">
      <div class="log-dot" style="background:${logColors[l.type] || logColors.info}"></div>
      <div style="flex:1;">
        <div class="log-msg">${esc(l.msg)}</div>
        <div class="log-time">${esc(l.time)}</div>
      </div>
      <span class="badge ${l.type === 'create' ? 'badge-low' : l.type === 'delete' ? 'badge-urgent' : 'badge-medium'}" style="font-size:10px;">
        ${esc(l.type)}
      </span>
    </div>
  `).join('');
}

function handleClearLogs() {
  if (confirm('Clear all local activity logs?')) {
    clearAllLogs();
    renderActivityLogs();
    toast('Activity logs cleared.', 'info');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar('logs');
  renderActivityLogs();
});
