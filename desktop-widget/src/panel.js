const $ = id => document.getElementById(id);
let head=null, selected=null, page=1, totalPages=1, generation=0, busy=false, timer, profile;
async function call(action,data){const result=await window.widget[action](data);if(!result.ok){if(result.code==='AUTH')showLogin();throw new Error(result.message);}return result.data;}
function message(text=''){ $('status').textContent=text; }
function showLogin(){clearTimeout(timer);generation++;profile=null;head=null;selected=null;$('ticketView').hidden=true;$('success').hidden=true;$('selection').hidden=true;$('myTickets').hidden=true;$('loginForm').hidden=false;}
function showTickets(user){profile=user;$('loginForm').hidden=true;$('success').hidden=true;$('ticketView').hidden=false;$('myTickets').hidden=false;$('userName').textContent=user.name||user.username;$('initial').textContent=(user.name||user.username).charAt(0).toUpperCase();$('department').textContent=user.department||'General';}
function setBusy(value){busy=value;document.querySelectorAll('input,button').forEach(el=>{if(!['collapse','myTickets'].includes(el.id))el.disabled=value;});if(!value){$('previous').disabled=page<=1;$('next').disabled=page>=totalPages;}}
async function load(){
  const version=++generation;selected=null;$('selection').hidden=true;message('');$('retry').hidden=true;
  $('step').textContent=head?'02 / SUB-ISSUE':'01 / ISSUE HEAD';$('question').textContent=head?head.name:'What needs fixing?';$('back').hidden=!head;$('search').placeholder=head?'Search sub-issues...':'Search issue heads...';
  $('options').replaceChildren();$('options').textContent='Loading...';$('pager').hidden=true;
  try{
    const result=await call('list',{kind:head?'issues':'heads',headId:head?.id,page,search:$('search').value.trim()});
    if(version!==generation)return;
    page=result.pagination.page;totalPages=result.pagination.totalPages;
    $('options').replaceChildren();
    if(!result.data.length)$('options').textContent='No matching issues. Try another search or use the full ticket form.';
    result.data.forEach(item=>{
      const button=document.createElement('button');button.type='button';button.className='option';
      const icon=document.createElement('span');icon.className='option-icon';icon.textContent=head?'•':(item.icon||'◇');
      const name=document.createElement('span');name.className='option-name';name.textContent=item.name;
      const arrow=document.createElement('span');arrow.className='option-arrow';arrow.textContent='→';button.append(icon,name,arrow);
      button.addEventListener('click',()=>{
        if(busy)return;
        if(!head){head=item;page=1;$('search').value='';void load();}
        else{selected=item;document.querySelectorAll('.option').forEach(el=>el.classList.remove('selected'));button.classList.add('selected');$('selectedName').textContent=item.name;$('selection').hidden=false;}
      });$('options').appendChild(button);
    });
    $('pager').hidden=totalPages<=1;$('pageLabel').textContent=`${page} / ${totalPages}`;$('previous').disabled=page<=1;$('next').disabled=page>=totalPages;
  }catch(error){if(version!==generation)return;$('options').replaceChildren();message(error.message);$('retry').hidden=false;}
}
async function boot(){
  try{const state=await call('state');$('server').value=state.server;if(state.error){showLogin();message(state.error);$('retry').hidden=false;return;}if(state.profile){showTickets(state.profile);await load();}else showLogin();}
  catch(error){showLogin();message(error.message);$('retry').hidden=false;}
}
$('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;setBusy(true);message('');
  try{const user=await call('login',{server:$('server').value.trim(),username:$('username').value,password:$('password').value});$('password').value='';head=null;page=1;showTickets(user);await load();}
  catch(error){message(error.message);}finally{setBusy(false);}
});
$('logout').addEventListener('click',async()=>{try{await call('logout');showLogin();message('');}catch(error){message(error.message);}});
$('back').addEventListener('click',()=>{head=null;page=1;$('search').value='';void load();});
$('search').addEventListener('input',()=>{generation++;selected=null;$('selection').hidden=true;clearTimeout(timer);timer=setTimeout(()=>{page=1;void load();},250);});
$('previous').addEventListener('click',()=>{page--;void load();});$('next').addEventListener('click',()=>{page++;void load();});
$('retry').addEventListener('click',()=>{if(profile)void load();else void boot();});
$('another').addEventListener('click',()=>{head=null;selected=null;page=1;$('search').value='';showTickets(profile);void load();});
$('submitTicket').addEventListener('click',async()=>{
  if(busy||!selected)return;setBusy(true);message('');$('submitTicket').textContent='Sending...';
  try{const ticket=await call('submit',{headId:head.id,issueId:selected.id,search:$('search').value.trim(),page});$('ticketView').hidden=true;$('selection').hidden=true;$('success').hidden=false;$('reference').textContent=ticket.ticketId;selected=null;}
  catch(error){message(error.message);}finally{setBusy(false);$('submitTicket').textContent='Submit ticket ↗';}
});
$('collapse').addEventListener('click',()=>window.widget.hide());
$('myTickets').addEventListener('click',()=>{void call('browser').catch(error=>message(error.message));});
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.widget.hide();});
void boot();
