const {app,BrowserWindow,net}=require('electron');const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'helpdesk-widget-ui-')));
const headId='123456789012345678901234',issueId='abcdefabcdefabcdefabcdef';let submissions=0;
net.fetch=async(url,options)=>{
 let data,pagination;const address=new URL(url);
 if(address.pathname==='/api/auth/login')data={token:'fixture',user:{username:'sam',name:'Sam Ahmed',department:'IT'}};
 else if(address.pathname==='/api/issue-heads'){data=[{id:headId,name:'Hardware',icon:'◇'},{id:'234567890123456789012345',name:'Software',icon:'✦'}];pagination={page:1,totalPages:1};}
 else if(address.pathname==='/api/sub-issues'){data=[{id:issueId,headId,name:'Keyboard or mouse',headName:'Hardware'}];pagination={page:1,totalPages:1};}
 else if(address.pathname==='/api/tickets/submit'){assert.equal(JSON.parse(options.body).issue,'Keyboard or mouse');submissions++;data={ticketId:'TKT-DEMO-001'};}
 else throw Error('Unexpected fixture URL');
 return new Response(JSON.stringify({success:true,data,pagination}),{status:200,headers:{'Content-Type':'application/json'}});
};
require('../src/main.cjs');
app.whenReady().then(async()=>{await new Promise(r=>setTimeout(r,400));const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));try{
assert.ok(win,'Main process created panel');
const bubble=BrowserWindow.getAllWindows().find(w=>w!==win);
await bubble.webContents.executeJavaScript('document.getElementById("bubble").dispatchEvent(new PointerEvent("pointerenter"))');
await new Promise(r=>setTimeout(r,220));assert.ok(win.isVisible(),'Hover opens native panel');
const run=code=>win.webContents.executeJavaScript(code);
const wait=async expression=>{for(let i=0;i<100;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout: '+expression);};
await wait('!document.getElementById("loginForm").hidden');
await run('document.getElementById("username").value="sam";document.getElementById("password").value="fixture";document.getElementById("loginForm").requestSubmit()');
await wait('document.querySelectorAll(".option").length===2');
await run('document.querySelector(".option").click()');await wait('document.querySelectorAll(".option").length===1');
assert.equal(await run('document.getElementById("selection").hidden'),true);
await run('document.querySelector(".option").click()');assert.equal(await run('document.getElementById("selection").hidden'),false);
win.show();await new Promise(r=>setTimeout(r,500));fs.writeFileSync('/tmp/helpdesk-widget-preview.png',(await win.webContents.capturePage()).toPNG());
await run('document.getElementById("submitTicket").click()');await wait('!document.getElementById("success").hidden');assert.equal(submissions,1);assert.equal(await run('document.getElementById("reference").textContent'),'TKT-DEMO-001');
await run('document.getElementById("another").click()');await wait('document.querySelectorAll(".option").length===2');
await run('document.getElementById("logout").click()');await wait('!document.getElementById("loginForm").hidden');
await run('document.getElementById("collapse").click()');await new Promise(r=>setTimeout(r,50));assert.equal(win.isVisible(),false);
console.log('Electron UI smoke passed: login, head, sub-issue, submit, success, reset, logout.');app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
setTimeout(()=>{console.error('UI smoke timeout');app.exit(1);},20000);
