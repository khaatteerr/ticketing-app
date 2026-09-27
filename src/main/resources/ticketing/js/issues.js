/* ================================================================
   issues.js — Issues Management
   Requires: app.js (api, toast, esc, openModal, closeModal, initSidebar, initTheme, checkHealth, user)
================================================================ */

let treeData    = [];   // [{head, subIssues}, …]
let departments = [];   // [{id, name}, …]

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initSidebar('issues');
  checkHealth();

  // Hide "+ Add Issue Head" button if user is not Admin
  if (user && user.role !== 'Admin') {
    const btn = document.getElementById('btnAddHead');
    if (btn) btn.style.display = 'none';
  }

  await loadTreeData();
});

/* ── Data loading ──────────────────────────────────────────── */
async function loadTreeData() {
  const [treeRes, deptRes] = await Promise.all([
    api('/api/issues/tree'),
    api('/api/departments')
  ]);

  treeData = treeRes?.data ?? [];
  departments = deptRes?.data ?? [];

  // Populate department dropdown in Add and Edit Sub modals
  ['subDept', 'editSubDept'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">Select department...</option>';
      departments.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.name;
        opt.textContent = d.name;
        sel.appendChild(opt);
      });
    }
  });

  // Update stats
  const totalSubs = treeData.reduce((sum, n) => sum + (n.subIssues?.length ?? 0), 0);
  const mappedDepts = new Set();
  treeData.forEach(n => (n.subIssues ?? []).forEach(s => mappedDepts.add(s.department)));

  const hEl = document.getElementById('statHeads');
  const sEl = document.getElementById('statSubs');
  const dEl = document.getElementById('statDepts');
  if (hEl) hEl.textContent = treeData.length;
  if (sEl) sEl.textContent = totalSubs;
  if (dEl) dEl.textContent = mappedDepts.size;

  renderTree();
}

/* ── Render tree ───────────────────────────────────────────── */
function renderTree() {
  const q = (document.getElementById('searchInput')?.value ?? '').toLowerCase().trim();
  const container = document.getElementById('treeContainer');
  if (!container) return;

  const isAdmin = user && user.role === 'Admin';

  const filtered = treeData.filter(node => {
    if (!q) return true;
    return node.head.name.toLowerCase().includes(q) ||
           (node.head.description && node.head.description.toLowerCase().includes(q)) ||
           (node.subIssues ?? []).some(s =>
             s.name.toLowerCase().includes(q) ||
             s.department.toLowerCase().includes(q) ||
             (s.priority && s.priority.toLowerCase().includes(q)) ||
             (s.description && s.description.toLowerCase().includes(q))
           );
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="es-icon">🎯</div><p>No issues found matching your criteria</p></div>';
    return;
  }

  container.innerHTML = '';
  const tree = document.createElement('div');
  tree.className = 'issue-tree';

  filtered.forEach(node => {
    const head = node.head;
    const subs = node.subIssues ?? [];

    const card = document.createElement('div');
    card.className = 'head-card';

    card.innerHTML = `
      <div class="head-card-header">
        <div class="head-info">
          <span class="head-icon">${esc(head.icon ?? '📂')}</span>
          <div>
            <div class="head-title">${esc(head.name)}</div>
            ${head.description ? `<div class="head-desc">${esc(head.description)}</div>` : ''}
          </div>
        </div>
        <div class="head-actions">
          ${isAdmin ? `
            <button class="btn btn-ghost btn-sm" onclick="openAddSub('${head.id}','${esc(head.name)}')">+ Sub-Issue</button>
            <button class="btn btn-danger btn-sm" title="Delete head & all sub-issues" onclick="deleteHead('${head.id}','${esc(head.name)}')">🗑</button>
          ` : ''}
        </div>
      </div>
      <div class="sub-list">
        ${subs.length === 0
          ? '<span class="empty-sub">No sub-issues yet for this head.</span>'
          : subs.map(s => `
              <div class="sub-chip">
                <span>${esc(s.name)}</span>
                <span class="dept-badge">🏢 ${esc(s.department)}</span>
                ${priBadge(s.priority || 'Medium')}
                ${isAdmin ? `
                  <button class="edit-btn" title="Edit sub-issue" onclick="openEditSub('${s.id}')">✏️</button>
                  <button class="del-btn" title="Delete sub-issue" onclick="deleteSub('${s.id}','${esc(s.name)}')">✕</button>
                ` : ''}
              </div>
            `).join('')}
      </div>
    `;
    tree.appendChild(card);
  });

  container.appendChild(tree);
}

/* ── Create Issue Head ─────────────────────────────────────── */
async function createHead() {
  const name = document.getElementById('headName').value.trim();
  const icon = document.getElementById('headIcon').value.trim() || '📂';
  const desc = document.getElementById('headDesc').value.trim();

  if (!name) { toast('Head name is required', 'error'); return; }

  const res = await api('/api/issue-heads', 'POST', { name, icon, description: desc });
  if (res?.success) {
    toast('Issue head created!', 'success');
    closeModal('modalAddHead');
    document.getElementById('headName').value = '';
    document.getElementById('headIcon').value = '';
    document.getElementById('headDesc').value = '';
    await loadTreeData();
  } else {
    toast(res?.message || 'Error creating issue head', 'error');
  }
}

/* ── Open Add Sub-Issue modal ──────────────────────────────── */
function openAddSub(headId, headName) {
  document.getElementById('subHeadId').value    = headId;
  document.getElementById('subHeadLabel').value = headName;
  document.getElementById('subName').value      = '';
  document.getElementById('subDesc').value      = '';
  document.getElementById('subDept').value      = '';
  document.getElementById('subPriority').value  = 'Medium';
  openModal('modalAddSub');
}

/* ── Create Sub-Issue ──────────────────────────────────────── */
async function createSub() {
  const headId   = document.getElementById('subHeadId').value;
  const name     = document.getElementById('subName').value.trim();
  const dept     = document.getElementById('subDept').value;
  const priority = document.getElementById('subPriority').value || 'Medium';
  const desc     = document.getElementById('subDesc').value.trim();

  if (!name) { toast('Sub-issue name is required', 'error'); return; }
  if (!dept) { toast('Please select a department', 'error'); return; }

  const res = await api('/api/sub-issues', 'POST', { headId, name, department: dept, priority, description: desc });
  if (res?.success) {
    toast('Sub-issue created!', 'success');
    closeModal('modalAddSub');
    await loadTreeData();
  } else {
    toast(res?.message || 'Error creating sub-issue', 'error');
  }
}

/* ── Open Edit Sub-Issue modal ─────────────────────────────── */
function openEditSub(subId) {
  let foundSub = null;
  let foundHead = null;
  for (const node of treeData) {
    const s = (node.subIssues || []).find(x => x.id === subId);
    if (s) {
      foundSub = s;
      foundHead = node.head;
      break;
    }
  }
  if (!foundSub) return;

  document.getElementById('editSubId').value        = foundSub.id;
  document.getElementById('editSubHeadLabel').value = foundHead ? foundHead.name : (foundSub.headName || '');
  document.getElementById('editSubName').value      = foundSub.name;
  document.getElementById('editSubDept').value      = foundSub.department;
  document.getElementById('editSubPriority').value  = foundSub.priority || 'Medium';
  document.getElementById('editSubDesc').value      = foundSub.description || '';
  openModal('modalEditSub');
}

/* ── Update Sub-Issue ──────────────────────────────────────── */
async function updateSub() {
  const id       = document.getElementById('editSubId').value;
  const name     = document.getElementById('editSubName').value.trim();
  const dept     = document.getElementById('editSubDept').value;
  const priority = document.getElementById('editSubPriority').value || 'Medium';
  const desc     = document.getElementById('editSubDesc').value.trim();

  if (!name) { toast('Sub-issue name is required', 'error'); return; }
  if (!dept) { toast('Please select a department', 'error'); return; }

  const res = await api(`/api/sub-issues/${id}`, 'PUT', { name, department: dept, priority, description: desc });
  if (res?.success) {
    toast('Sub-issue updated!', 'success');
    closeModal('modalEditSub');
    await loadTreeData();
  } else {
    toast(res?.message || 'Error updating sub-issue', 'error');
  }
}

/* ── Delete Issue Head ─────────────────────────────────────── */
async function deleteHead(id, name) {
  if (!confirm(`Delete issue head "${name}" and ALL its sub-issues? This cannot be undone.`)) return;

  const res = await api(`/api/issue-heads/${id}`, 'DELETE');
  if (res?.success) {
    toast('Issue head deleted', 'info');
    await loadTreeData();
  } else {
    toast(res?.message || 'Error deleting issue head', 'error');
  }
}

/* ── Delete Sub-Issue ──────────────────────────────────────── */
async function deleteSub(id, name) {
  if (!confirm(`Delete sub-issue "${name}"?`)) return;

  const res = await api(`/api/sub-issues/${id}`, 'DELETE');
  if (res?.success) {
    toast('Sub-issue deleted', 'info');
    await loadTreeData();
  } else {
    toast(res?.message || 'Error deleting sub-issue', 'error');
  }
}
