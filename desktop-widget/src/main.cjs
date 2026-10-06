const { app, BrowserWindow, ipcMain, screen, Menu, safeStorage, shell, net, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DEFAULT_SERVER, TicketClient, clampBubble, panelBounds, contains } = require('./core.cjs');
let bubble, panel, client, settings = {}, drag, monitor, outsideAt = 0;
const configPath = () => path.join(app.getPath('userData'), 'widget.json');
function save() {
  const value = {...settings};
  if (client.token && safeStorage.isEncryptionAvailable() && !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
    try { value.session = safeStorage.encryptString(client.token).toString('base64'); } catch { delete value.session; }
  } else delete value.session;
  settings = value;
  try {
    fs.mkdirSync(path.dirname(configPath()), {recursive:true});
    fs.writeFileSync(configPath(), JSON.stringify(value), {mode:0o600});
  } catch { /* Keep the session in memory when local storage is unavailable. */ }
}
function hidePanel() { if (panel && !panel.isDestroyed()) panel.hide(); clearInterval(monitor); monitor = null; }
function positionPanel() { panel.setBounds(panelBounds(bubble.getBounds(), screen.getDisplayMatching(bubble.getBounds()).workArea)); }
function openPanel(focus = false) {
  if (drag || !panel || panel.isDestroyed()) return;
  positionPanel();
  if (focus) { panel.show(); panel.focus(); } else panel.showInactive();
  outsideAt = 0;
  if (!monitor) monitor = setInterval(() => {
    if (!panel.isVisible()) return hidePanel();
    const point = screen.getCursorScreenPoint();
    if (contains(bubble.getBounds(),point,8) || contains(panel.getBounds(),point,8) || panel.isFocused()) outsideAt=0;
    else if (!outsideAt) outsideAt=Date.now();
    else if (Date.now()-outsideAt > 600) hidePanel();
  },100);
}
function makeWindow(file, options) {
  const win = new BrowserWindow({show:false,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,
    ...options, webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.loadFile(path.join(__dirname,file));
  return win;
}
function trusted(event, onlyPanel = false) {
  const windows = onlyPanel ? [panel] : [bubble,panel];
  return windows.some(win => win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === pathToFileURL(path.join(__dirname,win === panel ? 'panel.html' : 'bubble.html')).href);
}
function registerHandlers() {
  const handle = (name, fn) => ipcMain.handle(`widget:${name}`, async (event,data) => {
    if (!trusted(event,true)) return {ok:false,message:'Access denied.'};
    try { return {ok:true,data:await fn(data)}; }
    catch(error) { if (error.code === 'AUTH') { try {save();} catch {} } return {ok:false,message:error.message,code:error.code}; }
  });
  handle('state',async()=>{
    let error;
    if (client.token) { try {await client.profileInfo();} catch (failure) {error=failure.message;save();} }
    return {server:client.server,profile:error ? null : client.profile,error};
  });
  handle('login',async data=>{ const profile=await client.login(data); settings.server=client.server; save(); return profile; });
  handle('logout',()=>{client.token=null;client.profile=null;save();return null;});
  handle('list',data=>client.list(data));
  handle('submit',data=>client.submit(data));
  handle('browser',()=>shell.openExternal(`${client.server}/submit.html`));
  ipcMain.on('widget:open',(event,focus)=>{if(trusted(event))openPanel(focus);});
  ipcMain.on('widget:hide',event=>{if(trusted(event))hidePanel();});
  ipcMain.on('widget:menu',event=>{
    if (!trusted(event)) return;
    Menu.buildFromTemplate([
      {label:'Open ticket widget',click:()=>openPanel(true)},
      {label:'Move icon to bottom right',click:()=>{const area=screen.getPrimaryDisplay().workArea;bubble.setBounds(clampBubble({x:area.x+area.width-84,y:area.y+area.height-100},area));settings.position=bubble.getBounds();save();}},
      {type:'separator'},{label:'Quit HelpDesk Widget',click:()=>app.quit()}
    ]).popup({window:bubble});
  });
  ipcMain.on('widget:drag',(event,phase)=>{
    if (!trusted(event) || event.sender !== bubble.webContents) return;
    if (phase === 'start') {hidePanel();drag={cursor:screen.getCursorScreenPoint(),bounds:bubble.getBounds()};}
    if (phase === 'move' && drag) {const cursor=screen.getCursorScreenPoint();const area=screen.getDisplayNearestPoint(cursor).workArea;bubble.setBounds(clampBubble({x:drag.bounds.x+cursor.x-drag.cursor.x,y:drag.bounds.y+cursor.y-drag.cursor.y},area));}
    if (phase === 'end') {drag=null;settings.position=bubble.getBounds();save();}
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>openPanel(true));
  app.on('open-url',event=>{event.preventDefault();openPanel(true);});
  app.whenReady().then(()=>{
    try {settings=JSON.parse(fs.readFileSync(configPath(),'utf8'));} catch {}
    if (!settings || typeof settings !== 'object') settings={};
    try {client=new TicketClient((url,options)=>net.fetch(url,options),settings.server || DEFAULT_SERVER);} catch {client=new TicketClient((url,options)=>net.fetch(url,options));}
    if (settings.session && safeStorage.isEncryptionAvailable()) {try {client.token=safeStorage.decryptString(Buffer.from(settings.session,'base64'));}catch{}}
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const area=screen.getPrimaryDisplay().workArea;
    if (!settings || typeof settings !== 'object') settings={};
    if (app.isPackaged) app.setAsDefaultProtocolClient('helpdesk-widget');
    const wanted=Number.isFinite(settings.position?.x) && Number.isFinite(settings.position?.y) ? settings.position : {x:area.x+area.width-84,y:area.y+area.height-100};
    const target=screen.getDisplayNearestPoint({x:Math.round(wanted.x),y:Math.round(wanted.y)}).workArea;
    bubble=makeWindow('bubble.html',clampBubble(wanted,target));
    panel=makeWindow('panel.html',{width:370,height:550});
    registerHandlers();
    bubble.once('ready-to-show',()=>bubble.showInactive());
    bubble.on('closed',()=>app.quit());
    panel.on('blur',()=>{outsideAt=Date.now();});
    screen.on('display-removed',()=>{bubble.setBounds(clampBubble(bubble.getBounds(),screen.getPrimaryDisplay().workArea));if(panel.isVisible())positionPanel();});
    if(process.platform === 'darwin') app.dock.hide();
  });
  app.on('before-quit',()=>clearInterval(monitor));
  app.on('window-all-closed',()=>app.quit());
}
