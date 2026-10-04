const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { element } = require('./dom-harness.cjs');
const root = 'src/main/resources/ticketing/js/';
function harness(fetcher) {
  const elements = new Map(), calls = [];
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const context = vm.createContext({
    URLSearchParams, AbortController, setTimeout, clearTimeout,
    Option: function(text, value) { this.textContent = text; this.value = value; },
    localStorage: { getItem: key => key === 'hd_user' ? '{"username":"admin","role":"Admin"}' : 'token' },
    document: { getElementById:get, createElement:element, addEventListener(){}, querySelectorAll:()=>[], documentElement:{setAttribute(){}} },
    window: { location:{origin:'http://localhost', pathname:'/index.html'} },
    console,
    fetch: async (url, options) => {
      calls.push({url, options});
      return fetcher ? fetcher(url, options) : {ok:true, json:async()=>({success:true, data:[], pagination:{page:2,pageSize:25,total:63,totalPages:3}, summary:{Admin:3, User:60}})};
    }
  });
  const run = code => vm.runInContext(code, context);
  const load = file => run(fs.readFileSync(root + file, 'utf8'));
  load('paging.js'); load('app.js');
  return {get, run, load, calls, context};
}

test('dashboard sends filters sort and page to API and uses total from database', async () => {
  const h = harness(); h.load('dashboard.js');
  h.get('filterDepartment').value = 'IT & Support'; h.get('filterAssigned').value = 'sam';
  h.get('filterPriority').value = 'High'; h.get('searchInput').value = 'printer'; h.get('entriesCount').value = '25';
  h.run("currentPage=2; activeStatus='Open'; sortField='title'; sortDir=1;");
  await h.run('loadTickets()');
  const query = new URL(h.calls[0].url, 'http://localhost').searchParams;
  for (const [key, value] of Object.entries({page:'2',pageSize:'25',department:'IT & Support',assignedTo:'sam',priority:'High',search:'printer',status:'Open',sort:'title',order:'asc'})) assert.equal(query.get(key), value);
  assert.equal(h.run('ticketMeta.total'), 63);
  assert.equal(h.run('currentPage'), 2);
});

test('user filtering and department search request pages rather than filtering a cache', async () => {
  const u = harness(); u.load('users.js');
  u.get('userSearch').value='sam'; u.get('filterRole').value='User'; u.get('filterStatus').value='active';
  await u.run('loadUsers()');
  const query = new URL(u.calls[0].url, 'http://localhost').searchParams;
  assert.equal(query.get('search'), 'sam'); assert.equal(query.get('role'), 'User'); assert.equal(query.get('status'), 'active');
  assert.equal(u.get('cnt-total-users').textContent, 63);
  const d = harness(); d.load('departments.js'); d.get('deptSearch').value = 'Finance';
  await d.run('loadDepartmentsData()');
  assert.equal(new URL(d.calls[0].url, 'http://localhost').searchParams.get('search'), 'Finance');
  assert.equal(d.get('totalDeptCount').textContent, 63);
});

test('latest response wins even if the network ignores abort', async () => {
  const pending = [];
  const h = harness((url, options) => new Promise(resolve => pending.push({resolve, options})));
  const first = h.run("remotePage('search','/api/users',{search:'a'})");
  const second = h.run("remotePage('search','/api/users',{search:'ab'})");
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve({ok:true,json:async()=>({success:true,data:['new']})});
  assert.equal((await second).data[0], 'new');
  pending[0].resolve({ok:true,json:async()=>({success:true,data:['old']})});
  assert.equal(await first, null);
});

test('pager disables empty navigation and requests next page on click', () => {
  const h = harness(); h.context.pages = [];
  h.run("renderRemotePager('pager',{page:1,pageSize:25,total:60,totalPages:3}, page=>pages.push(page))");
  const children = h.get('pager').children;
  assert.equal(children[0].textContent, '1–25 of 60');
  assert.equal(children[1].disabled, true);
  children[3].onclick();
  assert.equal(h.context.pages[0], 2);
  h.run("renderRemotePager('pager',{page:1,pageSize:25,total:0,totalPages:1}, ()=>{})");
  assert.equal(h.get('pager').children[3].disabled, true);
});

test('remote selectors fetch one bounded page and preserve existing off-page selection', async () => {
  const h = harness(); h.get('deptSelect').value = 'Existing department';
  await h.run("remoteSelect('deptSelect','/api/departments',{value: row=>row.name}).load(2)");
  const query = new URL(h.calls[0].url, 'http://localhost').searchParams;
  assert.equal(query.get('page'), '2'); assert.equal(query.get('pageSize'), '25');
  assert.equal(h.calls.length, 1);
  assert.equal(h.get('deptSelect').value, 'Existing department');
});

test('search debounce collapses rapid keystrokes into one fetch action', async () => {
  const h = harness(); h.context.count = 0;
  h.run('var search = debounce(()=>count++, 10); search(); search(); search();');
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(h.context.count, 1);
});
