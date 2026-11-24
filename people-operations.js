'use strict';
(async()=>{
 const root=document.getElementById('opsRoot'),cfg=window.JG_SUPABASE,sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
 const management=['piyush@jumpinggoose.com','tuhin@jumpinggoose.com','supriya@jumpinggoose.com','theo@jumpinggoose.com','midhun@jumpinggoose.com'];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const date=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 const fmt=v=>v?String(v).slice(0,10):'—';
 const message=(m,error=false)=>{const el=document.getElementById('opsMessage');if(el){el.className=error?'ops-error':'ops-success';el.textContent=m;}};
 let staff=[],assets=[],history=[],tasks=[],tab=new URLSearchParams(location.search).get('tab')==='lifecycle'?'lifecycle':'assets',editing=null,loading=false,search='';
 const member=id=>staff.find(x=>x.member_id===id)?.display_name||id||'—';
 const options=(value,arr)=>arr.map(([v,t])=>'<option value="'+esc(v)+'"'+(v===value?' selected':'')+'>'+esc(t)+'</option>').join('');
 const people=value=>options(value,[['','Unassigned'],...staff.filter(x=>x.active).map(x=>[x.member_id,x.display_name||x.member_id])]);
 // Asset tags are permanent identifiers. Increment the highest existing number for each category.
 const assetTypes=[['Laptop','LAP'],['Desktop','DES'],['Monitor','MON'],['Keyboard','KEY'],['Mouse','MOU'],['Tablet','TAB'],['Phone','PHN'],['Camera','CAM'],['Hard Drive / SSD','SSD'],['Headphones','HDP'],['Printer','PRN'],['Accessories','ACC'],['Other','OTH']];
 const assetCode=type=>assetTypes.find(([name])=>name===type)?.[1]||String(type||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3)||'OTH';
 function nextAssetTag(type){
  if(!type)return '';
  const prefix='JG-'+assetCode(type)+'-';
  const values=assets.filter(a=>String(a.asset_tag||'').startsWith(prefix)).map(a=>Number(String(a.asset_tag).slice(prefix.length))).filter(Number.isSafeInteger);
  return prefix+String(Math.max(0,...values)+1).padStart(3,'0');
 }
 const assetTypeOptions=value=>options(value,[['','Select asset type'],...assetTypes.map(([name])=>[name,name]),...(value&&!assetTypes.some(x=>x[0]===value)?[[value,value]]:[])]);

 function filters(rows){const q=search.trim().toLowerCase();return q?rows.filter(x=>Object.values(x).join(' ').toLowerCase().includes(q)||member(x.assigned_member_id||x.member_id).toLowerCase().includes(q)):rows;}
 async function reload(){
  const [a,b,c,d]=await Promise.all([
   sb.from('user_access').select('member_id,display_name,active').order('display_name'),
   sb.from('hr_assets').select('*').order('created_at',{ascending:false}),
   sb.from('hr_asset_history').select('*').order('action_date',{ascending:false}).limit(100),
   sb.from('hr_lifecycle_tasks').select('*').order('created_at',{ascending:false})
  ]);
  for(const r of [a,b,c,d])if(r.error)throw r.error;
  staff=a.data||[];assets=b.data||[];history=c.data||[];tasks=d.data||[];
 }
 const stat=(label,n)=>'<section class="jg-person-card"><div class="ops-subtle">'+label+'</div><div class="ops-stat">'+n+'</div></section>';
 function assetsView(){
  const rows=filters(assets),active=assets.filter(x=>x.status==='Assigned').length;
  const record=assets.find(x=>x.id===editing)||{};
  return '<div class="jg-person-grid">'+stat('Total assets',assets.length)+stat('Assigned',active)+stat('Available',assets.filter(x=>x.status==='Available').length)+'</div><div class="ops-layout"><section class="jg-person-card"><div class="ops-toolbar"><div><h2>Asset inventory</h2><div class="ops-subtle">Track equipment and who is responsible for it.</div></div><input class="ops-search" id="opsSearch" type="search" placeholder="Search assets" value="'+esc(search)+'"></div><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Asset</th><th>Details</th><th>Status</th><th>Assigned to</th><th>Actions</th></tr></thead><tbody>'+ (rows.map(x=>'<tr><td><strong>'+esc(x.asset_tag)+'</strong><div class="ops-small">'+esc(x.asset_type)+'</div></td><td>'+esc(x.description)+'<div class="ops-small">'+esc([x.brand,x.model].filter(Boolean).join(' · '))+'</div></td><td>'+esc(x.status)+'</td><td>'+esc(member(x.assigned_member_id))+'</td><td><div class="ops-actions"><button type="button" data-edit-asset="'+esc(x.id)+'">Edit</button>'+(x.status==='Assigned'?'<button type="button" data-return-asset="'+esc(x.id)+'">Return</button>':'')+'</div></td></tr>').join('')||'<tr><td colspan="5">No assets found.</td></tr>')+'</tbody></table></div><h2 style="margin-top:24px">Recent activity</h2><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Asset</th><th>Action</th><th>Employee</th><th>Date</th></tr></thead><tbody>'+history.slice(0,15).map(h=>'<tr><td>'+esc(assets.find(a=>a.id===h.asset_id)?.asset_tag||'Unknown')+'</td><td>'+esc(h.action)+'</td><td>'+esc(member(h.member_id))+'</td><td>'+esc(fmt(h.action_date))+'</td></tr>').join('')+'</tbody></table></div></section><section class="jg-person-card"><h2>'+(editing?'Update asset':'Add an asset')+'</h2><form class="ops-form" id="assetForm"><label>Asset Tag · Auto-generated<input name="asset_tag" required readonly maxlength="60" placeholder="Select an asset type" title="Generated from the asset type and existing inventory" value="'+esc(editing?record.asset_tag||'':'')+'"></label><label>Type *<select name="asset_type" required>'+assetTypeOptions(record.asset_type||'')+'</select></label><label class="ops-full">Description *<input name="description" required maxlength="250" value="'+esc(record.description||'')+'"></label><label>Brand<input name="brand" maxlength="80" value="'+esc(record.brand||'')+'"></label><label>Model<input name="model" maxlength="80" value="'+esc(record.model||'')+'"></label><label>Serial number<input name="serial_number" maxlength="120" value="'+esc(record.serial_number||'')+'"></label><label>Acquired on<input name="acquired_on" type="date" value="'+esc(record.acquired_on||'')+'"></label><label>Condition<select name="condition">'+options(record.condition||'Good',['New','Good','Needs repair','Damaged','Retired'].map(x=>[x,x]))+'</select></label><label>Status<select name="status">'+options(record.status||'Available',['Available','Assigned','Maintenance','Retired','Lost'].map(x=>[x,x]))+'</select></label><label>Assigned to<select name="assigned_member_id">'+people(record.assigned_member_id||'')+'</select></label><label>Assigned on<input type="date" name="assigned_on" value="'+esc(record.assigned_on||'')+'"></label><label class="ops-full">Notes<textarea name="notes" maxlength="1000">'+esc(record.notes||'')+'</textarea></label><div class="ops-actions ops-full"><button type="submit">Save asset</button>'+(editing?'<button type="button" id="opsCancel">Cancel</button>':'')+'</div></form></section></div>';
 }
 function lifecycleView(){
  const pending=tasks.filter(x=>x.status==='Pending'||x.status==='In progress').length;
  const rows=filters(tasks);
  return '<div class="jg-person-grid">'+stat('Checklist tasks',tasks.length)+stat('Open tasks',pending)+stat('Completed',tasks.filter(x=>x.status==='Completed').length)+'</div><div class="ops-layout"><section class="jg-person-card"><div class="ops-toolbar"><div><h2>Onboarding & Exit Checklist</h2><p class="ops-subtle">Tasks stay linked to the employee record.</p></div><input class="ops-search" id="opsSearch" type="search" placeholder="Search tasks" value="'+esc(search)+'"></div><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Employee</th><th>Workflow</th><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>'+(rows.map(t=>'<tr><td>'+esc(member(t.member_id))+'</td><td>'+esc(t.lifecycle_type)+'</td><td>'+esc(t.task_title)+'</td><td>'+esc(member(t.assigned_to_member_id))+'</td><td>'+esc(fmt(t.due_on))+'</td><td><select data-task-status="'+esc(t.id)+'" aria-label="Update task status">'+options(t.status,['Pending','In progress','Completed','Not applicable'].map(x=>[x,x]))+'</select></td></tr>').join('')||'<tr><td colspan="6">No tasks yet.</td></tr>')+'</tbody></table></div></section><section class="jg-person-card"><h2>Add checklist task</h2><form id="lifecycleForm" class="ops-form"><label>Employee *<select name="member_id" required>'+people('')+'</select></label><label>Workflow<select name="lifecycle_type">'+options('Onboarding',[['Onboarding','Onboarding'],['Exit','Exit']])+'</select></label><label class="ops-full">Task *<input name="task_title" required maxlength="180" placeholder="Issue laptop and accessories"></label><label>Owner<select name="assigned_to_member_id">'+people('')+'</select></label><label>Due date<input name="due_on" type="date"></label><label class="ops-full">Notes<textarea name="notes" maxlength="1000"></textarea></label><div class="ops-actions ops-full"><button type="submit">Create task</button></div></form><p class="ops-subtle">Employee joining, exit and login access remain controlled in Team Setup. Checklist completion does not change employee status.</p></section></div>';
 }
 function render(){
 root.innerHTML='<div class="ops-tabs" role="tablist"><button type="button" data-tab="assets" aria-selected="'+(tab==='assets')+'">Asset Management</button><button type="button" data-tab="lifecycle" aria-selected="'+(tab==='lifecycle')+'">Onboarding & Exits</button></div><div id="opsMessage" role="status"></div>'+(tab==='assets'?assetsView():lifecycleView());
 }
 async function saveAsset(form){
  const f=new FormData(form),status=String(f.get('status')),assigned=String(f.get('assigned_member_id')||'');
  if(status==='Assigned'&&!assigned)throw Error('Select an employee for an assigned asset.');
  const payload={asset_tag:String(f.get('asset_tag')).trim(),asset_type:String(f.get('asset_type')).trim(),description:String(f.get('description')).trim(),brand:String(f.get('brand')||'').trim()||null,model:String(f.get('model')||'').trim()||null,serial_number:String(f.get('serial_number')||'').trim()||null,acquired_on:f.get('acquired_on')||null,condition:f.get('condition'),status,assigned_member_id:status==='Assigned'?assigned:null,assigned_on:status==='Assigned'?(f.get('assigned_on')||date()):null,notes:String(f.get('notes')||'').trim()||null,updated_at:new Date().toISOString()};
  const before=assets.find(x=>x.id===editing);
  let result;
  if(editing){
   // Never change a previously issued tag, even when updating an asset's type.
   payload.asset_tag=before.asset_tag;
   result=await sb.from('hr_assets').update(payload).eq('id',editing).select('id').single();
  }else{
   // The unique constraint protects concurrent saves. Refresh and retry if another
   // manager saved the displayed number first.
   for(let attempt=0;attempt<4;attempt++){
    const fresh=await sb.from('hr_assets').select('asset_tag,asset_type');
    if(fresh.error)throw fresh.error;
    const prefix='JG-'+assetCode(payload.asset_type)+'-';
    const nums=(fresh.data||[]).filter(a=>String(a.asset_tag).startsWith(prefix)).map(a=>Number(String(a.asset_tag).slice(prefix.length))).filter(Number.isSafeInteger);
    payload.asset_tag=prefix+String(Math.max(0,...nums)+1).padStart(3,'0');
    result=await sb.from('hr_assets').insert(payload).select('id').single();
    if(!result.error||result.error.code!=='23505')break;
   }
  }
  if(result.error)throw result.error;
  const action=!before?'Created':before.status==='Assigned'&&status!=='Assigned'?'Returned':(status==='Assigned'&&before.assigned_member_id!==assigned)?'Assigned':status==='Retired'?'Retired':status==='Lost'?'Lost':'Updated';
  const hist=await sb.from('hr_asset_history').insert({asset_id:result.data.id,action,member_id:status==='Assigned'?assigned:before?.assigned_member_id||null,notes:payload.notes});
  if(hist.error)throw Error('Asset saved, but history could not be recorded: '+hist.error.message);
  editing=null;search='';await reload();render();message('Asset saved and activity recorded.');
 }
 async function returnAsset(id){
  const old=assets.find(x=>x.id===id);if(!old||old.status!=='Assigned')return;
  if(!confirm('Mark '+old.asset_tag+' as returned and available?'))return;
  const r=await sb.from('hr_assets').update({status:'Available',assigned_member_id:null,assigned_on:null,updated_at:new Date().toISOString()}).eq('id',id).eq('status','Assigned').select('id').single();if(r.error)throw r.error;
  const h=await sb.from('hr_asset_history').insert({asset_id:id,action:'Returned',member_id:old.assigned_member_id});
  if(h.error)throw Error('Return recorded, but history failed: '+h.error.message);
  await reload();render();message('Asset marked as returned.');
 }
 async function createTask(form){
  const f=new FormData(form);if(!f.get('member_id'))throw Error('Select an employee.');
  const r=await sb.from('hr_lifecycle_tasks').insert({member_id:f.get('member_id'),lifecycle_type:f.get('lifecycle_type'),task_title:String(f.get('task_title')).trim(),assigned_to_member_id:f.get('assigned_to_member_id')||null,due_on:f.get('due_on')||null,notes:String(f.get('notes')||'').trim()||null}).select('id').single();
  if(r.error)throw r.error;await reload();render();message('Checklist task created.');
 }
 async function updateTask(id,status){
  const r=await sb.from('hr_lifecycle_tasks').update({status,completed_on:status==='Completed'?date():null,updated_at:new Date().toISOString()}).eq('id',id).select('id').single();if(r.error)throw r.error;
  await reload();render();message('Task status saved.');
 }
 root.addEventListener('click',async e=>{
  const btn=e.target.closest('button');if(!btn)return;
  if(btn.dataset.tab){tab=btn.dataset.tab;search='';editing=null;window.history.replaceState(null,'','?tab='+tab);render();return;}
  if(btn.dataset.editAsset){editing=btn.dataset.editAsset;render();return;}
  if(btn.id==='opsCancel'){editing=null;render();return;}
  if(btn.dataset.returnAsset){try{await returnAsset(btn.dataset.returnAsset);}catch(err){message(err.message,true);}}
 });
 root.addEventListener('input',e=>{if(e.target.id==='opsSearch'){search=e.target.value;const pos=e.target.selectionStart;render();document.getElementById('opsSearch')?.focus();document.getElementById('opsSearch')?.setSelectionRange(pos,pos);}});
 root.addEventListener('change',async e=>{
  if(e.target.name==='asset_type'&&!editing){
   const tag=e.target.form?.elements.namedItem('asset_tag');
   if(tag)tag.value=nextAssetTag(e.target.value);
  }
  if(e.target.dataset.taskStatus){try{await updateTask(e.target.dataset.taskStatus,e.target.value);}catch(err){message(err.message,true);}}
 });
 root.addEventListener('submit',async e=>{
  if(!['assetForm','lifecycleForm'].includes(e.target.id))return;e.preventDefault();
  if(loading)return;loading=true;const button=e.target.querySelector('[type="submit"]');if(button)button.disabled=true;
  try{if(e.target.id==='assetForm')await saveAsset(e.target);else await createTask(e.target);}catch(err){message(err.message,true);}finally{loading=false;if(button?.isConnected)button.disabled=false;}
 });
 try{
  const {data:{user},error}=await sb.auth.getUser();if(error||!user){location.replace('/login.html');return;}
  const email=String(user.email||'').toLowerCase();
  if(!management.includes(email)){root.innerHTML='<div class="jg-person-notice">People Operations is accessible only to authorised JUMPINGGOOSE management.</div>';return;}
  const {data:account,error:err}=await sb.from('user_access').select('member_id,display_name,access_level,active,employment_status').eq('email',email).maybeSingle();
  if(err)throw err;
  if(!account?.active||account.employment_status==='Exited'){root.innerHTML='<div class="jg-person-notice">Your account is not active.</div>';return;}
  window.JGNav?.setAccess({level:account.access_level,memberId:account.member_id,email});
  document.getElementById('personUser').textContent=account.display_name;
  document.getElementById('logoutButton').onclick=async()=>{await sb.auth.signOut();location.replace('/login.html');};
  document.getElementById('historyBack').onclick=()=>history.back();document.getElementById('historyForward').onclick=()=>history.forward();
  await reload();render();
 }catch(err){console.error(err);root.innerHTML='<div class="jg-person-notice">Unable to load People Operations: '+esc(err.message)+'</div>';}
})();