'use strict';
(async()=>{
 const cfg=window.JG_SUPABASE,sb=window.supabase.createClient(cfg.url,cfg.publishableKey),root=document.getElementById('hrBoardRoot');
 const allowed=new Set(['piyush@jumpinggoose.com','tuhin@jumpinggoose.com','supriya@jumpinggoose.com','theo@jumpinggoose.com','midhun@jumpinggoose.com']);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const todayParts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 const today=[todayParts.year,todayParts.month,todayParts.day].join('-');
 const daysFromToday=n=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const dateText=d=>d?new Date(d+'T12:00:00Z').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Not set';
 const stat=(label,value,note)=>'<section class="hrboard-kpi"><div class="hrboard-kpi-label">'+esc(label)+'</div><div class="hrboard-number">'+value+'</div><div class="hrboard-kpi-note">'+esc(note)+'</div></section>';
 const row=(cells)=>'<tr>'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
 const table=(cols,rows,empty)=>rows.length?'<div class="hrboard-table-wrap"><table class="hrboard-table"><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':'<div class="hrboard-empty">'+esc(empty)+'</div>';
 const panel=(title,subtitle,link,label,contents)=>'<section class="hrboard-panel"><div class="hrboard-toolbar"><div><h2>'+esc(title)+'</h2><p class="hrboard-desc">'+esc(subtitle)+'</p></div><a class="hrboard-button" href="'+link+'">'+esc(label)+'</a></div>'+contents+'</section>';
 const active=e=>e.active&&e.employment_status!=='Exited';
 const name=(id,people)=>people.find(e=>e.member_id===id)?.display_name||id||'Unknown';
 const statusOpen=s=>s!=='Completed'&&s!=='Not applicable';
 async function init(){
  try{
   const {data:{user},error:authError}=await sb.auth.getUser();
   if(authError||!user){location.replace('/login.html');return;}
   const email=String(user.email||'').toLowerCase();
   if(!allowed.has(email)){root.innerHTML='<section class="hrboard-panel">HR Dashboard is available to authorised JUMPINGGOOSE management only.</section>';return;}
   const account=await sb.from('user_access').select('member_id,email,display_name,access_level,active,employment_status').eq('email',email).maybeSingle();
   if(account.error)throw account.error;
   if(!account.data?.active||account.data.employment_status==='Exited')throw Error('Your account is not active.');
   document.getElementById('personUser').textContent=account.data.display_name;
   window.JGNav?.setAccess({level:account.data.access_level,memberId:account.data.member_id,email});
   document.getElementById('logoutButton').addEventListener('click',async()=>{await sb.auth.signOut();location.replace('/login.html');});
   document.getElementById('historyBack').addEventListener('click',()=>history.back());
   document.getElementById('historyForward').addEventListener('click',()=>history.forward());
   const results=await Promise.all([
    sb.from('user_access').select('member_id,display_name,email,active,employment_status,joining_date,last_working_date,head_group').order('display_name'),
    sb.from('hr_lifecycle_tasks').select('member_id,task_title,lifecycle_type,status,due_on').order('created_at',{ascending:false}),
    sb.from('hr_assets').select('asset_tag,asset_type,assigned_member_id,status').eq('status','Assigned'),
    sb.from('hr_leave_requests').select('member_id,status,start_date,end_date,leave_type').eq('status','Pending').order('start_date',{ascending:true})
   ]);
   const errors=results.map((x,i)=>x.error?['Employee records','Lifecycle tasks','Assigned assets','Pending leave'][i]+': '+x.error.message:null).filter(Boolean);
   const [staff,tasks,assets,leaves]=results.map(r=>r.data||[]);
   if(results[0].error)throw results[0].error;
   // Do not present an inaccessible dataset as an accurate zero.
   const available=i=>!results[i].error;
   const blank=available(0)?staff.filter(active):[];
   const notice=blank.filter(x=>x.employment_status==='Notice Period');
   const pending=tasks.filter(x=>statusOpen(x.status));
   const upcomingJoin=staff.filter(x=>x.joining_date>=today&&x.joining_date<=daysFromToday(30)&&active(x)).sort((a,b)=>a.joining_date.localeCompare(b.joining_date));
   const upcomingExit=staff.filter(x=>x.last_working_date>=today&&x.last_working_date<=daysFromToday(30)&&x.employment_status!=='Exited').sort((a,b)=>a.last_working_date.localeCompare(b.last_working_date));
   const atRisk=new Set([...notice.map(x=>x.member_id),...upcomingExit.map(x=>x.member_id)]);
   const returnAssets=assets.filter(x=>atRisk.has(x.assigned_member_id));
   const pendingRows=pending.slice().sort((a,b)=>(a.due_on||'9999').localeCompare(b.due_on||'9999'));
   root.innerHTML=
    (errors.length?'<div class="hrboard-warning">Some sections could not be loaded: '+esc(errors.join(' · '))+'</div>':'')+
    '<div class="hrboard-summary">'+
      stat('Active employees',blank.length,'Includes employees serving notice')+
      stat('Notice period',notice.length,'Currently active on notice')+
      stat('Open HR tasks',available(1)?pending.length:'—','Onboarding and exit tasks')+
      stat('Assets to recover',available(2)?returnAssets.length:'—','Assigned to notice or upcoming exit')+
    '</div>'+
    '<div class="hrboard-grid">'+
      panel('Upcoming joinings','Joining dates in the next 30 days','/directory.html','Employee Directory',
        table(['Employee','Joining date','Team'],upcomingJoin.map(x=>row([esc(x.display_name),esc(dateText(x.joining_date)),esc(x.head_group||'—')])),'No joinings recorded in the next 30 days.'))+
      panel('Upcoming exits & notice','Employees on notice, or with a last working day in the next 30 days','/directory.html','Employee Directory',
        table(['Employee','Status','Last working day'],staff.filter(x=>x.employment_status==='Notice Period'||upcomingExit.some(y=>y.member_id===x.member_id)).map(x=>row([esc(x.display_name),'<span class="hrboard-pill">'+esc(x.employment_status||'Active')+'</span>',esc(dateText(x.last_working_date))])),'No upcoming exits or notice periods recorded.'))+
      panel('Outstanding HR checklist tasks','Open onboarding and exit tasks, sorted by due date','/people-operations.html?tab=lifecycle','Manage tasks',
        available(1)?table(['Employee','Task','Due date','Status'],pendingRows.slice(0,12).map(t=>row([esc(name(t.member_id,staff)),esc(t.task_title),esc(dateText(t.due_on)),esc(t.status)])),'No open checklist tasks.'): '<div class="hrboard-empty">Tasks unavailable.</div>')+
      panel('Equipment pending return','Assigned assets belonging to employees on notice or approaching exit','/people-operations.html?tab=assets','Manage assets',
        available(2)?table(['Employee','Asset tag','Type'],returnAssets.map(a=>row([esc(name(a.assigned_member_id,staff)),esc(a.asset_tag),esc(a.asset_type)])),'No equipment is currently flagged for return.'): '<div class="hrboard-empty">Asset records unavailable.</div>')+
      panel('Pending leave requests','Requests pending HR or manager review','/hr.html?tab=approvals','Leave approvals',
        available(3)?table(['Employee','Leave type','Start date'],leaves.slice(0,10).map(l=>row([esc(name(l.member_id,staff)),esc(l.leave_type),esc(dateText(l.start_date))])),'No pending requests visible to your account.'): '<div class="hrboard-empty">Leave data unavailable or restricted by permissions.</div>')+
      panel('Quick access','Common people management tasks','/people-operations.html','People Operations',
        '<div class="hrboard-toolbar" style="justify-content:flex-start"><a class="hrboard-button" href="/directory.html">Open employee profiles</a><a class="hrboard-button" href="/people-operations.html?tab=lifecycle">Onboarding & exits</a><a class="hrboard-button" href="/hr.html?tab=availability">Team availability</a></div>')+
    '</div><p class="hrboard-foot">Overview based on records currently available to your management account. A missing joining or exit date is not interpreted as a scheduled event. Data is refreshed when this page loads.</p>';
  }catch(e){console.error(e);root.innerHTML='<section class="hrboard-panel"><h2>Unable to load HR Dashboard</h2><p class="hrboard-desc">'+esc(e.message||'Please refresh.')+'</p></section>';}
 }
 await init();
})();