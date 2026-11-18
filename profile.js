'use strict';
(() => {
  const cfg=window.JG_SUPABASE,sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const root=document.getElementById('profileRoot');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const line=(name,value)=>'<div class="jg-person-line"><span class="jg-person-muted">'+esc(name)+'</span><strong>'+esc(value||'Not assigned')+'</strong></div>';
  const alias=email=>({'accounts@jumpinggoose.com':'bhagya','saurabh@jumpinggoose.com':'sourabh','sirajul@jumpinggoose.com':'siraj'}[email]||null);
  const niceGroup=g=>String(g||'').replace(/_/g,' ');
  function fail(message){root.innerHTML='<div class="jg-person-notice">'+esc(message)+'</div>';}
  async function init(){
    try{
      const auth=await sb.auth.getUser();const user=auth.data?.user;if(!user) return location.replace('/login.html');
      const email=String(user.email||'').toLowerCase();
      const query=sb.from('user_access').select('member_id,email,display_name,access_level,title,head_group,employment_status,active,joining_date');
      const accessResult=await(alias(email)?query.eq('member_id',alias(email)):query.eq('email',email)).maybeSingle();
      if(accessResult.error)throw accessResult.error;
      const access=accessResult.data;if(!access?.active||access.employment_status==='Exited')return location.replace('/login.html');
      const [report,app]=await Promise.all([
        sb.from('hr_reporting').select('member_id,manager_member_id,team'),
        sb.from('app_state').select('data').eq('id',1).maybeSingle()
      ]);
      if(report.error)throw report.error;
      const members=app.data?.data?.members||[];
      const name=id=>(members.find(x=>x.id===id)?.name)||id||'Not assigned';
      const reporting=report.data||[];
      const mine=reporting.find(x=>x.member_id===access.member_id);
      const manager=mine?.manager_member_id||'';
      const team=(members.find(x=>x.id===access.member_id)?.group)||mine?.team||access.head_group||'';
      const joinDate=access.joining_date||members.find(x=>x.id===access.member_id)?.joiningDate||'';
      const joined=joinDate?new Date(joinDate+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}):'Not recorded';
      const initials=(access.display_name||name(access.member_id)||'JG').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
      window.JGNav?.setAccess({level:access.access_level,memberId:access.member_id,email,canApprove:reporting.some(r=>r.manager_member_id===access.member_id)});
      document.getElementById('personUser').textContent=access.display_name||name(access.member_id);
      root.innerHTML=
        '<div class="jg-person-card"><div class="jg-person-hero"><div class="jg-person-avatar">'+esc(initials)+'</div><div><h2>'+esc(access.display_name||name(access.member_id))+'</h2><p>'+esc(access.title||'Team Member')+'</p><span class="jg-person-pill">Active account</span></div></div></div>'+
        '<div class="jg-person-two"><section class="jg-person-card"><h2>My Details</h2>'+line('Full Name',access.display_name||name(access.member_id))+line('Work Email',email)+line('Designation',access.title)+line('Date of Joining',joined)+line('Employment Status',access.employment_status||'Active')+'</section>'+
        '<section class="jg-person-card"><h2>Team & Reporting</h2>'+line('Team / Pond',niceGroup(team))+line('Reports To',name(manager))+line('Access Level',access.access_level==='project_manager'?'Project Manager':access.access_level==='management'?'Management':'Employee')+line('Employee Reference',access.member_id)+'</section></div>'+
        '<section class="jg-person-card"><h2>My Workspace</h2><p class="jg-person-muted">Official details are maintained in Management → Admin Panel → Team Setup. Ask your administrator to update a designation or joining date. Your access and reporting assignments stay protected.</p><div class="jg-person-actions"><a class="jg-person-button" href="/attendance.html" style="text-decoration:none">Attendance & WFH</a><a class="jg-person-button secondary" href="/hr.html?tab=leave" style="text-decoration:none">My Leave</a><a class="jg-person-button secondary" href="/worklog.html" style="text-decoration:none">My Work Log</a></div></section>';
      document.getElementById('logoutButton').addEventListener('click',async()=>{await sb.auth.signOut();location.replace('/login.html');});
      document.getElementById('historyBack').addEventListener('click',()=>history.back());
      document.getElementById('historyForward').addEventListener('click',()=>history.forward());
    }catch(error){console.error(error);fail('Unable to load your profile. '+(error.message||'Try refreshing.'));}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();