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

async function loadTickets() {
  const tbody = document.getElementById('ticketBody');
  tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><p>Loading tickets...</p></div></td></tr>`;

  try {
    const res = await api('/api/tickets');
    if (!res || !res.success) {
      tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="es-icon">⚠️</div><p>${esc(res?.message || 'Failed to load tickets')}</p></div></td></tr>`;
      return;
    }

    allTickets = res.data || [];
    addLog('Tickets loaded', 'info');
    populateDepartmentFilter();
    populateDeptSelect();
    await loadSystemUsers();
    renderTable();
    updateStats();
  } catch (err) {
    console.error('Error loading tickets:', err);
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="es-icon">❌</div><p>Failed to connect to ticket service.</p></div></td></tr>`;
  }
}

async function loadSystemUsers() {
  try {
    const res = await api('/api/users');
    assignmentUsersError = !res?.success;
    if (res?.success) {
      systemUsers = res.data || [];
      populateAssignedFilter();
      populateModalAssignedSelect();
    }
  } catch (e) {
    assignmentUsersError = true;
    console.warn('Failed to load system users', e);
  }
}

function populateAssignedFilter() {
  const el = document.getElementById('filterAssigned');
  if (!el) return;
  const current = el.value;
  el.innerHTML = '<option value="">All</option><option value="Unassigned">Unassigned</option>';
  systemUsers.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = `${u.name} (@${u.username})`;
    el.appendChild(opt);
  });
  if (current) el.value = current;
}

function populateModalAssignedSelect() {
  const el = document.getElementById('fAssigned');
  if (!el) return;
  const cur = el.value;
  el.innerHTML = '<option value="Unassigned">Unassigned</option>';
  systemUsers.filter(u => u.active !== false).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = `${u.name} (@${u.username}) [${u.department || 'General'}]`;
    el.appendChild(opt);
  });
  if (cur) el.value = cur;
}

function populateDepartmentFilter() {
  const filterDept = document.getElementById('filterDepartment');
  if (!filterDept) return;
  const current = filterDept.value;
  filterDept.innerHTML = '<option value="">All Departments</option>';

  const deptNames = [...new Set(allTickets.map(t => t.submittedByDepartment).filter(Boolean))].sort();

  deptNames.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    filterDept.appendChild(opt);
  });
  if (current) filterDept.value = current;
}

function populateDeptSelect() {
  const el = document.getElementById('fDepartment');
  if (!el) return;
  const cur = el.value;
  el.innerHTML = '<option value="">Select department...</option>';

  const deptNames = [...new Set([
    ...allTickets.map(t => t.submittedByDepartment).filter(Boolean),
    'General IT Support'
  ])].sort();

  deptNames.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `🏢 ${d}`;
    el.appendChild(opt);
  });
  if (cur) el.value = cur;
}

function getFiltered() {
  const q    = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const pri  = document.getElementById('filterPriority')?.value || '';
  const dept = document.getElementById('filterDepartment')?.value || '';
  const asg  = document.getElementById('filterAssigned')?.value || '';

  return allTickets
    .filter(t =>
      (activeStatus === 'all' || t.status === activeStatus) &&
      (!q || 
        (t.title && t.title.toLowerCase().includes(q)) || 
        (t.ticketId && t.ticketId.toLowerCase().includes(q)) || 
        (t.submittedBy && t.submittedBy.toLowerCase().includes(q)) ||
        (t.submittedByName && t.submittedByName.toLowerCase().includes(q)) ||
        (t.submittedByDepartment && t.submittedByDepartment.toLowerCase().includes(q)) ||
        (t.assignedTo && t.assignedTo.toLowerCase().includes(q)) ||
        (t.assignedToName && t.assignedToName.toLowerCase().includes(q))
      ) &&
      (!pri || t.priority === pri) &&
      (!dept || (t.submittedByDepartment && t.submittedByDepartment.toLowerCase() === dept.toLowerCase())) &&
      (!asg || t.assignedTo === asg || t.assignedToName === asg)
    )
    .sort((a, b) => {
      const va = a[sortField] ?? '';
      const vb = b[sortField] ?? '';
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
}

function renderTable() {
  const n     = parseInt(document.getElementById('entriesCount')?.value) || 10;
  const items = getFiltered();
  const pages = Math.max(1, Math.ceil(items.length / n));
  if (currentPage > pages) currentPage = 1;
  const slice = items.slice((currentPage - 1) * n, currentPage * n);
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

  const start = items.length ? (currentPage - 1) * n + 1 : 0;
  const end   = Math.min(currentPage * n, items.length);
  const infoEl = document.getElementById('tableInfo');
  if (infoEl) {
    infoEl.textContent = items.length
      ? `Showing ${start} to ${end} of ${items.length} entries`
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
    if (!disabled) b.onclick = () => { currentPage = p; renderTable(); };
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
  renderTable();
}

function filterByStatus(s, el) {
  activeStatus = s;
  currentPage = 1;
  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTable();
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
  renderTable();
}

function updateStats() {
  const cnt = s => allTickets.filter(t => t.status === s).length;
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt('cnt-all', allTickets.length);
  setTxt('cnt-open', cnt('Open'));
  setTxt('cnt-inprogress', cnt('In Progress'));
  setTxt('cnt-pending', cnt('Pending'));
  setTxt('cnt-resolved', cnt('Resolved'));
  setTxt('cnt-closed', cnt('Closed'));
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
  document.getElementById('fAssigned').value     = t.assignedTo || 'Unassigned';
  populateDeptSelect();
  setTimeout(() => {
    const deptEl = document.getElementById('fDepartment');
    if (deptEl) deptEl.value = t.submittedByDepartment || t.category || '';
  }, 10);
  openModal('ticketModal');
}

async function saveTicket() {
  const id          = document.getElementById('editTicketId').value;
  const title       = document.getElementById('fTitle').value.trim();
  const department  = document.getElementById('fDepartment').value;
  const priority    = document.getElementById('fPriority').value;
  const status      = document.getElementById('fStatus').value;
  const assignedTo  = document.getElementById('fAssigned').value;
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
  filterAssignUsers();
}

function filterAssignUsers() {
  const t = allTickets.find(x => x.id === currentAssignTicketId);
  const q = (document.getElementById('assignSearchInput')?.value || '').toLowerCase().trim();
  const filtered = systemUsers.filter(u => u.active !== false).filter(u =>
    !q ||
    (u.email && u.email.toLowerCase().includes(q)) ||
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.username && u.username.toLowerCase().includes(q)) ||
    (u.department && u.department.toLowerCase().includes(q))
  );

  const countEl = document.getElementById('assignUsersCount');
  if (countEl) countEl.textContent = `${filtered.length} user${filtered.length !== 1 ? 's' : ''}`;

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
    renderTable();
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
    renderTable();
  } else {
    toast(res?.message || 'Error unassigning ticket', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar('dashboard');
  loadTickets();
});

// Escape closes the assignment dialog and returns focus to its ticket action.
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('modalAssign')?.classList.contains('open')) {
    closeModal('modalAssign');
    document.querySelector(`button[onclick="openAssignModal('${currentAssignTicketId}')"]`)?.focus();
  }
});
