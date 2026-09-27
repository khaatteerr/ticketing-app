/** Browser-to-viewer handoff. No connection credentials are stored or passed. */
function vncAddress(value) {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const parts = ip.split('.');
    if (parts.every(p => Number(p) <= 255 && (p === '0' || !p.startsWith('0')))) {
      return { ip, host: ip };
    }
    return null;
  }
  // Validate IPv6 using the browser's URL parser; reject paths, ports and schemes.
  const bare = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;
  if (!bare.includes(':') || !/^[\da-f:.]+$/i.test(bare)) return null;
  try {
    const host = new URL(`http://[${bare}]/`).hostname;
    return { ip: bare, host };
  } catch {
    return null;
  }
}

function selectVncIp() {
  const input = document.getElementById('vncIp');
  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);
}

async function copyVncIp() {
  const input = document.getElementById('vncIp');
  const value = input.value;
  const status = document.getElementById('vncCopyStatus');
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      copied = true;
    }
  } catch { /* HTTP intranets and denied clipboard permission use the fallback. */ }
  // Do not change a newly opened ticket's dialog when an older copy finishes.
  if (input.value !== value) return;
  if (!copied) {
    selectVncIp();
    try { copied = document.execCommand('copy'); } catch { /* Manual copy remains available. */ }
  }
  status.textContent = copied
    ? 'IP copied. You can paste it into your VNC viewer.'
    : 'Automatic copy is unavailable. Select the IP above and press Ctrl+C (Command+C on Mac).';
}

function openTicketVnc(ticketId) {
  const ticket = allTickets.find(t => t.id === ticketId);
  const address = vncAddress(ticket?.ip);
  if (!address) {
    toast('This ticket does not have a valid IP address for VNC.', 'error');
    return;
  }
  document.getElementById('vncTicketRef').textContent = `${ticket.ticketId} — ${ticket.title}`;
  document.getElementById('vncIp').value = address.ip;
  const primary = document.getElementById('vncLaunchLink');
  primary.href = `com.realvnc.vncviewer.connect://${address.host}`;
  document.getElementById('vncStandardLink').href = `vnc://${address.host}`;
  document.getElementById('vncCopyStatus').textContent = 'Copying IP...';
  document.getElementById('vncLaunchStatus').textContent = 'Allow your browser to open VNC if prompted. If nothing opens, use the options below.';
  openModal('vncModal');
  selectVncIp();
  // Start both operations during the user's click. Awaiting clipboard permission
  // first can lose the browser activation required to open an external app.
  void copyVncIp();
  try {
    primary.click();
  } catch {
    document.getElementById('vncLaunchStatus').textContent = 'The browser blocked opening VNC. Try the Open RealVNC button, or paste the IP into your viewer.';
  }
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('vncModal')?.classList.contains('open')) {
    closeModal('vncModal');
  }
});
