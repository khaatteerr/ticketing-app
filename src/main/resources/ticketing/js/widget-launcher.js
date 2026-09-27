function openTicketWidget(event) {
  const popup = window.open('widget.html', 'helpdeskQuickTicket', 'popup=yes,width=390,height=520,resizable=yes,scrollbars=yes');
  if (popup) {
    event.preventDefault();
    popup.focus();
  }
  // If popups are blocked, keep the normal link navigation as a fallback.
}
