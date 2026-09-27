const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ clipboard, legacyCopy = false, launchThrows = false } = {}) {
  const elements = new Map();
  const calls = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', href: '',
      focus() {}, select() { calls.push('select'); }, setSelectionRange() {},
      click() { calls.push('launch'); if (launchThrows) throw Error('Blocked'); },
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    URL, navigator: { clipboard },
    document: { getElementById: get, addEventListener() {}, execCommand: () => { calls.push('legacyCopy'); return legacyCopy; } },
    allTickets: [{ id: '1', ticketId: 'TKT-1', title: 'Printer', ip: '192.168.1.20' }],
    openModal: id => calls.push(id), toast: msg => calls.push(msg),
  });
  vm.runInContext(fs.readFileSync('src/main/resources/ticketing/js/vnc.js', 'utf8'), context);
  return { run: code => vm.runInContext(code, context), get, calls };
}

test('only IP addresses are accepted, including IPv6 and mapped IPv4', () => {
  const h = setup();
  for (const ip of ['192.168.1.20', ' 10.0.0.2 ', '::1', '[2001:db8::1]', '::ffff:192.168.1.20']) {
    assert.ok(h.run(`vncAddress(${JSON.stringify(ip)})`), ip);
  }
  for (const ip of ['', 'unknown', '999.1.1.1', '01.2.3.4', '1.2.3.4:5900', '1.2.3.4/path', 'javascript:alert(1)', ':::', 'host@1.2.3.4']) {
    assert.equal(h.run(`vncAddress(${JSON.stringify(ip)})`), null, ip);
  }
});

test('launch receives ticket IP immediately while clipboard permission is pending', async () => {
  let finish;
  let copied;
  const h = setup({ clipboard: { writeText: ip => { copied = ip; return new Promise(resolve => { finish = resolve; }); } } });
  h.run("openTicketVnc('1')");
  assert.equal(copied, '192.168.1.20');
  assert.ok(h.calls.includes('launch'));
  assert.equal(h.get('vncLaunchLink').href, 'com.realvnc.vncviewer.connect://192.168.1.20');
  assert.equal(h.get('vncStandardLink').href, 'vnc://192.168.1.20');
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(h.get('vncCopyStatus').textContent, /IP copied/);
});

test('clipboard denial uses legacy copying for HTTP intranets', async () => {
  const h = setup({ clipboard: { writeText: async () => { throw Error('Denied'); } }, legacyCopy: true });
  h.get('vncIp').value = '10.0.0.1';
  await h.run('copyVncIp()');
  assert.ok(h.calls.includes('legacyCopy'));
  assert.match(h.get('vncCopyStatus').textContent, /IP copied/);
});

test('blocked launch and unavailable clipboard retain manual instructions and IP', () => {
  const h = setup({ launchThrows: true });
  h.run("openTicketVnc('1')");
  assert.equal(h.get('vncIp').value, '192.168.1.20');
  assert.match(h.get('vncCopyStatus').textContent, /Ctrl\+C/);
  assert.match(h.get('vncLaunchStatus').textContent, /browser blocked/);
});

test('unavailable app never produces a false success message', () => {
  const h = setup();
  h.run("openTicketVnc('1')");
  assert.match(h.get('vncLaunchStatus').textContent, /If nothing opens/);
});

test('missing or invalid ticket cannot trigger external app', () => {
  const h = setup();
  h.run("openTicketVnc('missing'); allTickets[0].ip = 'javascript:alert(1)'; openTicketVnc('1');");
  assert.ok(!h.calls.includes('launch'));
});
