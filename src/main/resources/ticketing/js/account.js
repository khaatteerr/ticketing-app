/**
 * HelpDesk Pro — Account Page Logic
 */

async function loadAccountProfile() {
  let profile = user;

  try {
    const res = await api('/api/users/me');
    if (res && res.success && res.data) {
      profile = res.data;
      // Keep local cache updated
      localStorage.setItem('hd_user', JSON.stringify(profile));
    }
  } catch (err) {
    console.warn('Using cached user profile:', err);
  }

  if (!profile) return;

  const initial = (profile.name || profile.username || 'U').charAt(0).toUpperCase();
  document.getElementById('accAvatar').textContent = initial;
  document.getElementById('accName').textContent = profile.name || profile.username;
  document.getElementById('accRoleBadge').innerHTML = roleBadge(profile.role);
  document.getElementById('accUsername').textContent = profile.username;
  document.getElementById('accEmail').textContent = profile.email || 'None registered in Active Directory';
  document.getElementById('accDept').textContent = profile.department || 'Not assigned';
  document.getElementById('accStatus').innerHTML = profile.active
    ? '<span class="badge badge-resolved">Active</span>'
    : '<span class="badge badge-closed">Suspended</span>';
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar('account');
  loadAccountProfile();
});
