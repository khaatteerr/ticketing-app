/**
 * HelpDesk Pro — Departments Page Logic
 */

let allDepartments = [];

async function loadDepartmentsData() {
  const grid = document.getElementById('deptGrid');
  grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><p>Loading departments...</p></div>';

  try {
    // Single DB/API call for the entire screen
    const res = await api('/api/departments');

    if (!res || !res.success) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><div class="es-icon">⚠️</div><p>${esc(res?.message || 'Failed to load departments')}</p></div>`;
      return;
    }

    allDepartments = res.data || [];
    renderDepartments();
    updateDeptSummary();
  } catch (err) {
    console.error('Error loading departments:', err);
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><div class="es-icon">❌</div><p>Error connecting to API server.</p></div>';
  }
}

function renderDepartments() {
  const grid = document.getElementById('deptGrid');
  const search = (document.getElementById('deptSearch')?.value || '').toLowerCase().trim();

  const filtered = allDepartments.filter(d =>
    !search || d.name.toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="es-icon">🏢</div>
        <h3>No Departments Found</h3>
        <p style="margin-top: 6px; font-size: 13px; color: var(--text3);">
          ${allDepartments.length === 0 
            ? 'No departments found in MongoDB database.' 
            : 'No departments match your search query.'}
        </p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(d => {
    const ticketCount = d.ticketCount ?? 0;
    const activeTicketCount = d.activeTicketCount ?? 0;
    const memberCount = d.memberCount ?? 0;

    return `
      <div class="dept-card">
        <div class="dept-header">
          <div class="dept-icon">🏢</div>
          <span class="dept-badge">Department</span>
        </div>
        <div class="dept-name">${esc(d.name)}</div>
        <div class="dept-meta">MongoDB Record</div>
        <div class="dept-stats">
          <div class="dept-stat-item">
            <span class="dept-stat-val">${ticketCount}</span>
            <span class="dept-stat-lbl">Tickets</span>
          </div>
          <div class="dept-stat-item">
            <span class="dept-stat-val" style="color: ${activeTicketCount > 0 ? 'var(--yellow)' : 'var(--text)'};">${activeTicketCount}</span>
            <span class="dept-stat-lbl">Active</span>
          </div>
          <div class="dept-stat-item">
            <span class="dept-stat-val">${memberCount}</span>
            <span class="dept-stat-lbl">Members</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateDeptSummary() {
  const countEl = document.getElementById('totalDeptCount');
  if (countEl) countEl.textContent = allDepartments.length;
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar('departments');
  loadDepartmentsData();
});
