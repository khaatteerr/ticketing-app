/* Shared server paging, debounced searches and bounded remote selectors. */
const remoteRequests = new Map();
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
function pageUrl(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) query.set(key, String(value));
  });
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}
async function remotePage(key, path, params = {}) {
  remoteRequests.get(key)?.abort();
  const controller = new AbortController();
  remoteRequests.set(key, controller);
  try {
    const response = await fetch(pageUrl(path, params), {
      headers: { Authorization: `Bearer ${localStorage.getItem('hd_token')}` }, signal: controller.signal
    });
    if (response.status === 401) {
      localStorage.removeItem('hd_token');
      localStorage.removeItem('hd_user');
      window.location.href = window.location.pathname.endsWith('widget.html') ? 'login.html?next=widget' : 'login.html';
      return null;
    }
    const result = await response.json();
    if (remoteRequests.get(key) !== controller) return null;
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load data. Please retry.');
    return result;
  } catch (error) {
    if (error.name === 'AbortError' || remoteRequests.get(key) !== controller) return null;
    throw error;
  }
}
function renderRemotePager(id, meta, onPage) {
  const container = typeof id === 'string' ? document.getElementById(id) : id;
  if (!container) return;
  container.replaceChildren();
  if (!meta) return;
  const { page, totalPages, total, pageSize } = meta;
  const label = document.createElement('span');
  label.textContent = total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 results';
  container.appendChild(label);
  const button = (text, target, disabled) => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = text; el.disabled = disabled; el.onclick = () => onPage(target);
    container.appendChild(el);
  };
  button('Previous', page - 1, page <= 1);
  const current = document.createElement('span'); current.textContent = `${page} / ${totalPages}`; container.appendChild(current);
  button('Next', page + 1, page >= totalPages);
}
const remoteSelectors = new Map();
function setRemoteValue(id, value, label = value) {
  const select = document.getElementById(id);
  if (!select) return;
  if (value && !Array.from(select.options).some(option => option.value === value)) select.add(new Option(label, value));
  select.value = value;
}
function remoteSelect(id, path, { params = () => ({}), value = row => row.id, label = row => row.name, placeholder = 'Select...', fixed = [], onData = () => {} } = {}) {
  if (remoteSelectors.has(id)) return remoteSelectors.get(id);
  const select = document.getElementById(id);
  if (!select) return null;
  const search = document.createElement('input');
  search.type = 'search'; search.placeholder = 'Search options...'; search.setAttribute('aria-label', `Search ${select.labels?.[0]?.textContent || id}`);
  select.before(search);
  const pager = document.createElement('div'); pager.className = 'remote-pager'; select.after(pager);
  let page = 1;
  async function load(next = 1) {
    page = next;
    try {
      const result = await remotePage(`select-${id}`, path, { page, pageSize: 25, search: search.value.trim(), ...params() });
      if (!result) return;
      page = result.pagination.page;
      const selected = select.value;
      const selectedLabel = select.selectedOptions?.[0]?.textContent || selected;
      select.replaceChildren(new Option(placeholder, ''));
      fixed.forEach(item => select.add(new Option(item.label, item.value)));
      result.data.forEach(row => select.add(new Option(label(row), value(row))));
      setRemoteValue(id, selected, selectedLabel);
      onData(result.data);
      renderRemotePager(pager, result.pagination, load);
    } catch (error) {
      pager.textContent = error.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry'; retry.onclick = () => load(page); pager.appendChild(retry);
    }
  }
  search.addEventListener('input', debounce(() => load(1)));
  const result = { load, cancel: () => remoteRequests.get(`select-${id}`)?.abort(), reset: () => { select.value = ''; search.value = ''; return load(1); } };
  remoteSelectors.set(id, result);
  return result;
}
