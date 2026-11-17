'use strict';
const hcfg=window.JG_SUPABASE;
const hsb=window.supabase.createClient(hcfg.url,hcfg.publishableKey);
const root=document.getElementById('hrRoot');
let me=null,access=null,appState=null,members=[],reporting=[],policies=[],holidays=[],requests=[],blocks=[],openings=[],tab=new URLSearchParams(location.search).get('tab')||'calendar',year=new Date().getFullYear(),month=new Date().getMonth()+1,hrAdmin=false,canApprove=false;
const names=new Map();
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function localDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function iso(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function person(id){return names.get(id)||id||'Unknown';}
function isManager(id){return reporting.some(r=>r.manager_member_id===id);}
function member(id){return members.find(m=>m.id===id);}
function roleType(id){return member(id)?.type||'';}
function group(id){return reporting.find(r=>r.member_id===id)?.team||member(id)?.group||'POOL';}
function option(id,current){return '<option value="'+esc(id)+'" '+(String(id)===String(current)?'selected':'')+'>'+esc(person(id))+'</option>';}
function message(m,error=false){const el=document.getElementById('hrFlash');if(el){el.textContent=m;el.hidden=false;el.className='hr-message'+(error?' error':'');el.scrollIntoView({block:'nearest'});}else window.alert(m);}
function fmt(d){if(!d)return '—';const t=new Date(d+'T12:00:00');return Number.isNaN(t.getTime())?d:t.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}
function daysRange(a,b){
 if(!a||!b||b<a)return 0;
 const all=[],holidayDates=new Set(holidays.filter(h=>h.location==='All'&&h.holiday_type!=='Optional').map(h=>h.holiday_date));
 for(let t=new Date(a+'T12:00:00');t<=new Date(b+'T12:00:00')&&all.length<=366;t.setDate(t.getDate()+1)){
   const day=localISO(t),isWorking=t.getDay()!==0&&t.getDay()!==6&&!holidayDates.has(day);
   all.push({day,isWorking});
 }
 const work=all.map((x,i)=>x.isWorking?i:null).filter(i=>i!==null);
 if(!work.length)return 0;
 if(currentPolicy()?.sandwich_rule && work.length>1){
   return work[work.length-1]-work[0]+1;
 }
 return work.length;
}
function localISO(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function statusPill(s){return '<span class="hr-pill '+esc(String(s).toLowerCase())+'">'+esc(s)+'</span>';}
function select(items,current){return items.map(x=>'<option value="'+esc(x)+'" '+(String(x)===String(current)?'selected':'')+'>'+esc(x)+'</option>').join('');}
function currentPolicy(){return policies.find(x=>x.calendar_year===year)||null;}
function section(title,content){return '<section class="hr-card"><h2>'+esc(title)+'</h2>'+content+'</section>';}
function row2(label,value){return '<div class="hr-row hr-list-item"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';}
function myRequests(){return requests.filter(r=>r.member_id===access.member_id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));}
function calendarMonths(){return new Date(year,month-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});}
function totalFor(id,type){return requests.filter(r=>r.member_id===id&&r.status==='Approved'&&r.leave_type===type&&r.start_date?.slice(0,4)===String(year)).reduce((n,r)=>n+Number(r.days||0),0);}
function credited(type){const policy=currentPolicy();if(!policy)return 0;const quarter=(year<new Date().getFullYear()?4:year>new Date().getFullYear()?0:Math.ceil((new Date().getMonth()+1)/3));return quarter*Number(type==='Earned Leave'?policy.earned_quarterly:policy.sick_quarterly);}
function balance(id,type){const key=type==='Earned Leave'?'earned_adjustment':'sick_adjustment';const adjust=Number(openings.find(o=>o.member_id===id&&o.calendar_year===year)?.[key]||0);return Math.max(0,credited(type)+adjust-totalFor(id,type));}
async function queryData(){
const result=await Promise.all([
 hsb.from('hr_reporting').select('*'),hsb.from('hr_policy').select('*'),hsb.from('hr_holidays').select('*'),
 hsb.from('hr_leave_requests').select('*'),hsb.from('hr_leave_blocks').select('*'),hsb.from('hr_leave_opening').select('*')
]);
for(const q of result){if(q.error)throw q.error;}
[reporting,policies,holidays,requests,blocks,openings]=result.map(q=>q.data||[]);
}
async function refresh(){try{await queryData();render();}catch(err){console.error(err);root.innerHTML='<section class="hr-card"><h2>Unable to load the HR workspace</h2><p>'+esc(err.message||'Please refresh and try again.')+'</p></section>';}}
async function init(){
try{
 const auth=await hsb.auth.getUser();if(auth.error||!auth.data.user){location.replace('/login.html');return;}me=auth.data.user;
 const email=String(me.email||'').toLowerCase();
 const alias=email==='accounts@jumpinggoose.com'?'bhagya':email==='saurabh@jumpinggoose.com'?'sourabh':email==='sirajul@jumpinggoose.com'?'siraj':'';
 const aq=hsb.from('user_access').select('member_id,display_name,access_level,title,active,employment_status');
 const ar=await (alias?aq.eq('member_id',alias):aq.eq('email',email)).maybeSingle();
 if(ar.error||!ar.data?.active||ar.data.employment_status==='Exited'){location.replace('/login.html');return;}
 access=ar.data;
 hrAdmin=access.access_level==='management'||access.member_id==='bhagya';
 document.querySelectorAll('[data-management-nav]').forEach(x=>x.hidden=access.access_level!=='management'&&access.member_id!=='bhagya');
 document.getElementById('hrEmployeeLogs').hidden=access.access_level==='employee'&&access.member_id!=='bhagya';
 document.getElementById('hrProfitability').hidden=!['piyush@jumpinggoose.com','tuhin@jumpinggoose.com','theo@jumpinggoose.com','accounts@jumpinggoose.com'].includes(email);
 document.getElementById('hrUser').textContent=access.display_name||'Employee';
 document.getElementById('hrLogout').addEventListener('click',async()=>{await hsb.auth.signOut();location.replace('/login.html');});
 const sr=await hsb.from('app_state').select('data').eq('id',1).single();
 if(sr.error)throw sr.error;
 appState=sr.data.data;members=(appState.members||[]).filter(m=>m.name);members.forEach(m=>names.set(m.id,m.name));
 await queryData();canApprove=hrAdmin||isManager(access.member_id);
 window.JGNav?.setAccess({level:access.access_level,memberId:access.member_id,email,canApprove});
 render();
}catch(err){console.error(err);root.innerHTML='<section class="hr-card"><h2>Unable to load People & Leave</h2><p>'+esc(err.message||'Please try again.')+'</p></section>';}}
function nav(){const items=[['calendar','Calendar'],['leave','My Leave'],['availability','Team Availability']];if(canApprove)items.push(['approvals','Approvals']);if(hrAdmin)items.push(['settings','HR Settings']);return '<div class="hr-tabs">'+items.map(([id,n])=>'<button type="button" data-tab="'+id+'" class="'+(tab===id?'is-active':'')+'">'+n+'</button>').join('')+'</div>';}
function calendar(){
let first=new Date(year,month-1,1).getDay();first=(first+6)%7;
const max=new Date(year,month,0).getDate();
const cells=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<div class="hr-muted" style="text-align:center;padding:8px 0">'+x+'</div>');
for(let i=0;i<Math.ceil((first+max)/7)*7;i++){
const d=i-first+1,date=iso(year,month,d),valid=d>=1&&d<=max;
const holiday=valid?holidays.filter(h=>h.holiday_date===date):[];
const away=valid?blocks.filter(b=>b.start_date<=date&&b.end_date>=date):[];
const events=[...holiday.map(h=>'<span class="event holiday">'+esc(h.holiday_name)+'</span>'),...away.slice(0,3).map(b=>'<span class="event away">'+esc(person(b.member_id))+' · Away</span>')];
if(away.length>3)events.push('<span class="hr-muted">+'+(away.length-3)+' away</span>');
cells.push('<div class="hr-day '+(!valid?'outside ':'')+(date===localDate()?'today':'')+'"><strong>'+(valid?d:'')+'</strong>'+events.join('')+'</div>');
}
const count=holidays.filter(h=>h.holiday_date.slice(0,4)===String(year)&&h.holiday_type!=='Optional'&&h.location==='All').length;
const navigation='<div class="hr-row"><div><h2 style="margin:0">'+esc(calendarMonths())+'</h2><div class="hr-muted">Calendar year · '+count+' published company/public holidays · annual list editable by HR</div></div><div class="hr-pills"><button class="hr-action secondary" data-month="-1">‹ Previous</button><button class="hr-action secondary" data-month="1">Next ›</button></div></div>';
return section('Holiday & Leave Calendar',navigation+'<div class="hr-calendar" style="margin-top:16px">'+cells.join('')+'</div><p class="hr-muted">Holidays will be entered by management. Approved leave appears as “Away”; personal reasons remain private.</p>');
}
function leave(){
const p=currentPolicy();
const boxes=[['Earned Leave',balance(access.member_id,'Earned Leave')],['Sick Leave',balance(access.member_id,'Sick Leave')],['Compassion Leave',Math.max(0,Number(p?.compassion_days||0)-totalFor(access.member_id,'Compassion Leave'))]];
const cards='<div class="hr-grid">'+boxes.map(([n,v])=>'<div class="hr-card"><div class="hr-muted">'+n+' · indicative balance</div><div class="hr-stat">'+v+' days</div></div>').join('')+'</div>';
const form='<form id="leaveForm" class="hr-form"><label>Leave type<select name="type" required>'+['Earned Leave','Sick Leave','Compassion Leave'].map(v=>'<option>'+v+'</option>').join('')+'</select></label><div class="hr-two"><label>From<input name="start" type="date" required></label><label>To<input name="end" type="date" required></label></div><label><span><input type="checkbox" name="half_day" style="width:auto"> Half day (single day only)</span></label><label>Reason (visible only to authorised approvers)<textarea name="reason" maxlength="1000" placeholder="Brief explanation, if required"></textarea></label><div class="hr-muted">Dates are calculated on weekdays for the initial request. HR will review holidays, sandwich rules, eligibility and supporting documentation. Happy Period WFH will be enabled once individual eligibility is configured. In-app requests are pending official confirmation as an approved submission channel.</div><button type="submit">Submit request</button></form>';
const history=myRequests().map(r=>'<div class="hr-list-item"><div class="hr-row"><strong>'+esc(r.leave_type)+'</strong>'+statusPill(r.status)+'</div><div class="hr-muted">'+fmt(r.start_date)+' to '+fmt(r.end_date)+' · '+r.days+' days'+(r.decided_by?' · Reviewed by '+esc(person(r.decided_by)):'')+'</div></div>').join('')||'<p class="hr-muted">No leave requests yet.</p>';
return cards+'<div class="hr-two">'+section('Request Leave',form)+section('My Leave History','<div class="hr-list">'+history+'</div>')+'</div>'+
 section('JUMPINGGOOSE Leave Policy · '+year,
 '<details><summary style="cursor:pointer;font-weight:650">Read company leave rules</summary><p style="white-space:pre-wrap;line-height:1.6">'+esc(p?.policy_notes||'The leave policy for this year has not been published yet.')+'</p></details>')+
 '<p class="hr-muted">Leave balances are indicative until existing Keka leave history and individual opening balances are imported. Quarterly credits follow the configured calendar-year policy; HR must verify probation, notice periods and exceptions.</p>';
}
function availability(){
const date=localDate();const active=members.filter(m=>m.active!==false&&m.type!=='Intern');
const companyHoliday=holidays.find(h=>h.holiday_date===date&&h.location==='All'&&h.holiday_type!=='Optional');
const table=active.map(m=>{
const r=reporting.find(x=>x.member_id===m.id),away=blocks.find(b=>b.member_id===m.id&&b.start_date<=date&&b.end_date>=date);
return {name:m.name,team:r?.team||m.group,manager:r?.manager_member_id,away};
}).sort((a,b)=>a.team.localeCompare(b.team)||a.name.localeCompare(b.name));
const by=['POND 1','POND 2','POOL'].map(g=>{
const items=table.filter(x=>x.team===g);const absent=companyHoliday?items.length:items.filter(x=>x.away).length;
return '<section class="hr-card"><h3>'+g+'</h3><div class="hr-stat">'+(items.length-absent)+' / '+items.length+'</div><div class="hr-muted">Available today</div><div class="hr-list">'+items.map(x=>'<div class="hr-row hr-list-item"><span>'+esc(x.name)+'<div class="hr-muted">Reports to '+esc(person(x.manager)||'Pond lead')+'</div></span>'+statusPill(companyHoliday?'Holiday':x.away?'Away':'Available')+'</div>').join('')+'</div></section>';
}).join('');
return '<div class="hr-grid">'+by+'</div><p class="hr-muted">Availability reflects approved leave only. Attendance, WFH status and adjusted monthly capacity are not yet connected.</p>';
}
function approvals(){
const visible=requests.filter(r=>hrAdmin||reporting.some(x=>x.member_id===r.member_id&&x.manager_member_id===access.member_id));
const list=visible.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(r=>
'<div class="hr-list-item"><div class="hr-row"><div><strong>'+esc(person(r.member_id))+' · '+esc(r.leave_type)+'</strong><div class="hr-muted">'+fmt(r.start_date)+' – '+fmt(r.end_date)+' · '+r.days+' days</div></div>'+statusPill(r.status)+'</div>'+
'<p style="margin:8px 0">'+esc(r.reason||'No reason supplied')+'</p>'+
(r.status==='Pending'?'<div class="hr-pills"><button class="hr-action" data-decision="Approved" data-id="'+esc(r.id)+'">Approve</button><button class="hr-action secondary" data-decision="Rejected" data-id="'+esc(r.id)+'">Reject</button></div>':'<div class="hr-muted">Reviewed by '+esc(person(r.decided_by))+'</div>')+'</div>').join('');
return section('Leave Approvals','<p class="hr-muted">Reporting managers can review their direct reports. Bhagya and management have HR-wide access. Approval decisions are recorded.</p><div class="hr-list">'+(list||'<p class="hr-muted">No requests for your approval.</p>')+'</div>');
}
function settings(){
const p=currentPolicy();
const policy='<form id="policyForm" class="hr-form"><div class="hr-two"><label>Calendar year<input name="year" type="number" min="2026" max="2100" value="'+year+'" required></label><label>Provisional public holidays<input name="holidays" type="number" min="0" value="'+(p?.provisional_holiday_days??17)+'"></label><label>Earned leave / year<input name="earned" type="number" min="0" step=".5" value="'+(p?.earned_days??18)+'"></label><label>Sick leave / year<input name="sick" type="number" min="0" step=".5" value="'+(p?.sick_days??6)+'"></label><label>Compassion leave / year<input name="compassion" type="number" min="0" step=".5" value="'+(p?.compassion_days??5)+'"></label><label>Earned / quarter<input name="earnedquarter" type="number" min="0" step=".5" value="'+(p?.earned_quarterly??4.5)+'"></label><label>Sick / quarter<input name="sickquarter" type="number" min="0" step=".5" value="'+(p?.sick_quarterly??1.5)+'"></label><label>Planned notice days<input name="notice" type="number" min="0" value="'+(p?.planned_notice_days??30)+'"></label></div><label><span><input type="checkbox" name="carry" style="width:auto" '+(p?.no_carry_forward!==false?'checked':'')+'> No carry-forward</span></label><label><span><input type="checkbox" name="sandwich" style="width:auto" '+(p?.sandwich_rule!==false?'checked':'')+'> Apply sandwich leave rule</span></label><label>Policy notes<textarea name="notes" rows="6">'+esc(p?.policy_notes||'')+'</textarea></label><button type="submit">Save policy for '+year+'</button></form>';
const holiday='<form id="holidayForm" class="hr-form"><label>Date<input name="date" type="date" required></label><label>Holiday name<input name="name" maxlength="120" required></label><label>Type<select name="type">'+select(['Public / State','Company','Optional'],'Public / State')+'</select></label><label>Office / applicability<input name="location" value="All" maxlength="80"></label><button type="submit">Add holiday</button></form>';
const yearHolidays=holidays.filter(h=>h.holiday_date.slice(0,4)===String(year)).sort((a,b)=>a.holiday_date.localeCompare(b.holiday_date)).map(h=>'<div class="hr-row hr-list-item"><span><strong>'+esc(h.holiday_name)+'</strong><div class="hr-muted">'+fmt(h.holiday_date)+' · '+esc(h.location)+'</div></span><button class="hr-action secondary" data-remove-holiday="'+h.id+'">Remove</button></div>').join('');
const assignment='<div class="hr-scroll"><table class="hr-table"><thead><tr><th>Employee</th><th>Reporting team</th><th>Reports to</th><th></th></tr></thead><tbody>'+members.filter(m=>m.type!=='Intern').sort((a,b)=>a.name.localeCompare(b.name)).map(m=>{
const r=reporting.find(x=>x.member_id===m.id);return '<tr><td><strong>'+esc(m.name)+'</strong></td><td><select data-team="'+esc(m.id)+'">'+select(['POND 1','POND 2','POOL'],r?.team||m.group)+'</select></td><td><select data-manager="'+esc(m.id)+'"><option value="">No manager</option>'+members.filter(x=>x.id!==m.id&&x.type!=='Intern').map(x=>option(x.id,r?.manager_member_id)).join('')+'</select></td><td><button class="hr-action secondary" data-save-report="'+esc(m.id)+'">Save</button></td></tr>';
}).join('')+'</tbody></table></div><p class="hr-muted">Reporting teams are independent of existing project-allocation Ponds. HR-wide approval access remains enabled for authorized users. Interns are excluded for now.</p>';
const scheduled=holidays.filter(h=>h.holiday_date.slice(0,4)===String(year)&&h.holiday_type!=='Optional'&&h.location==='All').length;
const estimatedTotal=Number(p?.earned_days??18)+Number(p?.sick_days??6)+Number(p?.compassion_days??5)+scheduled;
const holidaySummary='<p class="hr-muted">Public/company holidays entered for '+year+': <strong>'+scheduled+'</strong>. Indicative total including conditional compassion leave: <strong>'+estimatedTotal+'</strong> days. The provisional '+(p?.provisional_holiday_days??17)+' holiday estimate is not counted until actual holiday dates are added.</p>';
const policySection='<div class="hr-two">'+section('Annual Leave Policy',policy)+section('Add Holiday',holiday+holidaySummary+'<h3 style="margin-top:20px">Holidays for '+year+'</h3><div class="hr-list">'+(yearHolidays||'<p class="hr-muted">No holiday dates entered yet.</p>')+'</div>')+'</div>';
const adjustment='<form id="openingForm" class="hr-form"><label>Employee<select name="member">'+members.filter(m=>m.type!=='Intern').map(m=>option(m.id,'')).join('')+'</select></label><div class="hr-two"><label>Earned leave adjustment<input name="earned" type="number" step=".5" value="0"></label><label>Sick leave adjustment<input name="sick" type="number" step=".5" value="0"></label></div><label>Adjustment note<input name="notes" maxlength="300"></label><button type="submit">Save opening / adjustment</button></form><p class="hr-muted">Use after reconciling Keka balances. Values are adjustments to the quarterly earned/sick credits, not extra annual entitlements.</p>';
return policySection+section('Reporting Managers & Teams',assignment)+section('Opening Balances / Corrections',adjustment);
}
function render(){
if(!['calendar','leave','availability','approvals','settings'].includes(tab)||(tab==='approvals'&&!canApprove)||(tab==='settings'&&!hrAdmin))tab='calendar';
 const mapped={calendar:'hr',leave:'hr-leave',availability:'hr-team',approvals:'hr-approvals',settings:'hr-settings'};
 document.querySelectorAll('.jg-workspace-nav [data-view]').forEach(item=>item.classList.toggle('is-active',item.dataset.view===mapped[tab]));
root.innerHTML=nav()+'<div id="hrFlash" hidden></div><div class="hr-row"><div class="hr-muted">Calendar year <strong>'+year+'</strong></div><div class="hr-pills"><button class="hr-action secondary" data-year="-1">‹ Year</button><button class="hr-action secondary" data-year="1">Year ›</button></div></div>'+
(tab==='calendar'?calendar():tab==='leave'?leave():tab==='availability'?availability():tab==='approvals'?approvals():settings());
}
async function writeRequest(form){
const f=new FormData(form),type=f.get('type'),start=String(f.get('start')),end=String(f.get('end')),reason=String(f.get('reason')||'').trim(),halfDay=f.get('half_day')==='on';
if(!['Earned Leave','Sick Leave','Compassion Leave'].includes(type))throw Error('Unsupported leave type. Contact HR.');
if(halfDay&&(start!==end||daysRange(start,end)!==1))throw Error('Half-day leave must fall on one working day, not a weekend or published holiday.');
const days=halfDay?0.5:daysRange(start,end);
if(!start||!end||end<start||start.slice(0,4)!==end.slice(0,4)||start.slice(0,4)!==String(year))throw Error('Select dates within the same calendar year.');
if(!currentPolicy())throw Error('Leave policy for this year has not yet been configured by HR.');
if(!days||days>45)throw Error('Select a valid working-day period (up to 45 weekdays).');
if(roleType(access.member_id)==='Intern'||roleType(access.member_id)==='Freelancer')throw Error('Leave entitlements for interns and freelancers require HR confirmation.');
if(type==='Happy Period WFH'&&days!==1)throw Error('Happy Period WFH is limited to one working day.');
if(type==='Compassion Leave'&&days>Number(currentPolicy()?.compassion_days||5))throw Error('Compassion leave exceeds the configured maximum.');
const existing=requests.filter(r=>r.member_id===access.member_id&&r.status!=='Rejected');
if(existing.some(r=>r.start_date<=end&&r.end_date>=start))throw Error('An overlapping leave request already exists.');
if(type==='Happy Period WFH'&&existing.some(r=>r.leave_type===type&&r.start_date.slice(0,7)===start.slice(0,7)))throw Error('Happy Period WFH has already been requested for this month.');
if(type==='Compassion Leave'&&existing.some(r=>r.leave_type===type&&r.start_date.slice(0,4)===String(year)))throw Error('Compassion leave can be requested once per year.');
const payload={member_id:access.member_id,user_id:me.id,leave_type:type,start_date:start,end_date:end,days,reason,status:'Pending'};
const result=await hsb.from('hr_leave_requests').insert(payload);if(result.error)throw result.error;
await refresh();message('Leave request submitted. HR / reporting manager will review it.');
}
async function decision(id,status){
if(!canApprove)return;
const req=requests.find(r=>r.id===id);if(!req||req.status!=='Pending')throw Error('This request is no longer pending.');
if(!window.confirm(status+' the request from '+person(req.member_id)+'?'))return;
const result=await hsb.from('hr_leave_requests').update({status}).eq('id',id).eq('status','Pending').select('id');
if(result.error)throw result.error;
if(!result.data?.length)throw Error('Request was changed by someone else.');
await refresh();message('Request '+status.toLowerCase()+'.');
}
async function policySave(form){
const f=new FormData(form),num=k=>Number(f.get(k)||0);if(num('year')!==year)throw Error('Choose the calendar year using the year selector above.');
const payload={calendar_year:year,earned_days:num('earned'),sick_days:num('sick'),compassion_days:num('compassion'),provisional_holiday_days:num('holidays'),earned_quarterly:num('earnedquarter'),sick_quarterly:num('sickquarter'),planned_notice_days:num('notice'),no_carry_forward:f.get('carry')==='on',sandwich_rule:f.get('sandwich')==='on',policy_notes:String(f.get('notes')||'')};
if(Object.values(payload).some(v=>typeof v==='number'&&(!Number.isFinite(v)||v<0)))throw Error('Invalid policy amount.');
const r=await hsb.from('hr_policy').upsert(payload,{onConflict:'calendar_year'});if(r.error)throw r.error;await refresh();message('Policy saved for '+year+'.');
}
async function holidaySave(form){const f=new FormData(form);const date=String(f.get('date'));if(!date||date.slice(0,4)!==String(year))throw Error('Select a holiday in the selected calendar year.');const r=await hsb.from('hr_holidays').insert({holiday_date:date,holiday_name:String(f.get('name')),holiday_type:String(f.get('type')),location:String(f.get('location')||'All')});if(r.error)throw r.error;await refresh();message('Holiday added.');}
async function reportSave(id){
const t=document.querySelector('[data-team="'+id+'"]'),m=document.querySelector('[data-manager="'+id+'"]');if(!t||!m)throw Error('Could not read reporting assignment.');
if(id===m.value)throw Error('An employee cannot report to themselves.');
let parent=m.value;const seen=new Set([id]);while(parent){if(seen.has(parent))throw Error('Circular reporting relationships are not allowed.');seen.add(parent);parent=reporting.find(r=>r.member_id===parent)?.manager_member_id;}
const r=await hsb.from('hr_reporting').upsert({member_id:id,team:t.value,manager_member_id:m.value||null,effective_from:localDate(),updated_at:new Date().toISOString()},{onConflict:'member_id'});
if(r.error)throw r.error;await refresh();message('Reporting line saved for '+person(id)+'.');
}
async function openingSave(form){const f=new FormData(form);const id=String(f.get('member'));const r=await hsb.from('hr_leave_opening').upsert({member_id:id,calendar_year:year,earned_adjustment:Number(f.get('earned')||0),sick_adjustment:Number(f.get('sick')||0),notes:String(f.get('notes')||'')},{onConflict:'member_id,calendar_year'});if(r.error)throw r.error;await refresh();message('Leave balance adjustment saved.');}
root.addEventListener('click',async e=>{
const el=e.target.closest('button');if(!el)return;
if(el.dataset.tab){tab=el.dataset.tab;const u=new URL(location.href);u.searchParams.set('tab',tab);history.replaceState(null,'',u);render();return;}
if(el.dataset.month){month+=Number(el.dataset.month);if(month===0){month=12;year--;}if(month===13){month=1;year++;}render();return;}
if(el.dataset.year){year+=Number(el.dataset.year);render();return;}
el.disabled=true;
try{
 if(el.dataset.decision)await decision(el.dataset.id,el.dataset.decision);
 if(el.dataset.saveReport)await reportSave(el.dataset.saveReport);
 if(el.dataset.removeHoliday){
  if(window.confirm('Remove this holiday?')){const r=await hsb.from('hr_holidays').delete().eq('id',el.dataset.removeHoliday);if(r.error)throw r.error;await refresh();message('Holiday removed.');}
 }
}catch(err){console.error(err);message(err.message||'Action failed.',true);}
finally{el.disabled=false;}
});
root.addEventListener('submit',async e=>{
const form=e.target;if(!['leaveForm','policyForm','holidayForm','openingForm'].includes(form.id))return;
e.preventDefault();const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
try{
 if(form.id==='leaveForm')await writeRequest(form);
 if(form.id==='policyForm')await policySave(form);
 if(form.id==='holidayForm')await holidaySave(form);
 if(form.id==='openingForm')await openingSave(form);
}catch(err){console.error(err);message(err.message||'Unable to save.',true);}
finally{if(btn)btn.disabled=false;}
});
document.addEventListener('DOMContentLoaded',init);