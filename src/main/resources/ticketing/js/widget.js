let widgetIssues = [];
let widgetProfile = null;
let widgetBusy = false;
const widgetEl = id => document.getElementById(id);

function widgetMessage(message, type = '') {
  widgetEl('widgetStatus').textContent = message;
  widgetEl('widgetStatus').className = type;
}

async function widgetApi(path, body) {
  const token = localStorage.getItem('hd_token');
  if (!token) { window.location.replace('login.html?next=widget'); throw new Error('Please sign in.'); }
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 401) {
    localStorage.removeItem('hd_token');
    localStorage.removeItem('hd_user');
    window.location.replace('login.html?next=widget');
    throw new Error('Your session expired. Please sign in.');
  }
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Unable to complete the request. Please try again.');
  return result.data;
}

function setWidgetOptions(select, placeholder, options) {
  select.replaceChildren(new Option(placeholder, ''));
  options.forEach(option => select.add(new Option(option.name, option.id)));
}

async function changeWidgetHead() {
  widgetEl('subIssue').value = '';
  widgetIssues = [];
  changeWidgetIssue();
  const headId = widgetEl('issueHead').value;
  widgetEl('subIssue').disabled = !headId;
  if (headId) await widgetSubSelector.reset();
  else { widgetSubSelector?.cancel(); setWidgetOptions(widgetEl('subIssue'), 'Select an issue head first', []); }
}

let widgetHeadSelector;
let widgetSubSelector;
function changeWidgetIssue() {
  const issue = selectedWidgetIssue();
  widgetEl('quickSubmit').hidden = !issue;
  widgetEl('issueHint').textContent = issue ? `${issue.priority || 'Medium'} priority · ${issue.description || 'Ready to submit this issue.'}` : '';
  widgetMessage('');
}

function selectedWidgetIssue() {
  return widgetIssues.find(issue => issue.id === widgetEl('subIssue').value && issue.headId === widgetEl('issueHead').value);
}

async function loadWidget() {
  if (widgetBusy) return;
  widgetBusy = true;
  widgetIssues = [];
  widgetEl('issueHead').disabled = true;
  widgetEl('subIssue').disabled = true;
  widgetEl('quickSubmit').hidden = true;
  widgetEl('widgetRetry').hidden = true;
  widgetEl('widgetRefresh').disabled = true;
  widgetEl('issueHint').textContent = '';
  setWidgetOptions(widgetEl('issueHead'), 'Loading issues...', []);
  setWidgetOptions(widgetEl('subIssue'), 'Select an issue head first', []);
  widgetMessage('');
  try {
    widgetProfile = await widgetApi('/api/users/me');
    widgetEl('widgetUser').textContent = `${widgetProfile.name || widgetProfile.username} · ${widgetProfile.department || 'General'}`;
    widgetHeadSelector = remoteSelect('issueHead', '/api/issue-heads', {
      params: () => ({department:widgetProfile.department}), placeholder:'Select an issue head',
      onData: rows => {
        widgetEl('issueHead').disabled = !rows.length && !widgetEl('issueHead').value;
        if (!rows.length) widgetMessage('No matching issue heads. Search again or use the full form.');
      }
    });
    widgetSubSelector = remoteSelect('subIssue', '/api/sub-issues', {
      params: () => ({department:widgetProfile.department, headId:widgetEl('issueHead').value || 'none'}), placeholder:'Select a sub-issue',
      onData: rows => {
        const selected = selectedWidgetIssue();
        widgetIssues = selected && !rows.some(row => row.id === selected.id) ? [selected, ...rows] : rows;
      }
    });
    await widgetHeadSelector.reset();

  } catch (error) {
    widgetMessage(error.message || 'Cannot connect. Please try again.', 'error');
    widgetEl('widgetRetry').hidden = false;
  } finally {
    widgetBusy = false;
    widgetEl('widgetRefresh').disabled = false;
  }
}

async function submitWidgetTicket(event) {
  event.preventDefault();
  if (widgetBusy) return;
  const issue = selectedWidgetIssue();
  if (!issue) { widgetMessage('Select an issue head and a sub-issue first.', 'error'); return; }
  widgetBusy = true;
  ['issueHead', 'subIssue', 'quickSubmit', 'widgetRefresh'].forEach(id => widgetEl(id).disabled = true);
  widgetEl('quickSubmit').textContent = 'Submitting...';
  widgetMessage('');
  try {
    const ticket = await widgetApi('/api/tickets/submit', {
      title: issue.name, message: '', issue: issue.name, issueHead: issue.headName,
      priority: issue.priority || 'Medium', department: widgetProfile.department || null
    });
    widgetEl('issueHead').value = '';
    changeWidgetHead();
    widgetMessage(`Ticket ${ticket.ticketId} submitted successfully.`, 'success');
  } catch (error) {
    widgetMessage(error.message || 'Could not submit. Your selection has been kept.', 'error');
  } finally {
    widgetBusy = false;
    widgetEl('issueHead').disabled = false;
    widgetEl('subIssue').disabled = !widgetEl('issueHead').value;
    widgetEl('quickSubmit').disabled = false;
    widgetEl('widgetRefresh').disabled = false;
    widgetEl('quickSubmit').textContent = 'Submit ticket';
  }
}

document.documentElement.dataset.theme = localStorage.getItem('hd_theme') || 'dark';
widgetEl('issueHead').addEventListener('change', changeWidgetHead);
widgetEl('subIssue').addEventListener('change', changeWidgetIssue);
widgetEl('quickTicketForm').addEventListener('submit', submitWidgetTicket);
widgetEl('widgetRetry').addEventListener('click', loadWidget);
widgetEl('widgetRefresh').addEventListener('click', loadWidget);
void loadWidget();
