/* ================================================================
   sync.js — Active Directory Synchronization Management
   Requires: app.js (api, toast, esc, fmtDate, initSidebar, initTheme, checkHealth, user)
================================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initSidebar('sync');
  checkHealth();

  if (user && user.role !== 'Admin') {
    const heroBtn = document.getElementById('syncNowBtn');
    if (heroBtn) {
      heroBtn.disabled = true;
      heroBtn.title = 'Admin role required to trigger synchronization';
    }
  }

  await loadAdStatus();
  await loadRecentAdUsers();
});

/* ── Format relative time ──────────────────────────────────── */
function timeAgo(ts) {
  if (!ts) return 'Never';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

/* ── Load AD Status & Config ───────────────────────────────── */
async function loadAdStatus() {
  const res = await api('/api/ad/status');
  if (!res?.success || !res?.data) {
    document.getElementById('syncResultBanner').style.display = 'flex';
    document.getElementById('syncBannerTitle').textContent = 'LDAP Not Available';
    document.getElementById('syncBannerMsg').textContent = res?.message || 'Could not connect to LDAP configuration.';
    return;
  }

  const d = res.data;
  cachedAdStatus = d;

  // Stats
  const statLastSync = document.getElementById('statLastSync');
  const statLastSyncDate = document.getElementById('statLastSyncDate');
  const statTotalUsers = document.getElementById('statTotalUsers');
  const statActiveUsers = document.getElementById('statActiveUsers');
  const statDepts = document.getElementById('statDepts');

  if (statLastSync) statLastSync.textContent = timeAgo(d.lastSyncAt);
  if (statLastSyncDate) statLastSyncDate.textContent = d.lastSyncAt ? fmtDate(d.lastSyncAt) : 'Never synced';
  if (statTotalUsers) statTotalUsers.textContent = d.totalAdUsers;
  if (statActiveUsers) statActiveUsers.textContent = d.activeAdUsers;
  if (statDepts) statDepts.textContent = d.totalDepartments;

  // Configuration
  const cfgHost = document.getElementById('cfgHost');
  const cfgPort = document.getElementById('cfgPort');
  const cfgBaseDn = document.getElementById('cfgBaseDn');
  const cfgInterval = document.getElementById('cfgInterval');

  if (cfgHost) cfgHost.textContent = d.host;
  if (cfgPort) cfgPort.textContent = `${d.port} ${d.useSsl ? '(SSL / LDAPS 🔒)' : '(Standard LDAP)'}`;
  if (cfgBaseDn) cfgBaseDn.textContent = d.baseDn;
  if (cfgInterval) cfgInterval.textContent = `Every ${d.syncMinutes} minutes (Auto)`;

  // Status Badge
  const badge = document.getElementById('adStatusBadge');
  if (badge) {
    if (d.isSyncing) {
      badge.className = 'status-badge syncing';
      badge.textContent = '🔄 Syncing…';
    } else if (d.lastSyncStatus === 'Success') {
      badge.className = 'status-badge success';
      badge.textContent = '● Synced Successfully';
    } else if (d.lastSyncStatus === 'Failed') {
      badge.className = 'status-badge failed';
      badge.textContent = '● Last Sync Failed';
    } else {
      badge.className = 'status-badge idle';
      badge.textContent = '● Scheduled & Idle';
    }
  }

  // Update hero button state if syncing
  setSyncingUI(d.isSyncing);
}

/* ── Trigger Manual Sync ───────────────────────────────────── */
async function triggerSync() {
  setSyncingUI(true);

  const banner = document.getElementById('syncResultBanner');
  if (banner) banner.style.display = 'none';

  try {
    const res = await api('/api/ad/sync', 'POST');

    if (banner) {
      banner.style.display = 'flex';
      const icon = document.getElementById('syncBannerIcon');
      const title = document.getElementById('syncBannerTitle');
      const msg = document.getElementById('syncBannerMsg');

      if (res?.success) {
        icon.textContent = '✅';
        title.textContent = 'Sync Successful';
        msg.textContent = res.message || 'Active Directory synchronization completed successfully.';
        toast('AD sync finished successfully!', 'success');
      } else {
        icon.textContent = '❌';
        title.textContent = 'Sync Failed';
        msg.textContent = res?.message || 'An error occurred during synchronization.';
        toast(res?.message || 'Sync failed', 'error');
      }
    }

    if (res?.data) {
      cachedAdStatus = res.data;
    }
    currentAdTab = 'new';
    await Promise.all([loadAdStatus(), loadRecentAdUsers()]);
    switchAdTab('new');

  } catch (err) {
    toast('Connection error while triggering sync', 'error');
  } finally {
    setSyncingUI(false);
  }
}

function setSyncingUI(isSyncing) {
  const btn = document.getElementById('syncNowBtn');
  const spinner = document.getElementById('syncSpinner');
  const txt = document.getElementById('syncBtnText');

  if (!btn) return;
  btn.disabled = isSyncing;
  if (spinner) spinner.style.display = isSyncing ? 'block' : 'none';
  if (txt) txt.textContent = isSyncing ? 'Syncing with Domain Controller…' : '🔄 Sync AD Now';
}

/* ── State ──────────────────────────────────────────────────── */
let cachedAdStatus = null;
let cachedAdUsers = [];
let currentAdTab = 'new'; // 'new' | 'all'

/* ── Tab Switcher ──────────────────────────────────────────── */
function switchAdTab(tab) {
  currentAdTab = tab;
  const btnNew = document.getElementById('tabNewBtn');
  const btnAll = document.getElementById('tabAllBtn');

  if (tab === 'new') {
    if (btnNew) {
      btnNew.className = 'btn btn-sm';
      btnNew.style.background = 'var(--accent)';
      btnNew.style.color = '#fff';
    }
    if (btnAll) {
      btnAll.className = 'btn btn-sm btn-ghost';
      btnAll.style.background = 'transparent';
      btnAll.style.color = 'var(--text2)';
    }
  } else {
    if (btnAll) {
      btnAll.className = 'btn btn-sm';
      btnAll.style.background = 'var(--accent)';
      btnAll.style.color = '#fff';
    }
    if (btnNew) {
      btnNew.className = 'btn btn-sm btn-ghost';
      btnNew.style.background = 'transparent';
      btnNew.style.color = 'var(--text2)';
    }
  }

  renderAdUsersTable();
}

/* ── Load Recent AD Users ──────────────────────────────────── */
async function loadRecentAdUsers() {
  const tbody = document.getElementById('adUsersBody');
  if (!tbody) return;

  const res = await api('/api/users');
  const allUsers = res?.data ?? [];

  // Filter for AD users sorted by creation / last synced
  cachedAdUsers = allUsers
    .filter(u => u.source === 'AD')
    .sort((a, b) => (b.lastSyncedAt || 0) - (a.lastSyncedAt || 0));

  renderAdUsersTable();
}

function renderAdUsersTable() {
  const tbody = document.getElementById('adUsersBody');
  if (!tbody) return;

  const lastNewUsers = cachedAdStatus?.lastNewUsers ?? [];
  const lastSyncAt = cachedAdStatus?.lastSyncAt ?? 0;

  // Determine which users are "new":
  // 1. Explicitly recorded by the last sync (lastNewUsers), OR
  // 2. Created at the same time as the latest sync (within 60s), OR
  // 3. Fallback: the newest user by createdAt if sync ran
  let newlyAddedList = [];
  if (lastNewUsers.length > 0) {
    const set = new Set(lastNewUsers.map(u => u.toLowerCase()));
    newlyAddedList = cachedAdUsers.filter(u => set.has(u.username.toLowerCase()));
  } else if (lastSyncAt > 0) {
    newlyAddedList = cachedAdUsers.filter(u => Math.abs(u.createdAt - lastSyncAt) < 60000);
  }

  // Update counter badges
  const newCountEl = document.getElementById('newCount');
  const allCountEl = document.getElementById('allCount');
  if (newCountEl) newCountEl.textContent = newlyAddedList.length;
  if (allCountEl) allCountEl.textContent = cachedAdUsers.length;

  const usersToDisplay = (currentAdTab === 'new') ? newlyAddedList : cachedAdUsers;

  if (usersToDisplay.length === 0) {
    if (currentAdTab === 'new') {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state" style="padding:28px 16px;">
              <div style="font-size:24px;margin-bottom:8px;">✨</div>
              <p style="font-weight:600;margin-bottom:4px;color:var(--text1);">No new accounts added in the latest sync.</p>
              <p style="font-size:12px;color:var(--text3);margin-bottom:14px;">All ${cachedAdUsers.length} Active Directory accounts in cache are already up-to-date.</p>
              <button class="btn btn-sm btn-ghost" onclick="switchAdTab('all')">View All Synced Accounts (${cachedAdUsers.length}) →</button>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>No Active Directory users synced yet.</p></div></td></tr>';
    }
    return;
  }

  const newSet = new Set(newlyAddedList.map(u => u.username.toLowerCase()));

  tbody.innerHTML = usersToDisplay.map(u => {
    const isNew = newSet.has(u.username.toLowerCase());
    return `
      <tr style="${isNew ? 'background:rgba(34, 197, 94, 0.04);' : ''}">
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--accent);">
              ${esc(u.username)}
            </span>
            ${isNew ? '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(34,197,94,0.15);color:var(--green);border:1px solid rgba(34,197,94,0.3);">✨ NEW</span>' : ''}
          </div>
        </td>
        <td><strong>${esc(u.name || u.username)}</strong></td>
        <td>
          <span style="font-size:12px;color:var(--cyan);font-weight:600;">
            🏢 ${esc(u.department || 'Not Assigned')}
          </span>
        </td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:${u.active ? 'var(--green)' : 'var(--red)'};font-weight:600;">
            ${u.active ? '● Active' : '○ Inactive'}
          </span>
        </td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text3);">
          ${u.lastSyncedAt ? fmtDate(u.lastSyncedAt) : '—'}
        </td>
      </tr>
    `;
  }).join('');
}
