const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/main/resources/ticketing/js/widget.js', 'utf8');
async function setup({ empty = false, failSubmit = false, unauthorized = false } = {}) {
  const elements = new Map();
  const calls = [], redirects = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, require('./dom-harness.cjs').element());
    return elements.get(id);
  };
  const issues = [
    { id: 'a', name: 'Printer', headId: 'hardware', headName: 'Hardware', priority: 'High' },
    { id: 'b', name: 'Login', headId: 'software', headName: 'Software' }
  ];
  const context = vm.createContext({
    URLSearchParams, AbortController, setTimeout, clearTimeout,
    document: { createElement: () => require('./dom-harness.cjs').element(), getElementById: get, documentElement: { dataset: {} } },
    localStorage: { getItem: () => 'token', removeItem() {} },
    window: { location: { pathname:'/widget.html', replace: path => redirects.push(path) } },
    Option: function(text, value) { this.text = text; this.value = value; },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const parsed = new URL(url, 'http://localhost');
      const failed = failSubmit && options.method === 'POST';
      return { status: unauthorized ? 401 : 200, ok: !failed,
        json: async () => ({ success: !failed, message: failed ? 'Unavailable' : '', data: parsed.pathname === '/api/users/me' ? { username: 'sam', name: 'Sam', department: 'IT & Support' } : options.method === 'POST' ? { ticketId: 'TKT-123' } : empty ? [] : parsed.pathname === '/api/issue-heads' ? [{id:'hardware', name:'Hardware'}, {id:'software', name:'Software'}] : issues.filter(i => i.headId === parsed.searchParams.get('headId')), pagination:{page:1,pageSize:25,total:empty ? 0 : 2,totalPages:1} }) };
    },
  });
  vm.runInContext(fs.readFileSync('src/main/resources/ticketing/js/paging.js', 'utf8'), context);
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  const run = code => vm.runInContext(code, context);
  const select = async () => { get('issueHead').value = 'hardware'; await run('changeWidgetHead()'); get('subIssue').value = 'a'; run('changeWidgetIssue()'); };
  return { get, calls, redirects, run, select };
}

test('widget loads department issues, groups heads and reveals submit only after selection', async () => {
  const h = await setup();
  assert.ok(h.calls.some(c => c.url.startsWith('/api/issue-heads?') && new URL(c.url, 'http://localhost').searchParams.get('department') === 'IT & Support'));
  assert.ok(!h.calls.some(c => c.url.startsWith('/api/sub-issues')));
  assert.equal(h.get('issueHead').options.length, 3);
  assert.equal(h.get('quickSubmit').hidden, true);
  await h.select();
  assert.equal(h.get('subIssue').options.length, 2);
  assert.equal(h.get('quickSubmit').hidden, false);
  h.get('issueHead').value = 'software';
  await h.run('changeWidgetHead()');
  assert.equal(h.get('quickSubmit').hidden, true);
  assert.equal(h.get('subIssue').value, '');
});
test('submit uses selected issue and resets with ticket reference; prevents double clicks', async () => {
  const h = await setup();
  await h.select();
  const first = h.run('submitWidgetTicket({preventDefault(){}})');
  const second = h.run('submitWidgetTicket({preventDefault(){}})');
  await Promise.all([first, second]);
  const posts = h.calls.filter(c => c.options.method === 'POST');
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].options.body), { title: 'Printer', message: '', issue: 'Printer', issueHead: 'Hardware', priority: 'High', department: 'IT & Support' });
  assert.match(h.get('widgetStatus').textContent, /TKT-123/);
  assert.equal(h.get('quickSubmit').hidden, true);
});
test('failed submit retains selected issue for retry', async () => {
  const h = await setup({ failSubmit: true });
  await h.select();
  await h.run('submitWidgetTicket({preventDefault(){}})');
  assert.equal(h.get('subIssue').value, 'a');
  assert.equal(h.get('quickSubmit').disabled, false);
  assert.equal(h.get('widgetStatus').className, 'error');
});
test('empty issues give a full-form fallback without submission', async () => {
  const h = await setup({ empty: true });
  assert.equal(h.get('issueHead').disabled, true);
  assert.equal(h.get('quickSubmit').hidden, true);
  assert.match(h.get('widgetStatus').textContent, /full form/);
});
test('expired session returns to widget after login', async () => {
  const h = await setup({ unauthorized: true });
  assert.equal(h.redirects[0], 'login.html?next=widget');
});
test('launcher requests a named compact window and keeps normal link fallback', () => {
  let prevented = false, focused = false;
  const context = vm.createContext({ window: { open: (url, name, features) => {
    assert.equal(url, 'widget.html'); assert.equal(name, 'helpdeskQuickTicket'); assert.match(features, /width=390/);
    return { focus: () => { focused = true; } };
  } }, event: { preventDefault: () => { prevented = true; } } });
  vm.runInContext(fs.readFileSync('src/main/resources/ticketing/js/widget-launcher.js', 'utf8'), context);
  vm.runInContext('openTicketWidget(event)', context);
  assert.ok(prevented && focused);
  prevented = false;
  context.window.open = () => null;
  vm.runInContext('openTicketWidget(event)', context);
  assert.equal(prevented, false);
});
