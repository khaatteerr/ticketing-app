const DEFAULT_SERVER = 'http://192.168.180.48:6080';
function normalizeServer(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Enter the server address only, such as http://192.168.180.48:6080.');
  }
  return url.origin;
}
function clampBubble(bounds, area) {
  return { x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - 64))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - 64))), width:64, height:64 };
}
function panelBounds(bubble, area) {
  const width = Math.min(370, area.width - 16), height = Math.min(550, area.height - 16);
  const onLeft = bubble.x - width - 8 >= area.x;
  return { width, height,
    x: Math.round(Math.max(area.x + 8, Math.min(onLeft ? bubble.x - width - 8 : bubble.x + bubble.width + 8, area.x + area.width - width - 8))),
    y: Math.round(Math.max(area.y + 8, Math.min(bubble.y + bubble.height - height, area.y + area.height - height - 8))) };
}
function contains(bounds, point, pad = 0) {
  return point.x >= bounds.x - pad && point.x <= bounds.x + bounds.width + pad && point.y >= bounds.y - pad && point.y <= bounds.y + bounds.height + pad;
}
class TicketClient {
  constructor(fetcher, server = DEFAULT_SERVER) { this.fetcher = fetcher; this.server = normalizeServer(server); this.token = null; this.profile = null; this.busy = false; }
  async request(path, body, authenticated = true) {
    if (authenticated && !this.token) throw Object.assign(new Error('Please sign in to submit a ticket.'), {code:'AUTH'});
    let response;
    try {
      response = await this.fetcher(`${this.server}${path}`, {
        method: body ? 'POST' : 'GET', redirect:'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type':'application/json', ...(authenticated ? {Authorization:`Bearer ${this.token}`} : {}) },
        ...(body ? {body:JSON.stringify(body)} : {})
      });
    } catch { throw new Error('Cannot reach the ticket server. Check your connection and server address.'); }
    if (response.status === 401 && authenticated) { this.token = null; this.profile = null; throw Object.assign(new Error('Your session expired. Please sign in again.'), {code:'AUTH'}); }
    let result;
    try { result = await response.json(); } catch { throw new Error('The server returned an unexpected response. Check the server address.'); }
    if (!response.ok || !result.success) throw new Error(result.message || 'Request failed. Please try again.');
    return result;
  }
  async login({server, username, password}) {
    this.server = normalizeServer(server); this.token = null; this.profile = null;
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) throw new Error('Enter your username and password.');
    const result = await this.request('/api/auth/login', {username:username.trim(), password}, false);
    if (!result.data?.token || !result.data?.user?.username) throw new Error('The server did not return a valid session.');
    this.token = result.data.token; this.profile = result.data.user;
    return this.profile;
  }
  async profileInfo() { this.profile = (await this.request('/api/users/me')).data; return this.profile; }
  async list({kind, headId, search = '', page = 1}) {
    if (!['heads','issues'].includes(kind)) throw new Error('Unknown list.');
    if (!this.profile) await this.profileInfo();
    const query = new URLSearchParams({page:String(Math.max(1, Math.min(1000000, Math.floor(Number(page)) || 1))), pageSize:'8'});
    if (this.profile.department) query.set('department', this.profile.department);
    if (search) query.set('search', String(search).slice(0,120));
    if (kind === 'issues') { if (!/^[a-f0-9]{24}$/i.test(headId || '')) throw new Error('Choose an issue head first.'); query.set('headId',headId); }
    return this.request(`/api/${kind === 'heads' ? 'issue-heads' : 'sub-issues'}?${query}`);
  }
  async submit({headId, issueId, search = '', page = 1}) {
    if (this.busy) throw new Error('A ticket is already being submitted.');
    this.busy = true;
    try {
      const result = await this.list({kind:'issues',headId,search,page});
      const issue = result.data.find(row => row.id === issueId && row.headId === headId);
      if (!issue) throw new Error('This issue has changed. Please select it again.');
      return (await this.request('/api/tickets/submit', {title:issue.name,message:'',issue:issue.name,issueHead:issue.headName,priority:issue.priority || 'Medium',department:this.profile.department || null})).data;
    } finally { this.busy = false; }
  }
}
module.exports = { DEFAULT_SERVER, normalizeServer, clampBubble, panelBounds, contains, TicketClient };
