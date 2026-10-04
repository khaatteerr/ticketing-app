/**
 * HelpDesk Pro — Dashboard & Tickets Logic
 */

let allTickets = [];
let systemUsers = [];
let activeStatus = 'all';
let sortField = 'createdAt';
let sortDir = -1;
let currentPage = 1;
let currentAssignTicketId = null;
let assignmentSaving = false;
let assignmentUsersError = false;

let ticketMeta = { page: 1, pageSize: 25, total: 0, totalPages: 1 };
let ticketStats = {};
let assignmentMeta;
function ticketParams() {
  return { page: currentPage, pageSize: document.getElementById('entriesCount')?.value || 25,
    search: document.getElementById('searchInput')?.value.trim(), status: activeStatus === 'all' ? '' : activeStatus,
    priority: document.getElementById('filterPriority')?.value, department: document.getElementById('filterDepartment')?.value,
    assignedTo: document.getElementById('filterAssigned')?.value, sort: sortField, order: sortDir === -1 ? 'desc' : 'asc' };
}
const searchTickets = debounce(() => changeTicketFilters());
function changeTicketFilters() { currentPage = 1; loadTickets(); }
async function loadTickets() {
  const tbody = document.getElementById('ticketBody');
  tbody.innerHTML = '<tr><td colspan="11">Loading tickets...</td></tr>';
  try {
    const res = await remotePage('tickets', '/api/tickets', ticketParams());
    if (!res) return;
    allTickets = res.data || []; ticketMeta = res.pagination; currentPage = ticketMeta.page;
    renderTable();
    const stats = await remotePage('ticket-stats', '/api/stats');
    if (stats) { ticketStats = stats.data; updateStats(); }
  } catch (error) { tbody.innerHTML = `<tr><td colspan="11">${esc(error.message)}</td></tr>`; }
}
async function loadSystemUsers(page = 1) {
  try {
    const res = await remotePage('assignment-users', '/api/users', { page, pageSize: 20, status: 'active', search: document.getElementById('assignSearchInput')?.value.trim() });
    if (!res) return;
    assignmentUsersError = false; systemUsers = res.data; assignmentMeta = res.pagination;
    filterAssignUsers();
    renderRemotePager('assignPager', assignmentMeta, loadSystemUsers);
  } catch { assignmentUsersError = true; filterAssignUsers(); }
}
const searchAssignUsers = debounce(() => loadSystemUsers(1));
function populateDeptSelect() {} // Remote selectors are initialized once, not per ticket page.
function getFiltered() { return allTickets; } // Exports explicitly contain the current page.
function initTicketSelectors() {
  remoteSelect('filterDepartment', '/api/departments', { value: d => d.name, placeholder: 'All departments' }).load();
  remoteSelect('fDepartment', '/api/departments', { value: d => d.name, placeholder: 'Select department', fixed: [{value:'General IT Support',label:'General IT Support'}] }).load();
  remoteSelect('filterAssigned', '/api/users', { value: u => u.username, label: u => `${u.name} (@${u.username})`, placeholder: 'All users', fixed: [{value:'Unassigned',label:'Unassigned'}] }).load();
  remoteSelect('fAssigned', '/api/users', { params: () => ({status:'active'}), value: u => u.username, label: u => `${u.name} (@${u.username})`, placeholder: 'Select assignee', fixed: [{value:'Unassigned',label:'Unassigned'}] }).load();
}

function renderTable() {
  const n = ticketMeta.pageSize;
  const items = getFiltered();
  const pages = ticketMeta.totalPages;
  if (currentPage > pages) currentPage = 1;
  const slice = items;
  const tbody = document.getElementById('ticketBody');
  if (!tbody) return;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="es-icon">🎫</div><p>No tickets found matching criteria</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(t => `
      <tr>
        <td><span class="ticket-id">${esc(t.ticketId)}</span></td>
        <td><div class="ticket-title">${esc(t.title)}</div>${t.replies?.length ? `<div class="reply-preview" title="Open ticket details to read replies">💬 ${t.replies.length} · ${esc(t.replies[t.replies.length - 1].message)}</div>` : ''}</td>
        <td>
          <div style="font-weight:500;">${esc(t.submittedByName || t.submittedBy)}</div>
          <div style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;">@${esc(t.submittedBy)}</div>
        </td>
        <td>
          <span style="font-size:12px;color:var(--cyan);font-weight:600;display:inline-flex;align-items:center;gap:4px;">
            🏢 ${esc(t.submittedByDepartment || 'General')}
          </span>
        </td>
        <td>
          ${t.issue ? `<span style="font-size:12px;color:var(--primary,#4f7cff);font-weight:500;display:inline-flex;align-items:center;gap:3px;" title="${esc(t.issueHead || '')}">🎯 ${esc(t.issue)}</span>` : '<span style="color:var(--text3);font-size:12px;">—</span>'}
        </td>
        <td>${priBadge(t.priority)}</td>
        <td>${stBadge(t.status)}</td>
        <td>
          <button class="assign-badge-btn ${t.assignedTo && t.assignedTo !== 'Unassigned' ? 'is-assigned' : ''}" onclick="openAssignModal('${t.id}')" title="Click to assign or reassign">
            👤 ${esc(t.assignedToName || t.assignedTo || 'Unassigned')}
          </button>
        </td>
        <td>
          ${t.device || t.ip ? `
            <div style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace;line-height:1.5;">
              ${t.device ? `<div title="${esc(t.device)}">💻 ${esc(t.device)}</div>` : ''}
              ${t.ip ? `<div style="color:var(--text3);">🌐 ${esc(t.ip)}</div>` : ''}
            </div>` : '<span style="color:var(--text3);font-size:12px;">—</span>'}
        </td>
        <td style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;white-space:nowrap">${fmtDate(t.createdAt)}</td>
        <td>
          <div class="actions-cell">
            <button class="icon-btn vnc-ticket-btn" ${vncAddress(t.ip) ? '' : 'disabled'} title="${vncAddress(t.ip) ? 'Copy IP and open VNC' : 'No valid IP available'}" onclick="openTicketVnc('${t.id}')">VNC</button>
            <button class="icon-btn" title="View Ticket" onclick="viewTicket('${t.id}')">👁</button>
            <button class="icon-btn" title="Assign Ticket" onclick="openAssignModal('${t.id}')">👤</button>
            <button class="icon-btn" title="Edit Ticket" onclick="openEditTicket('${t.id}')">✏️</button>
            <button class="icon-btn del" title="Delete Ticket" onclick="deleteTicket('${t.id}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  const start = ticketMeta.total ? (currentPage - 1) * n + 1 : 0;
  const end   = Math.min(currentPage * n, ticketMeta.total);
  const infoEl = document.getElementById('tableInfo');
  if (infoEl) {
    infoEl.textContent = items.length
      ? `Showing ${start} to ${end} of ${ticketMeta.total} entries`
      : 'No entries';
  }

  renderPagination(pages);
}

function renderPagination(pages) {
  const pg = document.getElementById('pagination');
  if (!pg) return;
  pg.innerHTML = '';

  const addPg = (lbl, p, disabled, active) => {
    const b = document.createElement('div');
    b.className = 'page-btn' + (active ? ' active' : '') + (disabled ? ' disabled' : '');
    b.textContent = lbl;
    if (!disabled) b.onclick = () => { currentPage = p; loadTickets(); };
    pg.appendChild(b);
  };

  addPg('«', 1, currentPage === 1);
  addPg('‹', currentPage - 1, currentPage === 1);
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(pages, currentPage + 2); i++) {
    addPg(i, i, false, i === currentPage);
  }
  addPg('›', currentPage + 1, currentPage === pages);
  addPg('»', pages, currentPage === pages);
}

function sortBy(f) {
  if (sortField === f) {
    sortDir *= -1;
  } else {
    sortField = f;
    sortDir = 1;
  }
  currentPage = 1; loadTickets();
}

function filterByStatus(s, el) {
  activeStatus = s;
  currentPage = 1;
  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  currentPage = 1; loadTickets();
}

function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterPriority').value = '';
  document.getElementById('filterDepartment').value = '';
  document.getElementById('filterAssigned').value = '';
  activeStatus = 'all';
  currentPage = 1;
  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
  const allCard = document.querySelector('[data-status="all"]');
  if (allCard) allCard.classList.add('active');
  currentPage = 1; loadTickets();
}

function updateStats() {
  for (const [id, key] of Object.entries({all:'total', open:'open', inprogress:'inProgress', pending:'pending', resolved:'resolved', closed:'closed'})) {
    const element = document.getElementById(`cnt-${id}`); if (element) element.textContent = ticketStats[key] ?? 0;
  }
}

// ══ MODALS: CREATE & EDIT TICKET ══
function openTicketModal() {
  document.getElementById('tmTitle').textContent = '+ Create Ticket';
  document.getElementById('editTicketId').value  = '';
  ['fTitle', 'fDesc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fPriority').value   = 'Medium';
  document.getElementById('fStatus').value     = 'Open';
  document.getElementById('fAssigned').value   = 'Unassigned';
  document.getElementById('fDepartment').value = '';
  populateDeptSelect();
  openModal('ticketModal');
}

function openEditTicket(id) {
  const t = allTickets.find(x => x.id === id);
  if (!t) return;
  document.getElementById('tmTitle').textContent = '✏️ Edit Ticket';
  document.getElementById('editTicketId').value  = t.id;
  document.getElementById('fTitle').value        = t.title;
  document.getElementById('fDesc').value         = t.description || '';
  document.getElementById('fPriority').value     = t.priority;
  document.getElementById('fStatus').value       = t.status;
  setRemoteValue('fAssigned', t.assignedTo || 'Unassigned', t.assignedToName || t.assignedTo || 'Unassigned');
  populateDeptSelect();
  setTimeout(() => {
    const deptEl = document.getElementById('fDepartment');
    if (deptEl) setRemoteValue('fDepartment', t.submittedByDepartment || t.category || '');
  }, 10);
  openModal('ticketModal');
}

async function saveTicket() {
  const id          = document.getElementById('editTicketId').value;
  const title       = document.getElementById('fTitle').value.trim();
  const department  = document.getElementById('fDepartment').value;
  const priority    = document.getElementById('fPriority').value;
  const status      = document.getElementById('fStatus').value;
  const assignedTo  = document.getElementById('fAssigned').value || 'Unassigned';
  const description = document.getElementById('fDesc').value.trim();

  if (!title)      { toast('Title is required', 'error'); return; }
  if (!department) { toast('Department is required', 'error'); return; }

  // Set category to department name so backend validation succeeds
  const category = department;

  let res;
  if (id) {
    const assignedToUser = systemUsers.find(u => u.username === assignedTo);
    const assignedToName = assignedToUser?.name || null;
    res = await api(`/api/tickets/${id}`, 'PUT', { title, description, category, priority, status, assignedTo, assignedToName });
    if (res?.success) {
      addLog(`Ticket updated: ${title}`, 'edit');
      toast('Ticket updated!', 'success');
    }
  } else {
    res = await api('/api/tickets', 'POST', { title, description, category, priority, department, assignedTo });
    if (res?.success) {
      addLog(`Ticket created: ${title}`, 'create');
      toast('Ticket created!', 'success');
    }
  }

  if (res?.success) {
    closeModal('ticketModal');
    await loadTickets();
  } else {
    toast(res?.message || 'Error saving ticket', 'error');
  }
}

async function deleteTicket(id) {
  const t = allTickets.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Delete ticket ${t.ticketId}?`)) return;

  const res = await api(`/api/tickets/${id}`, 'DELETE');
  if (res?.success) {
    addLog(`Ticket deleted: ${t.ticketId}`, 'delete');
    toast('Ticket deleted', 'info');
    await loadTickets();
  } else {
    toast(res?.message || 'Error deleting ticket', 'error');
  }
}

function viewTicket(id) {
  const t = allTickets.find(x => x.id === id);
  if (!t) return;

  document.getElementById('viewTitle').innerHTML = `<span style="font-family:'JetBrains Mono',monospace;color:var(--accent)">${esc(t.ticketId)}</span>`;
  document.getElementById('viewContent').innerHTML = `
    <div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Title</span><span style="font-weight:600">${esc(t.title)}</span></div>
    <div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Submitted By</span><span>${esc(t.submittedByName || t.submittedBy)} (@${esc(t.submittedBy)})</span></div>
    <div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Department</span><span style="color:var(--cyan);font-weight:600;">🏢 ${esc(t.submittedByDepartment || t.category || 'General')}</span></div>
    ${t.issue ? `<div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Issue</span><span style="color:var(--primary,#4f7cff);font-weight:600;">🎯 ${esc(t.issueHead ? t.issueHead + ' › ' : '')}${esc(t.issue)}</span></div>` : ''}
    <div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Priority</span>${priBadge(t.priority)}</div>
    <div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Status</span>${stBadge(t.status)}</div>
    <div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Assigned To</span><span>${esc(t.assignedToName ? `${t.assignedToName} (@${t.assignedTo})` : (t.assignedTo || 'Unassigned'))}</span></div>
    ${t.device || t.ip ? `<div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Device</span><span style="font-family:'JetBrains Mono',monospace;font-size:12px;">💻 ${esc(t.device || '—')}</span></div>` : ''}
    ${t.ip ? `<div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">IP Address</span><span style="font-family:'JetBrains Mono',monospace;font-size:12px;">🌐 ${esc(t.ip)}</span></div>` : ''}
    <div style="display:flex;gap:8px"><span style="min-width:130px;font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600">Created</span><span style="font-family:'JetBrains Mono',monospace;font-size:12px">${fmtDate(t.createdAt)}</span></div>
    <hr style="border:none;border-top:1px solid var(--border)"/>
    <div>
      <div style="font-size:12px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:6px">Description / Message</div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;color:var(--text2);white-space:pre-wrap">${esc(t.description) || '<em>No description provided</em>'}</div>
    </div>
    ${ticketReplies(t, user)}`;

  document.getElementById('viewEditBtn').onclick = () => {
    closeModal('viewModal');
    openEditTicket(id);
  };
  openModal('viewModal');
}

// ══ EXPORT ══
function exportCSV() {
  const rows = [['Ticket ID', 'Title', 'Submitted By', 'Department', 'Issue Head', 'Issue', 'Priority', 'Status', 'Assigned To', 'Device', 'IP Address', 'Created']];
  getFiltered().forEach(t => rows.push([
    t.ticketId,
    t.title,
    t.submittedByName || t.submittedBy,
    t.submittedByDepartment || t.category || '',
    t.issueHead || '',
    t.issue || '',
    t.priority,
    t.status,
    t.assignedTo || '',
    t.device || '',
    t.ip || '',
    fmtDate(t.createdAt)
  ]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  download('tickets.csv', 'text/csv', csv);
  toast('CSV exported!', 'success');
}

function exportJSON() {
  download('tickets.json', 'application/json', JSON.stringify(getFiltered(), null, 2));
  toast('JSON exported!', 'success');
}

function download(fname, mime, data) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = fname;
  a.click();
}

/* ── ASSIGN USER MODAL ── */
async function openAssignModal(ticketId) {
  const t = allTickets.find(x => x.id === ticketId);
  if (!t) return;
  currentAssignTicketId = ticketId;

  document.getElementById('assignTargetTicketId').value = ticketId;
  document.getElementById('assignTicketId').textContent = t.ticketId;
  document.getElementById('assignTicketTitle').textContent = t.title;
  document.getElementById('assignTicketDept').textContent = t.submittedByDepartment ? `🏢 ${t.submittedByDepartment}` : '';
  document.getElementById('assignTicketCurrent').textContent =
    (t.assignedToName || t.assignedTo) && t.assignedTo !== 'Unassigned'
      ? `Currently: ${t.assignedToName || t.assignedTo}`
      : 'Not assigned';
  document.getElementById('assignTicketPriority').innerHTML = priBadge(t.priority);

  document.getElementById('assignSearchInput').value = '';
  openModal('modalAssign');
  document.getElementById('assignSearchInput').focus();
  document.getElementById('assignUsersList').innerHTML = '<div class="empty-state">Loading users...</div>';
  await loadSystemUsers();
}

function filterAssignUsers() {
  const t = allTickets.find(x => x.id === currentAssignTicketId);
  const q = document.getElementById('assignSearchInput')?.value || '';
  const filtered = systemUsers;

  const countEl = document.getElementById('assignUsersCount');
  if (countEl) countEl.textContent = `${assignmentMeta?.total ?? filtered.length} users`;

  const list = document.getElementById('assignUsersList');
  if (!list) return;

  if (assignmentUsersError) {
    list.innerHTML = '<div class="empty-state">Could not load users. Close and reopen this dialog to retry.</div>';
    return;
  }
  if (!filtered.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">No users matching "${esc(q)}"</div>`;
    return;
  }

  list.innerHTML = filtered.map(u => {
    const isCurrent = t && (t.assignedTo === u.username);
    return `
      <button type="button" class="assign-user-card ${isCurrent ? 'current' : ''}" data-user-id="${esc(u.id)}" ${assignmentSaving ? 'disabled' : ''}>
        <div class="assign-user-info">
          <div class="assign-user-avatar">${esc((u.name || u.username).charAt(0).toUpperCase())}</div>
          <div>
            <div class="assign-user-name">${esc(u.name || u.username)}</div>
            <div class="assign-user-meta">
              <span>@${esc(u.username)}</span>
              ${u.department ? `<span>🏢 ${esc(u.department)}</span>` : ''}
              <span>${roleBadge(u.role)}</span>
            </div>
          </div>
        </div>
        ${isCurrent
          ? '<span style="color:var(--green);font-size:11px;font-weight:600;">✓ Current</span>'
          : '<span style="color:var(--text3);font-size:12px;">Assign →</span>'}
      </button>`;
  }).join('');
  list.querySelectorAll('[data-user-id]').forEach(button => {
    button.addEventListener('click', () => {
      const selected = systemUsers.find(u => u.id === button.dataset.userId);
      if (selected) assignUser(currentAssignTicketId, selected.username, selected.name || selected.username);
    });
  });
}

async function assignUser(ticketId, username, name) {
  if (assignmentSaving) return;
  assignmentSaving = true;
  filterAssignUsers();
  const res = await api(`/api/tickets/${ticketId}`, 'PUT', { assignedTo: username });
  assignmentSaving = false;
  filterAssignUsers();
  if (res?.success) {
    const t = allTickets.find(x => x.id === ticketId);
    if (t) { t.assignedTo = username; t.assignedToName = name; }
    toast(`Ticket assigned to ${name}`, 'success');
    addLog(`Ticket assigned to ${name}`, 'edit');
    closeModal('modalAssign');
    loadTickets();
  } else {
    toast(res?.message || 'Error assigning ticket', 'error');
  }
}

async function confirmUnassign() {
  if (!currentAssignTicketId || assignmentSaving) return;
  const ticketId = currentAssignTicketId;
  assignmentSaving = true;
  filterAssignUsers();
  const res = await api(`/api/tickets/${ticketId}`, 'PUT', { assignedTo: 'Unassigned' });
  assignmentSaving = false;
  filterAssignUsers();
  if (res?.success) {
    const t = allTickets.find(x => x.id === ticketId);
    if (t) { t.assignedTo = 'Unassigned'; t.assignedToName = null; }
    toast('Ticket unassigned', 'info');
    closeModal('modalAssign');
    loadTickets();
  } else {
    toast(res?.message || 'Error unassigning ticket', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar('dashboard');
  initTicketSelectors();
  loadTickets();
});

// Escape closes the assignment dialog and returns focus to its ticket action.
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('modalAssign')?.classList.contains('open')) {
    closeModal('modalAssign');
    document.querySelector(`button[onclick="openAssignModal('${currentAssignTicketId}')"]`)?.focus();
  }
});
