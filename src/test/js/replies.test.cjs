const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('src/main/resources/ticketing/js/replies.js', 'utf8');
function setup(result = { success: true, data: { authorUsername: 'sam', authorName: 'Sam', message: 'Fixed', createdAt: 1 } }) {
  const calls = [];
  const input = { value: ' Fixed ', disabled: false };
  const button = { disabled: false };
  const feedback = {};
  const sections = [0, 1].map(() => {
    const list = { html: '', insertAdjacentHTML(_, html) { this.html += html; }, querySelectorAll: () => [1] };
    const count = {};
    return { list, count, dataset: { replyTicket: 'ticket' }, querySelector: selector => selector === '.reply-list' ? list : selector === '.reply-count' ? count : null };
  });
  const form = { elements: { message: input }, closest: () => sections[0], querySelector: selector => selector === 'button' ? button : feedback };
  const context = vm.createContext({
    API_BASE: 'http://localhost', token: 'test',
    document: { addEventListener() {}, querySelectorAll: () => sections },
    fetch: async (url, opts) => { calls.push({ url, opts }); return { ok: result.success, json: async () => result }; },
    form,
  });
  vm.runInContext(source, context);
  return { run: code => vm.runInContext(code, context), calls, input, button, feedback, sections };
}
test('reply composer is shown only for the assigned username', () => {
  const h = setup();
  assert.match(h.run("ticketReplies({id:'1', assignedTo:'sam'}, {username:'sam'})"), /reply-form/);
  assert.doesNotMatch(h.run("ticketReplies({id:'1', assignedTo:'sam'}, {username:'alice', name:'Sam'})"), /reply-form/);
  assert.doesNotMatch(h.run("ticketReplies({id:'1', assignedTo:'sam'}, null)"), /reply-form/);
});
test('reply text and author names are escaped and legacy tickets have an empty state', () => {
  const h = setup();
  const html = h.run("renderReply({authorName:'<img>', authorUsername:'<b>', message:'<script>alert(1)</script>\\nDone', createdAt:1})");
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.match(h.run("ticketReplies({id:'1'}, null)"), /No replies yet/);
});
test('send posts only the message and updates both visible copies', async () => {
  const h = setup();
  await h.run('sendTicketReply(form)');
  assert.deepEqual(JSON.parse(h.calls[0].opts.body), { message: 'Fixed' });
  assert.equal(h.calls[0].url, 'http://localhost/api/tickets/ticket/replies');
  assert.ok(h.sections.every(s => s.list.html.includes('Fixed') && s.count.textContent === '(1)'));
  assert.equal(h.input.value, '');
  assert.equal(h.feedback.textContent, 'Reply sent.');
});
test('failed reply keeps the draft and permits retry', async () => {
  const h = setup({ success: false, message: 'Assignment changed' });
  await h.run('sendTicketReply(form)');
  assert.equal(h.input.value, ' Fixed ');
  assert.equal(h.feedback.textContent, 'Assignment changed');
  assert.equal(h.button.disabled, false);
  assert.equal(h.input.disabled, false);
  assert.ok(h.sections.every(s => !s.list.html));
});
test('blank, oversized, and already submitting drafts do not send requests', async () => {
  const h = setup();
  for (const value of ['  ', 'x'.repeat(2001)]) {
    h.input.value = value;
    await h.run('sendTicketReply(form)');
  }
  h.input.value = 'valid';
  h.button.disabled = true;
  await h.run('sendTicketReply(form)');
  assert.equal(h.calls.length, 0);
});
