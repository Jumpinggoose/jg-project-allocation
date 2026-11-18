'use strict';
(() => {
  const cfg=window.JG_SUPABASE,sb=window.supabase.createClient(cfg.url,cfg.publishableKey),root=document.getElementById('attendanceRoot');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const alias=email=>({'accounts@jumpinggoose.com':'bhagya','saurabh@jumpinggoose.com':'sourabh','sirajul@jumpinggoose.com':'siraj'}[email]||null);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateLabel=s=>s?new Date(s+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'';
  const clock=s=>s?new Date(s).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}):'—';
  const pill=s=>'<span class="jg-person-pill">'+esc(s)+'</span>';
  let user=null,access=null,requests=[],attendance=[],reporting=[],people=[],busy=false;
  const memberName=id=>people.find(p=>p.member_id===id)?.display_name||id;
  const supervisor=()=>access.access_level==='management'||access.member_id==='bhagya'||reporting.some(r=>r.manager_member_id===access.member_id);
  function note(s,isError=false){const el=document.getElementById('attendanceMessage');if(el){el.textContent=s;el.className='jg-person-message'+(isError?' error':'');el.hidden=false;}}
  const monthStart=()=>today().slice(0,7)+'-01';
  const countMonth=arr=>arr.filter(a=>a.attendance_date>=monthStart()&&a.attendance_date<=today());
  async function load(){
    const [a,w,r,p]=await Promise.all([
      sb.from('jg_attendance').select('id,member_id,attendance_date,work_mode,check_in_at,check_out_at').gte('attendance_date',monthStart()).order('attendance_date',{ascending:false}).limit(150),
      sb.from('jg_wfh_requests').select('id,member_id,start_date,end_date,status,reason,created_at').order('created_at',{ascending:false}).limit(150),
      sb.from('hr_reporting').select('member_id,manager_member_id'),
      sb.from('user_access').select('member_id,display_name,access_level,email').limit(100)
    ]);
    for(const x of [a,w,r])if(x.error)throw x.error;
    attendance=a.data||[];requests=w.data||[];reporting=r.data||[];people=p.data||[];
  }
  function render(){
    const mine=attendance.filter(a=>a.member_id===access.member_id),todayRow=mine.find(a=>a.attendance_date===today());
    const month=countMonth(mine),office=month.filter(a=>a.work_mode==='Office').length,wfh=month.filter(a=>a.work_mode==='WFH').length;
    const approved=requests.some(r=>r.member_id===access.member_id&&r.status==='Approved'&&today()>=r.start_date&&today()<=r.end_date);
    const workmode='<option value="Office">Office</option>'+(approved?'<option value="WFH">Work From Home (approved)</option>':'');
    const attendRows=mine.slice(0,31).map(r=>'<tr><td>'+dateLabel(r.attendance_date)+'</td><td>'+esc(r.work_mode)+'</td><td>'+clock(r.check_in_at)+'</td><td>'+clock(r.check_out_at)+'</td></tr>').join('');
    const requestRows=requests.filter(r=>r.member_id===access.member_id).slice(0,25).map(r=>'<tr><td>'+dateLabel(r.start_date)+' – '+dateLabel(r.end_date)+'</td><td>'+esc(r.reason)+'</td><td>'+pill(r.status)+'</td></tr>').join('');
    const pending=requests.filter(r=>r.status==='Pending'&&r.member_id!==access.member_id&&(access.access_level==='management'||access.member_id==='bhagya'||reporting.some(x=>x.member_id===r.member_id&&x.manager_member_id===access.member_id)));
    const pendingRows=pending.map(r=>'<tr><td>'+esc(memberName(r.member_id))+'</td><td>'+dateLabel(r.start_date)+' – '+dateLabel(r.end_date)+'</td><td>'+esc(r.reason)+'</td><td><div class="jg-person-actions"><button class="jg-person-button" data-decision="Approved" data-id="'+esc(r.id)+'">Approve</button><button class="jg-person-button secondary" data-decision="Rejected" data-id="'+esc(r.id)+'">Reject</button></div></td></tr>').join('');
    root.innerHTML='<div class="jg-person-notice">Attendance is self-reported and is not yet linked to biometric devices. Work-from-home attendance requires an approved WFH request.</div><div id="attendanceMessage" hidden></div>'+
      '<div class="jg-person-grid">'+
      '<section class="jg-person-card"><span class="jg-person-muted">Days logged this month</span><div class="jg-person-big">'+month.length+'</div></section>'+
      '<section class="jg-person-card"><span class="jg-person-muted">Office days</span><div class="jg-person-big">'+office+'</div></section>'+
      '<section class="jg-person-card"><span class="jg-person-muted">Approved WFH days logged</span><div class="jg-person-big">'+wfh+'</div></section></div>'+
      '<div class="jg-person-two"><section class="jg-person-card"><h2>Today · '+dateLabel(today())+'</h2>'+
      (todayRow?'<div class="jg-person-line"><span class="jg-person-muted">Work mode</span><strong>'+esc(todayRow.work_mode)+'</strong></div><div class="jg-person-line"><span class="jg-person-muted">Check-in</span><strong>'+clock(todayRow.check_in_at)+'</strong></div><div class="jg-person-line"><span class="jg-person-muted">Check-out</span><strong>'+clock(todayRow.check_out_at)+'</strong></div>'+
      (todayRow.check_out_at?'<p class="jg-person-muted">Today’s attendance is complete.</p>':'<div class="jg-person-actions"><button class="jg-person-button" id="checkoutButton">Check out</button></div>'):
      '<p class="jg-person-muted">You have not checked in today.</p><form id="checkinForm" class="jg-person-form"><label>Work mode<select name="mode">'+workmode+'</select></label><button type="submit">Check in</button></form>')+
      '</section><section class="jg-person-card"><h2>Request Work From Home</h2><form id="wfhForm" class="jg-person-form"><label>Start date<input type="date" name="start" min="'+today()+'" required></label><label>End date<input type="date" name="end" min="'+today()+'" required></label><label>Reason<textarea name="reason" maxlength="1000" minlength="3" placeholder="Reason for requesting WFH" required></textarea></label><button type="submit">Submit request</button></form><p class="jg-person-muted">Your reporting manager or HR will review the request. Approval is required before selecting WFH at check-in.</p></section></div>'+
      '<div class="jg-person-two"><section class="jg-person-card"><h2>My Attendance · This Month</h2><div class="jg-person-scroll"><table class="jg-person-table"><thead><tr><th>Date</th><th>Mode</th><th>In</th><th>Out</th></tr></thead><tbody>'+ (attendRows||'<tr><td colspan="4">No attendance recorded yet.</td></tr>')+'</tbody></table></div></section>'+
      '<section class="jg-person-card"><h2>My WFH Requests</h2><div class="jg-person-scroll"><table class="jg-person-table"><thead><tr><th>Dates</th><th>Reason</th><th>Status</th></tr></thead><tbody>'+(requestRows||'<tr><td colspan="3">No requests yet.</td></tr>')+'</tbody></table></div></section></div>'+
      (supervisor()?'<section class="jg-person-card"><h2>WFH Approval Queue '+(pending.length?'('+pending.length+')':'')+'</h2><p class="jg-person-muted">Requests from your reporting team or employees under HR management.</p><div class="jg-person-scroll"><table class="jg-person-table"><thead><tr><th>Employee</th><th>Dates</th><th>Reason</th><th>Action</th></tr></thead><tbody>'+(pendingRows||'<tr><td colspan="4">No requests awaiting approval.</td></tr>')+'</tbody></table></div></section>':'');
  }
  async function refresh(){await load();render();}
  async function run(fn){
    if(busy)return;busy=true;
    try{await fn();await refresh();note('Updated successfully.');}
    catch(e){console.error(e);note(e.message||'Unable to save.',true);}
    finally{busy=false;}
  }
  root.addEventListener('submit',e=>{
    if(e.target.id==='checkinForm'){
      e.preventDefault();const mode=new FormData(e.target).get('mode');
      run(async()=>{const {error}=await sb.from('jg_attendance').insert({user_id:user.id,member_id:access.member_id,attendance_date:today(),work_mode:mode});if(error)throw error;});
    }
    if(e.target.id==='wfhForm'){
      e.preventDefault();const f=new FormData(e.target),start=String(f.get('start')),end=String(f.get('end')),reason=String(f.get('reason')||'').trim();
      if(start<today()||end<start||((new Date(end)-new Date(start))/86400000)>30){note('Choose a valid future or current date range of up to 31 days.',true);return;}
      if(reason.length<3){note('Add a short reason.',true);return;}
      if(requests.some(r=>r.member_id===access.member_id&&r.status!=='Rejected'&&r.start_date<=end&&r.end_date>=start)){note('A WFH request already covers these dates.',true);return;}
      run(async()=>{const {error}=await sb.from('jg_wfh_requests').insert({user_id:user.id,member_id:access.member_id,start_date:start,end_date:end,reason});if(error)throw error;});
    }
  });
  root.addEventListener('click',e=>{
    if(e.target.closest('#checkoutButton')){
      const current=attendance.find(a=>a.member_id===access.member_id&&a.attendance_date===today()&&!a.check_out_at);
      if(!current)return;
      run(async()=>{const {error}=await sb.from('jg_attendance').update({check_out_at:new Date().toISOString()}).eq('id',current.id).eq('user_id',user.id);if(error)throw error;});
    }
    const btn=e.target.closest('[data-decision]');
    if(btn){
      const status=btn.dataset.decision,id=btn.dataset.id,request=requests.find(r=>r.id===id);
      if(!request||request.status!=='Pending')return;
      if(!confirm(status+' the WFH request for '+memberName(request.member_id)+'?'))return;
      run(async()=>{const {data,error}=await sb.from('jg_wfh_requests').update({status}).eq('id',id).eq('status','Pending').select('id');if(error)throw error;if(!data?.length)throw Error('This request has already been processed.');});
    }
  });
  async function init(){
    try{
      const auth=await sb.auth.getUser();user=auth.data?.user;if(!user)return location.replace('/login.html');
      const email=String(user.email||'').toLowerCase(),q=sb.from('user_access').select('member_id,email,display_name,access_level,active,employment_status');
      const res=await(alias(email)?q.eq('member_id',alias(email)):q.eq('email',email)).maybeSingle();
      if(res.error)throw res.error;access=res.data;
      if(!access?.active||access.employment_status==='Exited')return location.replace('/login.html');
      document.getElementById('personUser').textContent=access.display_name||'Team Member';
      document.getElementById('logoutButton').addEventListener('click',async()=>{await sb.auth.signOut();location.replace('/login.html');});
      document.getElementById('historyBack').addEventListener('click',()=>history.back());
      document.getElementById('historyForward').addEventListener('click',()=>history.forward());
      await refresh();
      window.JGNav?.setAccess({level:access.access_level,memberId:access.member_id,email});
    }catch(e){console.error(e);root.innerHTML='<div class="jg-person-notice">Unable to load attendance. '+esc(e.message||'Please refresh.')+'</div>';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();