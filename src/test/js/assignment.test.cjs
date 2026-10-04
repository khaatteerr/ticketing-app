const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const root = 'src/main/resources/ticketing/';

function harness() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, require('./dom-harness.cjs').element());
    return elements.get(id);
  };
  const calls = [];
  let response = { success: true, data: [] };
  const context = vm.createContext({
    document: { createElement: () => require('./dom-harness.cjs').element(), getElementById: get, addEventListener() {}, documentElement: { setAttribute() {} } },
    window: { location: { origin: 'http://localhost', href: '' } },
    localStorage: { getItem: key => key === 'hd_token' ? 'token' : key === 'hd_user' ? JSON.stringify({ username: 'sam', name: 'Sam', role: 'User' }) : null, setItem() {}, removeItem() {} },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: response.success, status: 200, json: async () => url.endsWith('/api/users/me') ? { success: true, data: { username: 'sam', name: 'Sam', role: 'User' } } : { ...response, pagination: {page:1, pageSize:10, total:response.data?.length || 0, totalPages:1} } }; },
    URLSearchParams, AbortController, console, setTimeout, clearTimeout, setInterval() {},
  });
  return { context, get, calls, respond: value => { response = value; }, run: code => vm.runInContext(code, context) };
}

function dashboard() {
  const h = harness();
  h.run(fs.readFileSync(root + 'js/paging.js', 'utf8'));
  h.run(fs.readFileSync(root + 'js/replies.js', 'utf8'));
  h.run(fs.readFileSync(root + 'js/app.js', 'utf8'));
  h.run(fs.readFileSync(root + 'js/dashboard.js', 'utf8'));
  return h;
}

async function submitPage() {
  const h = harness();
  h.run(fs.readFileSync(root + 'js/paging.js', 'utf8'));
  h.run(fs.readFileSync(root + 'js/replies.js', 'utf8'));
  const html = fs.readFileSync(root + 'submit.html', 'utf8');
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) h.run(match[1]);
  await new Promise(resolve => setImmediate(resolve));
  return h;
}

test('picker requests active matching users from the server and distinguishes duplicate names', async () => {
  const h = dashboard();
  h.respond({success:true, data:[
    {id:'1', username:'sam', name:"Sam O'Neil", active:true},
    {id:'2', username:'sam2', name:"Sam O'Neil", active:true}
  ]});
  h.run(`allTickets = [{id:'ticket', assignedTo:'sam', assignedToName:"Sam O'Neil"}]; currentAssignTicketId = 'ticket';`);
  h.get('assignSearchInput').value = 'sam@example.test';
  await h.run('loadSystemUsers()');
  const query = new URL(h.calls[0].url, 'http://localhost').searchParams;
  assert.equal(query.get('status'), 'active');
  assert.equal(query.get('search'), 'sam@example.test');
  assert.equal(query.get('pageSize'), '20');
  const html = h.get('assignUsersList').innerHTML;
  assert.equal((html.match(/✓ Current/g) || []).length, 1);
  assert.ok(!html.includes('onclick='));
  h.respond({success:true, data:[]});
  await h.run('loadSystemUsers()');
  assert.match(h.get('assignUsersList').innerHTML, /No users matching/);
});

test('assignment sends the selected username and leaves dialog open on error', async () => {
  const h = dashboard();
  h.respond({ success: false, message: 'Inactive user' });
  h.run('toast = () => {}; filterAssignUsers = () => {};');
  await h.run(`assignUser('ticket', 'sam', "Sam O'Neil")`);
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { assignedTo: 'sam' });
  assert.equal(h.calls[0].options.method, 'PUT');
  assert.equal(h.run('assignmentSaving'), false);
});

test('submit page loads submitted and assigned scopes separately and renders empty state', async () => {
  const h = await submitPage();
  assert.ok(h.calls.some(c => c.url.includes('scope=submitted')));
  assert.ok(h.calls.some(c => c.url.includes('scope=assigned')));
  assert.match(h.get('assignedList').innerHTML, /No issues are assigned/);
});

test('assigned section shows issue details safely, including resolved tickets, and handles failure', async () => {
  const h = await submitPage();
  h.respond({ success: true, data: [{ id: '1', ticketId: 'TKT-1', title: '<script>bad</script>', description: 'Fix printer', submittedBy: 'alice', priority: 'High', status: 'Resolved', createdAt: 0 }] });
  await h.run('loadAssignedTickets()');
  const html = h.get('assignedList').innerHTML;
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html, /Fix printer/);
  assert.match(html, /From alice/);
  assert.match(html, /<option selected>Resolved/);
  h.respond({ success: false });
  await h.run('loadAssignedTickets()');
  assert.match(h.get('assignedList').innerHTML, /Failed to load assigned issues/);
});

test('assignee status update sends only status and reports success', async () => {
  const h = await submitPage();
  const feedback = {};
  const badge = {};
  const button = { disabled: false, parentElement: { querySelector: () => feedback }, closest: () => ({ querySelector: () => badge }) };
  h.context.testButton = button;
  h.get('assigned-status-1').value = 'Resolved';
  await h.run("updateAssignedStatus('1', testButton)");
  const call = h.calls.find(c => c.options.method === 'PUT');
  assert.deepEqual(JSON.parse(call.options.body), { status: 'Resolved' });
  assert.equal(feedback.textContent, 'Status updated.');
  assert.match(badge.outerHTML, /Resolved/);
  assert.equal(button.disabled, false);
});
