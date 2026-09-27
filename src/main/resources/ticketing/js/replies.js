function replyEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderReply(reply) {
  return `<article class="ticket-reply">
    <div class="reply-meta"><strong>${replyEscape(reply.authorName || reply.authorUsername)}</strong> <span>@${replyEscape(reply.authorUsername)} · ${replyEscape(new Date(reply.createdAt).toLocaleString())}</span></div>
    <div class="reply-message">${replyEscape(reply.message)}</div>
  </article>`;
}

function ticketReplies(ticket, currentUser) {
  const replies = ticket.replies || [];
  return `<section class="ticket-replies" data-reply-ticket="${replyEscape(ticket.id)}">
    <h4>Replies <span class="reply-count">(${replies.length})</span></h4>
    <div class="reply-list">${replies.length ? replies.map(renderReply).join('') : '<p class="reply-empty">No replies yet.</p>'}</div>
    ${ticket.assignedTo === currentUser?.username ? `<form class="reply-form">
      <label>Reply to this ticket<textarea name="message" rows="3" maxlength="2000" required placeholder="Write an update for the person who submitted this ticket..."></textarea></label>
      <button type="submit" class="reply-send">Send reply</button>
      <span class="reply-feedback" role="status"></span>
    </form>` : ''}
  </section>`;
}

async function sendTicketReply(form) {
  const section = form.closest('[data-reply-ticket]');
  const input = form.elements.message;
  const button = form.querySelector('button');
  const feedback = form.querySelector('.reply-feedback');
  if (button.disabled) return;
  const message = input.value.trim();
  if (!message || message.length > 2000) {
    feedback.textContent = 'Enter a reply between 1 and 2000 characters.';
    return;
  }
  button.disabled = true;
  input.disabled = true;
  feedback.textContent = 'Sending...';
  try {
    const response = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(section.dataset.replyTicket)}/replies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Could not send reply. Please try again.');
    // Update every visible copy (a user can be both submitter and assignee).
    document.querySelectorAll('[data-reply-ticket]').forEach(target => {
      if (target.dataset.replyTicket !== section.dataset.replyTicket) return;
      target.querySelector('.reply-empty')?.remove();
      const list = target.querySelector('.reply-list');
      list.insertAdjacentHTML('beforeend', renderReply(result.data));
      target.querySelector('.reply-count').textContent = `(${list.querySelectorAll('.ticket-reply').length})`;
    });
    if (typeof allTickets !== 'undefined') {
      const ticket = allTickets.find(t => t.id === section.dataset.replyTicket);
      if (ticket) { ticket.replies = [...(ticket.replies || []), result.data]; renderTable(); }
    }
    input.value = '';
    feedback.textContent = 'Reply sent.';
  } catch (error) {
    feedback.textContent = error.message || 'Could not send reply. Your draft has been kept.';
  } finally {
    button.disabled = false;
    input.disabled = false;
  }
}

document.addEventListener('submit', event => {
  if (event.target.matches('.reply-form')) {
    event.preventDefault();
    void sendTicketReply(event.target);
  }
});
