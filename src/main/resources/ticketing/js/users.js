/**
 * HelpDesk Pro — User Management Logic
 */

let allUsers = [];

async function loadUsers() {
  const tbody = document.getElementById('userBody');
  tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>Loading users...</p></div></td></tr>`;

  try {
    const res = await api('/api/users');
    if (!res || !res.success) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="es-icon">⚠️</div><p>${esc(res?.message || 'Access denied or error loading users.')}</p></div></td></tr>`;
      return;
    }
    allUsers = res.data || [];
    renderUsers();
    updateUserStats();
  } catch (err) {
    console.error('Error loading users:', err);
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="es-icon">❌</div><p>Failed to connect to user service.</p></div></td></tr>`;
  }
}

function getFilteredUsers() {
  const q = (document.getElementById('userSearch')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('filterRole')?.value || '';
  const statusFilter = document.getElementById('filterStatus')?.value || '';

  return allUsers.filter(u => {
    const matchesSearch = !q ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.department && u.department.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q));

    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? u.active : !u.active);

    return matchesSearch && matchesRole && matchesStatus;
  });
}

function renderUsers() {
  const tbody = document.getElementById('userBody');
  const filtered = getFilteredUsers();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="es-icon">👥</div><p>No matching users found.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const isSelf = user && (user.username === u.username || user.id === u.id);
    return `
      <tr>
        <td>
          <div style="font-weight:600;display:flex;align-items:center;gap:8px;">
            <span>${esc(u.name || u.username)}</span>
            ${isSelf ? '<span class="badge badge-medium" style="font-size:9px;">You</span>' : ''}
          </div>
          ${u.email ? `<div style="font-size:11px;color:var(--text3);">${esc(u.email)}</div>` : ''}
        </td>
        <td>
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text2);">
            @${esc(u.username)}
          </span>
        </td>
        <td>
          <span style="font-size:12px;color:var(--text2);display:inline-flex;align-items:center;gap:4px;">
            ${u.department ? `🏢 ${esc(u.department)}` : '<span style="color:var(--text3)">Not assigned</span>'}
          </span>
        </td>
        <td>${roleBadge(u.role)}</td>
        <td>
          <span class="badge ${u.active ? 'badge-resolved' : 'badge-closed'}">
            ${u.active ? 'Active' : 'Suspended'}
          </span>
        </td>
        <td>
          ${u.lastDevice || u.lastIp ? `
            <div style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace;line-height:1.6;">
              ${u.lastDevice ? `<div>💻 ${esc(u.lastDevice)}</div>` : ''}
              ${u.lastIp ? `<div style="color:var(--text3);">🌐 ${esc(u.lastIp)}</div>` : ''}
            </div>` : `<span style="color:var(--text3);font-size:12px;">—</span>`}
        </td>
        <td style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;white-space:nowrap;">
          ${fmtDate(u.createdAt)}
        </td>
        <td>
          <div class="actions-cell">
            <button class="icon-btn" title="Edit Role" onclick="openEditUserRole('${u.id}')">✏️</button>
            ${!isSelf ? `
            <button class="icon-btn del" title="Delete User" onclick="deleteUser('${u.id}', '${esc(u.name || u.username)}')">🗑</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateUserStats() {
  const totalEl = document.getElementById('cnt-total-users');
  const adminEl = document.getElementById('cnt-admins');
  const agentEl = document.getElementById('cnt-agents');
  const usersEl = document.getElementById('cnt-standard-users');

  if (totalEl) totalEl.textContent = allUsers.length;
  if (adminEl) adminEl.textContent = allUsers.filter(u => u.role === 'Admin').length;
  if (agentEl) agentEl.textContent = allUsers.filter(u => u.role === 'Support Agent').length;
  if (usersEl) usersEl.textContent = allUsers.filter(u => u.role === 'User').length;
}

function openEditUserRole(id) {
  const target = allUsers.find(u => u.id === id);
  if (!target) return;

  document.getElementById('editUserId').value = target.id;
  document.getElementById('editUserName').textContent = target.name || target.username;
  document.getElementById('editUserHandle').textContent = `@${target.username}`;
  document.getElementById('editUserDept').textContent = target.department || 'None';
  document.getElementById('editUserRole').value = target.role;

  openModal('userRoleModal');
}

async function saveUserRole() {
  const id = document.getElementById('editUserId').value;
  const role = document.getElementById('editUserRole').value;

  if (!id || !role) return;

  const btn = document.getElementById('saveRoleBtn');
  btn.disabled = true;

  try {
    const res = await api(`/api/users/${id}`, 'PUT', { role });
    if (res && res.success) {
      toast('User role updated successfully!', 'success');
      addLog(`Role updated to ${role} for user`, 'edit');
      closeModal('userRoleModal');
      await loadUsers();
    } else {
      toast(res?.message || 'Failed to update user role', 'error');
    }
  } catch (err) {
    toast('An unexpected error occurred', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteUser(id, name) {
  if (!confirm(`Are you sure you want to delete user "${name}"?\nNote: If this user exists in Active Directory, they will be re-synced on the next cycle.`)) {
    return;
  }

  const res = await api(`/api/users/${id}`, 'DELETE');
  if (res && res.success) {
    toast(`User "${name}" deleted.`, 'info');
    addLog(`Deleted user: ${name}`, 'delete');
    await loadUsers();
  } else {
    toast(res?.message || 'Error deleting user', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar('users');
  loadUsers();
});
