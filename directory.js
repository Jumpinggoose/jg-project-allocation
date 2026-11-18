'use strict';
(() => {
  const cfg=window.JG_SUPABASE, sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const root=document.getElementById('directoryRoot');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const fmt=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'Not entered';
  const groups=['POND 1','POND 2','POOL'];
  let employees=[],reporting=[],stateMembers=[],selected=null,search='',groupFilter='All',statusFilter='Active',busy=false;
  const line=(k,v)=>'<div><small>'+esc(k)+'</small><strong>'+esc(v||'Not entered')+'</strong></div>';
  const showError=m=>{root.innerHTML='<div class="jg-person-notice">'+esc(m)+'</div>';};
  const managerName=id=>employees.find(e=>e.member_id===id)?.display_name||stateMembers.find(e=>e.id===id)?.name||id||'Unassigned';
  const managerFor=id=>reporting.find(r=>r.member_id===id)?.manager_member_id||'';
  const teamFor=e=>reporting.find(r=>r.member_id===e.member_id)?.team||stateMembers.find(m=>m.id===e.member_id)?.group||'POOL';
  const statusFor=e=>e.employment_status|| (e.active?'Active':'Exited');
  const matches=e=>(groupFilter==='All'||teamFor(e)===groupFilter)&&(statusFilter==='All'||statusFor(e)===statusFilter)&&[e.display_name,e.member_id,e.title,e.email].join(' ').toLowerCase().includes(search.toLowerCase());
  async function load(){
    const [staff,org,app]=await Promise.all([
      sb.from('user_access').select('member_id,display_name,email,title,joining_date,employment_status,active,access_level,head_group').order('display_name'),
      sb.from('hr_reporting').select('member_id,manager_member_id,team'),
      sb.from('app_state').select('data').eq('id',1).maybeSingle()
    ]);
    for(const r of [staff,org])if(r.error)throw r.error;
    employees=staff.data||[];reporting=org.data||[];stateMembers=app.data?.data?.members||[];
  }
  function list(){
    const shown=employees.filter(matches);
    return '<div class="jg-dir-list">'+(shown.map(e=>{
      const initials=String(e.display_name||e.member_id).split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
      return '<button type="button" class="jg-dir-person" data-member="'+esc(e.member_id)+'"><div class="jg-dir-top"><span class="jg-dir-initials">'+esc(initials)+'</span><div><div class="jg-dir-name">'+esc(e.display_name||e.member_id)+'</div><div class="jg-dir-meta">'+esc(e.title||'Designation not entered')+'</div></div></div><div class="jg-dir-meta">'+esc(e.email||'No email linked')+'</div><div class="jg-dir-details">'+line('Team',teamFor(e))+line('Reports to',managerName(managerFor(e.member_id)))+line('Joined',fmt(e.joining_date))+line('Status',statusFor(e))+'</div></button>';
    }).join('')||'<div class="jg-person-card jg-person-empty">No employees match your filters.</div>')+'</div>';
  }
  function render(){
    const active=employees.filter(e=>e.active&&statusFor(e)!=='Exited').length;
    const incomplete=employees.filter(e=>!e.joining_date||!e.title||e.title==='Employee').length;
    root.innerHTML='<div id="directoryFlash" hidden></div><div class="jg-person-grid"><section class="jg-person-card"><span class="jg-person-muted">Employee records</span><div class="jg-person-big">'+employees.length+'</div></section><section class="jg-person-card"><span class="jg-person-muted">Active employees</span><div class="jg-person-big">'+active+'</div></section><section class="jg-person-card"><span class="jg-person-muted">Profiles to complete</span><div class="jg-person-big">'+incomplete+'</div></section></div>'+
      '<section class="jg-person-card"><div class="jg-dir-toolbar"><div><h2 style="margin:0 0 4px">Employee Directory</h2><p class="jg-dir-subtle" style="margin:0">Review staff details and update designations, joining dates and HR reporting.</p></div><a class="jg-person-button" href="/?view=setup" style="text-decoration:none">+ Add Employee</a></div><p class="jg-dir-subtle">Add an employee through Admin Panel first so Google access, projects and history stay synchronized. Return here to assign their HR reporting team and manager.</p><div class="jg-dir-toolbar"><input id="directorySearch" class="jg-dir-search" type="search" placeholder="Search name, email or designation" value="'+esc(search)+'" aria-label="Search employees"><select id="directoryTeam" aria-label="Filter team">'+['All',...groups].map(t=>'<option value="'+t+'"'+(groupFilter===t?' selected':'')+'>'+t+'</option>').join('')+'</select><select id="directoryStatus" aria-label="Filter employment status">'+['Active','Notice Period','Exited','All'].map(t=>'<option value="'+t+'"'+(statusFilter===t?' selected':'')+'>'+t+'</option>').join('')+'</select></div></section><div id="directoryList">'+list()+'</div><div id="directoryEditor"></div>';
  }
  function editor(id){
    const e=employees.find(x=>x.member_id===id);
    if(!e)return;
    selected=id;
    const team=teamFor(e),manager=managerFor(id);
    const options=employees.filter(x=>x.member_id!==id&&x.active&&statusFor(x)!=='Exited').sort((a,b)=>(a.display_name||'').localeCompare(b.display_name||''));
    const possible=options.filter(x=>{
      let next=x.member_id,visited=new Set([id]);
      for(let i=0;i<employees.length;i++){if(visited.has(next))return false;visited.add(next);next=managerFor(next);if(!next)return true;}
      return false;
    });
    const managerOpts='<option value="">No reporting manager</option>'+possible.map(x=>'<option value="'+esc(x.member_id)+'"'+(manager===x.member_id?' selected':'')+'>'+esc(x.display_name||x.member_id)+'</option>').join('');
    const html='<section class="jg-person-card" id="directoryEditCard"><div class="jg-dir-toolbar"><div><h2 style="margin:0 0 3px">Edit '+esc(e.display_name||id)+'</h2><p class="jg-dir-subtle" style="margin:0">These fields update the official staff and reporting records.</p></div><button class="jg-person-button secondary" type="button" id="directoryClose">Close</button></div><form id="directoryEditForm" class="jg-dir-editor"><div class="jg-dir-fields">'+
      '<label>Full name<input value="'+esc(e.display_name||'')+'" disabled><span class="jg-dir-subtle">Edit name and Google email in Admin Panel.</span></label>'+
      '<label>Work email<input value="'+esc(e.email||'')+'" disabled></label>'+
      '<label>Designation<input name="title" maxlength="100" placeholder="e.g. Visual Designer" value="'+esc(e.title==='Employee'?'':e.title||'')+'"></label>'+
      '<label>Official joining date<input type="date" name="joiningDate" value="'+esc(e.joining_date||'')+'"></label>'+
      '<label>HR reporting team<select name="team">'+groups.map(t=>'<option value="'+t+'"'+(team===t?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
      '<label>Reporting manager<select name="manager">'+managerOpts+'</select></label>'+
      '<label>Employment status<input disabled value="'+esc(statusFor(e))+'"></label>'+
      '<label>App access<input disabled value="'+esc(e.access_level||'employee')+'"></label>'+
      '</div><div class="jg-dir-subtle">HR reporting team and manager are updated here. Project-allocation Pond, name, Google email, employment status, permissions, compensation and employee exit actions remain in Admin Panel. This directory does not change them.</div><div id="directoryEditMessage" role="status"></div><div class="jg-person-actions"><button type="submit" class="jg-person-button">Save employee details</button></div></form></section>';
    document.getElementById('directoryEditor').innerHTML=html;
    document.getElementById('directoryEditCard').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function save(form){
    if(busy||!selected)return;busy=true;
    const button=form.querySelector('[type=submit]');button.disabled=true;
    const msg=document.getElementById('directoryEditMessage');
    try{
      const f=new FormData(form),title=String(f.get('title')||'').trim(),date=String(f.get('joiningDate')||''),team=String(f.get('team')),manager=String(f.get('manager')||'');
      if(title.length>100||(!title&&employees.find(x=>x.member_id===selected)?.title==='Employee'))throw Error('Please enter a designation.');
      if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})))throw Error('Enter a valid joining date.');
      if(!groups.includes(team)||manager===selected)throw Error('Invalid team or reporting manager.');
      if(manager&&(!employees.some(x=>x.member_id===manager&&x.active)))throw Error('Choose an active manager.');
      const current=employees.find(x=>x.member_id===selected);
      const update={title:title||current.title||'Employee',joining_date:date||null,updated_at:new Date().toISOString()};
      const r=await sb.from('user_access').update(update).eq('member_id',selected).select('member_id');
      if(r.error)throw r.error;if(!r.data?.length)throw Error('The employee details were not updated.');
      const previous=reporting.find(x=>x.member_id===selected);
      const changed=!previous||previous.team!==team||(previous.manager_member_id||'')!==manager;
      if(changed){
        const payload={member_id:selected,team,manager_member_id:manager||null,updated_at:new Date().toISOString()};
        const result=await sb.from('hr_reporting').upsert(payload,{onConflict:'member_id'}).select('member_id');
        if(result.error)throw Error('Staff details saved, but reporting update failed: '+result.error.message);
        if(!result.data?.length)throw Error('Staff details saved but reporting did not update.');
      }
      await load();render();
      const flash=document.getElementById('directoryFlash');flash.hidden=false;flash.className='jg-person-message';flash.textContent='Employee details saved.';editor(selected);
    }catch(e){msg.className='jg-person-message error';msg.textContent=e.message||'Could not save employee details.';}
    finally{busy=false;if(button.isConnected)button.disabled=false;}
  }
  root.addEventListener('input',e=>{if(e.target.id==='directorySearch'){search=e.target.value;document.getElementById('directoryList').innerHTML=list();}});
  root.addEventListener('change',e=>{
    if(e.target.id==='directoryTeam'){groupFilter=e.target.value;document.getElementById('directoryList').innerHTML=list();}
    if(e.target.id==='directoryStatus'){statusFilter=e.target.value;document.getElementById('directoryList').innerHTML=list();}
  });
  root.addEventListener('click',e=>{
    const card=e.target.closest('[data-member]');if(card)editor(card.dataset.member);
    if(e.target.id==='directoryClose'){selected=null;document.getElementById('directoryEditor').innerHTML='';}
  });
  root.addEventListener('submit',e=>{if(e.target.id==='directoryEditForm'){e.preventDefault();save(e.target);}});
  async function init(){
    try{
      const auth=await sb.auth.getUser();const user=auth.data?.user;if(!user)return location.replace('/login.html');
      const email=String(user.email||'').toLowerCase();
      const lookup=sb.from('user_access').select('member_id,email,access_level,active,employment_status,display_name');
      const alias={'accounts@jumpinggoose.com':'bhagya','saurabh@jumpinggoose.com':'sourabh','sirajul@jumpinggoose.com':'siraj'}[email];
      const result=await(alias?lookup.eq('member_id',alias):lookup.eq('email',email)).maybeSingle();
      if(result.error)throw result.error;
      const a=result.data;
      if(!a?.active||a.employment_status==='Exited')return location.replace('/login.html');
      // The database RLS is the actual security boundary, not this page check.
      if(a.access_level!=='management'){showError('Employee Directory is available to HR and authorized management accounts only.');return;}
      document.getElementById('personUser').textContent=a.display_name||'Management';
      window.JGNav?.setAccess({level:a.access_level,memberId:a.member_id,email});
      document.getElementById('logoutButton').addEventListener('click',async()=>{await sb.auth.signOut();location.replace('/login.html');});
      document.getElementById('historyBack').addEventListener('click',()=>history.back());
      document.getElementById('historyForward').addEventListener('click',()=>history.forward());
      await load();render();
    }catch(e){console.error(e);showError('Unable to load the directory. '+(e.message||'Please refresh.'));}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();