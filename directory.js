'use strict';
(() => {
  const cfg=window.JG_SUPABASE, sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const root=document.getElementById('directoryRoot');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const fmt=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'Not entered';
  const groups=['POND 1','POND 2','POOL'];
  let employees=[],reporting=[],stateMembers=[],selected=null,search='',groupFilter='All',statusFilter='Active',busy=false,profileTab='overview',profileBusy=false,profileData={assets:[],tasks:[],attendance:[],leaves:[],logs:[]},profileMonth=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}).slice(0,7);
  const line=(k,v)=>'<div><small>'+esc(k)+'</small><strong>'+esc(v||'Not entered')+'</strong></div>';
  const showError=m=>{root.innerHTML='<div class="jg-person-notice">'+esc(m)+'</div>';};
  const managerName=id=>employees.find(e=>e.member_id===id)?.display_name||stateMembers.find(e=>e.id===id)?.name||id||'Unassigned';
  const managerFor=id=>reporting.find(r=>r.member_id===id)?.manager_member_id||'';
  const teamFor=e=>stateMembers.find(m=>m.id===e.member_id)?.group||reporting.find(r=>r.member_id===e.member_id)?.team||'POOL';
  const statusFor=e=>e.employment_status|| (e.active?'Active':'Exited');
  const matches=e=>(groupFilter==='All'||teamFor(e)===groupFilter)&&(statusFilter==='All'||statusFor(e)===statusFilter)&&[e.display_name,e.member_id,e.title,e.email].join(' ').toLowerCase().includes(search.toLowerCase());
  async function load(){
    const [staff,org,app]=await Promise.all([
      sb.from('user_access').select('member_id,display_name,email,title,joining_date,employment_status,active,access_level,head_group').order('display_name'),
      sb.from('hr_reporting').select('member_id,manager_member_id,team'),
      sb.from('app_state').select('data').eq('id',1).maybeSingle()
    ]);
    for(const r of [staff,org,app])if(r.error)throw r.error;
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

  const detailLine=(label,value)=>'<div class="jg-person-line"><span class="jg-person-muted">'+esc(label)+'</span><strong>'+esc(value??'Not recorded')+'</strong></div>';
  const monthDate=d=>String(d||'').slice(0,7)===profileMonth;
  async function fetchProfile(id){
    profileBusy=true;
    const start=profileMonth+'-01',end=new Date(Number(profileMonth.slice(0,4)),Number(profileMonth.slice(5,7)),0).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
    const [assets,tasks,attendance,leaves,logs]=await Promise.all([
      sb.from('hr_assets').select('asset_tag,asset_type,description,status,assigned_on,condition').eq('assigned_member_id',id).eq('status','Assigned').order('asset_tag'),
      sb.from('hr_lifecycle_tasks').select('task_title,lifecycle_type,status,due_on').eq('member_id',id).order('created_at',{ascending:false}),
      sb.from('jg_attendance').select('attendance_date,work_mode,check_in_at,check_out_at').eq('member_id',id).gte('attendance_date',start).lte('attendance_date',end),
      sb.from('hr_leave_requests').select('leave_type,start_date,end_date,days,status').eq('member_id',id).lte('start_date',end).gte('end_date',start),
      sb.from('time_entries').select('work_date,minutes').eq('employee_id',id).gte('work_date',start).lte('work_date',end)
    ]);
    const errors=[assets,tasks,attendance,leaves,logs].filter(x=>x.error).map(x=>x.error.message);
    profileData={assets:assets.data||[],tasks:tasks.data||[],attendance:attendance.data||[],leaves:leaves.data||[],logs:logs.data||[],errors};
    profileBusy=false;
  }
  function profilePanel(id){
    const e=employees.find(x=>x.member_id===id);if(!e)return '';
    const p=profileData;
    const tabs=[['overview','Overview'],['assets','Assets'],['attendance','Attendance'],['tasks','HR Tasks']];
    const toolbar='<div class="jg-dir-profile-tabs" role="tablist" aria-label="Employee details">'+tabs.map(([key,label])=>'<button type="button" data-profile-tab="'+key+'" aria-selected="'+(profileTab===key)+'">'+label+'</button>').join('')+'</div>';
    let body='';
    if(profileTab==='overview'){
      body='<div class="jg-person-two"><section class="jg-person-card"><h2>Employee details</h2>'+detailLine('Name',e.display_name)+detailLine('Work email',e.email)+detailLine('Designation',e.title)+detailLine('Joined',fmt(e.joining_date))+detailLine('Status',statusFor(e))+'</section><section class="jg-person-card"><h2>Team & reporting</h2>'+detailLine('Pond / Pool',teamFor(e))+detailLine('Reporting manager',managerName(managerFor(id)))+detailLine('App access',e.access_level)+detailLine('Employee reference',e.member_id)+'</section></div>';
    }else if(profileTab==='assets'){
      body='<section class="jg-person-card"><h2>Assigned equipment ('+p.assets.length+')</h2><p class="jg-person-muted">Currently assigned company assets. Returns and reassignments are managed in People Operations.</p>'+(p.assets.map(a=>'<div class="jg-person-line"><div><strong>'+esc(a.asset_tag)+'</strong><div class="jg-person-muted">'+esc(a.asset_type+' · '+a.description)+'</div></div><div class="jg-person-muted">'+esc(a.condition)+' · '+esc(fmt(a.assigned_on))+'</div></div>').join('')||'<p class="jg-person-empty">No equipment currently assigned.</p>')+'<a class="jg-person-button secondary" href="/people-operations.html?tab=assets">Manage assets</a></section>';
    }else if(profileTab==='attendance'){
      const days=new Set(p.attendance.map(x=>x.attendance_date)).size,wfh=new Set(p.attendance.filter(x=>/wfh|home|remote/i.test(x.work_mode||'')).map(x=>x.attendance_date)).size;
      const logDays=new Set(p.logs.filter(x=>Number(x.minutes)>0).map(x=>x.work_date)).size,hours=(p.logs.reduce((sum,x)=>sum+(Number(x.minutes)||0),0)/60).toFixed(1);
      const approved=p.leaves.filter(x=>String(x.status).toLowerCase()==='approved');
      body='<section class="jg-person-card"><div class="jg-dir-toolbar"><div><h2>Monthly attendance overview</h2><p class="jg-person-muted">Recorded check-ins, approved leave and Work Logs, not a payroll attendance calculation.</p></div><label class="jg-person-muted">Month <input id="directoryProfileMonth" type="month" value="'+esc(profileMonth)+'"></label></div><div class="jg-person-grid">'+
      '<div><div class="jg-person-muted">Recorded attendance days</div><div class="jg-person-big">'+days+'</div></div><div><div class="jg-person-muted">WFH check-in days</div><div class="jg-person-big">'+wfh+'</div></div><div><div class="jg-person-muted">Days with Work Logs</div><div class="jg-person-big">'+logDays+'</div></div></div>'+
      detailLine('Logged hours',hours)+detailLine('Approved leave requests overlapping month',approved.length)+'<p class="jg-person-muted">A date with no check-in is not automatically considered absent. Approved leave requests may span months.</p></section>';
    }else{
      const open=p.tasks.filter(t=>!['Completed','Not applicable'].includes(t.status)).length;
      body='<section class="jg-person-card"><h2>Onboarding & exit tasks</h2><p class="jg-person-muted">'+open+' open of '+p.tasks.length+' recorded tasks.</p>'+(p.tasks.map(t=>'<div class="jg-person-line"><div><strong>'+esc(t.task_title)+'</strong><div class="jg-person-muted">'+esc(t.lifecycle_type)+' · Due '+esc(fmt(t.due_on))+'</div></div><span class="jg-person-pill">'+esc(t.status)+'</span></div>').join('')||'<p class="jg-person-empty">No lifecycle tasks recorded.</p>')+'<a class="jg-person-button secondary" href="/people-operations.html?tab=lifecycle">Manage checklists</a></section>';
    }
    return '<section id="directoryProfile" class="jg-dir-profile"><div class="jg-dir-toolbar"><div><h2 style="margin-bottom:5px">'+esc(e.display_name||id)+'</h2><p class="jg-person-muted">Employee overview and related HR records</p></div><div class="jg-person-actions"><button class="jg-person-button secondary" id="directoryEditDetails" type="button">Edit details</button><button class="jg-person-button secondary" id="directoryCloseProfile" type="button">Close</button></div></div>'+toolbar+(p.errors?.length?'<div class="jg-person-notice">Some records could not be loaded: '+esc(p.errors.join('; '))+'</div>':'')+body+'</section>';
  }
  async function openProfile(id){
    selected=id;profileTab='overview';
    const area=document.getElementById('directoryEditor');
    area.innerHTML='<section class="jg-person-card">Loading employee profile…</section>';
    await fetchProfile(id);
    if(selected===id){area.innerHTML=profilePanel(id);area.scrollIntoView({behavior:'smooth',block:'nearest'});}
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
      '<label>Project Pond<input value="'+esc(team)+'" disabled><span class="jg-dir-subtle">Change Pond in Admin Panel → Team Setup to keep project allocations consistent.</span></label>'+ 
      '<label>Reporting manager<select name="manager">'+managerOpts+'</select></label>'+
      '<label>Employment status<input disabled value="'+esc(statusFor(e))+'"></label>'+
      '<label>App access<input disabled value="'+esc(e.access_level||'employee')+'"></label>'+
      '</div><div class="jg-dir-subtle">Reporting manager is updated here. Change the Pond in Admin Panel → Team Setup; name, Google email, employment status, permissions, compensation and employee exit actions also remain there. This directory does not change them.</div><div id="directoryEditMessage" role="status"></div><div class="jg-person-actions"><button type="submit" class="jg-person-button">Save employee details</button></div></form></section>';
    document.getElementById('directoryEditor').innerHTML=html;
    document.getElementById('directoryEditCard').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function save(form){
    if(busy||!selected)return;busy=true;
    const button=form.querySelector('[type=submit]');button.disabled=true;
    const msg=document.getElementById('directoryEditMessage');
    try{
      const f=new FormData(form),title=String(f.get('title')||'').trim(),date=String(f.get('joiningDate')||''),team=teamFor(employees.find(x=>x.member_id===selected)),manager=String(f.get('manager')||'');
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
    if(e.target.id==='directoryProfileMonth'&&selected){profileMonth=e.target.value;fetchProfile(selected).then(()=>{if(selected)document.getElementById('directoryEditor').innerHTML=profilePanel(selected);}).catch(err=>showError(err.message));return;}
    if(e.target.id==='directoryTeam'){groupFilter=e.target.value;document.getElementById('directoryList').innerHTML=list();}
    if(e.target.id==='directoryStatus'){statusFilter=e.target.value;document.getElementById('directoryList').innerHTML=list();}
  });
  root.addEventListener('click',e=>{
    const card=e.target.closest('[data-member]');if(card){openProfile(card.dataset.member).catch(err=>showError('Unable to open profile. '+err.message));return;}
    const t=e.target.closest('[data-profile-tab]');if(t&&selected){profileTab=t.dataset.profileTab;document.getElementById('directoryEditor').innerHTML=profilePanel(selected);return;}
    if(e.target.id==='directoryEditDetails'&&selected){editor(selected);return;}
    if(e.target.id==='directoryCloseProfile'){selected=null;document.getElementById('directoryEditor').innerHTML='';return;}
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