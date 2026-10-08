'use strict';

const cfg = window.JG_SUPABASE;
const sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
const MANAGEMENT_EMAILS = new Set(['piyush@jumpinggoose.com','tuhin@jumpinggoose.com','supriya@jumpinggoose.com','theo@jumpinggoose.com','midhun@jumpinggoose.com']);
let user=null, access=null, appState=null, timeEntries=[], financials=[], compensation=[];
let selectedMonth='ALL';

const root=document.getElementById('profitRoot');
const toastRegion=document.getElementById('toastRegion');

document.addEventListener('DOMContentLoaded',init);

async function init(){
  const auth=await sb.auth.getUser();
  if(auth.error||!auth.data.user)return location.replace('/login.html');
  user=auth.data.user;
  const email=String(user.email||'').toLowerCase();
  if(!MANAGEMENT_EMAILS.has(email))return location.replace('/worklog.html');
  const ar=await sb.from('user_access').select('member_id,display_name,access_level,title,active').eq('email',email).maybeSingle();
  if(ar.error||!ar.data?.active||ar.data.access_level!=='management')return location.replace('/worklog.html');
  access=ar.data;
  document.getElementById('profitUser').textContent=access.display_name+' · '+(access.title||'Management');
  document.getElementById('logoutButton').addEventListener('click',logout);
  root.addEventListener('click',onClick);
  root.addEventListener('change',onChange);
  const sr=await sb.from('app_state').select('data').eq('id',1).single();
  if(sr.error)return toast('Could not load project data.','error');
  appState=sr.data.data;
  await loadData();
}
async function logout(){await sb.auth.signOut();location.replace('/login.html');}

async function loadData(){
  const fy=appState?.meta?.currentFY||'2026-27';
  const y=Number(fy.slice(0,4));
  const start=y+'-04-01', end=(y+1)+'-03-31';
  const [tr,fr,cr]=await Promise.all([
    sb.from('time_entries').select('*').gte('work_date',start).lte('work_date',end),
    sb.from('project_financial_entries').select('*').gte('entry_month',start).lte('entry_month',end),
    sb.from('compensation_history').select('*').order('effective_from',{ascending:false})
  ]);
  if(tr.error||fr.error||cr.error)return toast('Could not load profitability data.','error');
  timeEntries=tr.data||[];financials=fr.data||[];compensation=cr.data||[];render();
}

function render(){
  const fy=appState.meta.currentFY||'2026-27';
  const rows=projectRows(fy,selectedMonth);
  const company=aggregate(rows);
  const p1=aggregate(rows.filter(r=>r.owner==='POND 1'));
  const p2=aggregate(rows.filter(r=>r.owner==='POND 2'));
  const delivery=deliveryContribution(fy,selectedMonth);
  const missing=[...new Set(timeEntries.filter(e=>inPeriod(e.work_date,fy,selectedMonth)).filter(e=>!compFor(e.employee_id,e.work_date)).map(e=>memberName(e.employee_id)))].filter(Boolean);
  root.innerHTML=`
    <div class="stack-lg">
      <section class="project-toolbar profitability-toolbar"><div class="toolbar-group">
        <label class="field profitability-month-field"><span class="field-label">Period</span><select data-control="month"><option value="ALL">FY ${esc(fy)} · All tracked months</option>${fyMonths(fy).map(m=>`<option value="${m}" ${selectedMonth===m?'selected':''}>${esc(monthLabel(m))}</option>`).join('')}</select></label>
        <button class="button button-secondary" type="button" data-action="comp">Compensation</button>
        <button class="button button-primary" type="button" data-action="finance">Add financial entry</button>
      </div><div class="notice compact-notice">Time tracking is intended to start from October 2026. Earlier months remain blank unless backfilled.</div></section>
      <section class="profitability-kpis">
        ${moneyKpi('JG Revenue',company.revenue,'Revenue recorded')}
        ${moneyKpi('JG Cost',company.totalCost,formatMoney(company.labour)+' labour · '+formatMoney(company.external)+' external')}
        ${moneyKpi('JG Profit',company.profit,company.revenue?formatPct(company.margin)+' margin':'Add revenue to calculate margin','is-accent')}
        ${textKpi('Actual effort',formatDuration(company.minutes),'Logged project time')}
      </section>
      <section class="grid-2">${pondCard('POND 1',p1)}${pondCard('POND 2',p2)}</section>
      <section class="panel"><div class="panel-header"><div><div class="section-eyebrow">Two Pond metrics</div><h2 class="panel-title">Revenue ownership vs delivery contribution</h2><p class="panel-subtitle">Revenue follows the owning Pond. Delivery follows the Pond or Pool of the people who actually logged the work.</p></div></div><div class="panel-body"><div class="delivery-grid">${['POND 1','POND 2','POOL'].map(g=>deliveryCard(g,delivery[g])).join('')}</div></div></section>
      ${missing.length?`<div class="notice notice-warning"><strong>Compensation missing:</strong> ${esc(missing.join(', '))}. Labour cost is understated until a cost period is added.</div>`:''}
      <section class="panel"><div class="panel-header"><div><div class="section-eyebrow">Project profitability</div><h2 class="panel-title">Actual effort against revenue</h2></div></div><div class="panel-body flush">${projectTable(rows)}</div></section>
    </div>`;
}

function projectRows(fy,month){
  return (appState.projects||[]).filter(p=>p.financialYear===fy).map(project=>{
    const times=timeEntries.filter(e=>e.project_id===project.id&&inPeriod(e.work_date,fy,month));
    const fin=financials.filter(e=>e.project_id===project.id&&inPeriod(e.entry_month,fy,month));
    const revenue=fin.reduce((s,e)=>s+Number(e.revenue||0),0);
    const external=fin.reduce((s,e)=>s+Number(e.external_cost||0),0);
    const labour=times.reduce((s,e)=>s+labourCost(e),0);
    const minutes=times.reduce((s,e)=>s+Number(e.minutes||0),0);
    const owner=fin[0]?.ownership_pond||project.pond;
    const totalCost=labour+external, profit=revenue-totalCost;
    return {project,owner,revenue,external,labour,totalCost,profit,margin:revenue?profit/revenue:0,minutes};
  }).filter(r=>r.minutes||r.revenue||r.external);
}
function aggregate(rows){const a=rows.reduce((x,r)=>{x.revenue+=r.revenue;x.external+=r.external;x.labour+=r.labour;x.minutes+=r.minutes;return x;},{revenue:0,external:0,labour:0,minutes:0});a.totalCost=a.external+a.labour;a.profit=a.revenue-a.totalCost;a.margin=a.revenue?a.profit/a.revenue:0;a.roi=a.totalCost?a.profit/a.totalCost:0;return a;}
function deliveryContribution(fy,month){const out={'POND 1':{minutes:0,cost:0},'POND 2':{minutes:0,cost:0},'POOL':{minutes:0,cost:0}};timeEntries.filter(e=>inPeriod(e.work_date,fy,month)).forEach(e=>{const g=member(e.employee_id)?.group||'POOL';if(!out[g])out[g]={minutes:0,cost:0};out[g].minutes+=Number(e.minutes||0);out[g].cost+=labourCost(e);});return out;}
function compFor(id,date){return compensation.filter(c=>c.employee_id===id&&c.effective_from<=date&&(!c.effective_to||c.effective_to>=date)).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0]||null;}
function labourCost(e){const c=compFor(e.employee_id,e.work_date);if(!c)return 0;const weekly=Math.max(1,Number(member(e.employee_id)?.weeklyCapacity||45));const hourly=Number(c.monthly_cost||0)/(weekly*52/12);return hourly*(Number(e.minutes||0)/60);}
function member(id){return (appState.members||[]).find(m=>m.id===id);}
function memberName(id){return member(id)?.name||id;}
function inPeriod(date,fy,month){if(!date)return false;const d=new Date(String(date).slice(0,10)+'T00:00:00'),y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;const key=y+'-'+String(y+1).slice(-2);return key===fy&&(month==='ALL'||String(date).slice(0,7)===month);}

function projectTable(rows){if(!rows.length)return '<div class="empty-state"><h3>No project data for this period</h3><p>Logged time and financial entries will appear here.</p></div>';return `<div class="table-wrap"><table class="data-table profitability-table"><thead><tr><th>Project</th><th>Owned by</th><th>Hours</th><th>Revenue</th><th>Labour</th><th>External</th><th>Profit</th><th>Margin</th><th></th></tr></thead><tbody>${rows.sort((a,b)=>b.revenue-a.revenue||b.minutes-a.minutes).map(r=>`<tr><td><strong>${esc(r.project.brand)}</strong><div class="cell-subtitle">${esc(r.project.type)} · ${esc(r.project.status)}</div></td><td>${esc(r.owner)}</td><td>${formatDuration(r.minutes)}</td><td>${formatMoney(r.revenue)}</td><td>${formatMoney(r.labour)}</td><td>${formatMoney(r.external)}</td><td><strong>${formatMoney(r.profit)}</strong></td><td>${r.revenue?formatPct(r.margin):'—'}</td><td><button class="link-button" data-action="finance-project" data-id="${r.project.id}" type="button">Financials</button></td></tr>`).join('')}</tbody></table></div>`;}
function pondCard(name,s){return `<article class="panel pond-profit-card"><div class="panel-header"><div><div class="section-eyebrow">${esc(name)}</div><h2 class="panel-title">Owned profitability</h2></div></div><div class="panel-body"><div class="profit-stat-grid"><div><span>Revenue owned</span><strong>${formatMoney(s.revenue)}</strong></div><div><span>Total delivery cost</span><strong>${formatMoney(s.totalCost)}</strong></div><div><span>Profit</span><strong>${formatMoney(s.profit)}</strong></div><div><span>Margin</span><strong>${s.revenue?formatPct(s.margin):'—'}</strong></div></div></div></article>`;}
function deliveryCard(g,x){x=x||{minutes:0,cost:0};return `<div class="delivery-card"><span>${esc(g)}</span><strong>${formatDuration(x.minutes)}</strong><small>${formatMoney(x.cost)} labour supplied</small></div>`;}
function moneyKpi(l,v,m,c=''){return `<article class="kpi-card ${c}"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${formatMoney(v)}</div><div class="kpi-meta">${esc(m)}</div></article>`;}
function textKpi(l,v,m){return `<article class="kpi-card"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${esc(v)}</div><div class="kpi-meta">${esc(m)}</div></article>`;}

function onChange(e){if(e.target.dataset.control==='month'){selectedMonth=e.target.value;render();}}
function onClick(e){const b=e.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='finance')openFinance();if(b.dataset.action==='finance-project')openFinance(b.dataset.id);if(b.dataset.action==='comp')openComp();if(b.dataset.action==='save-finance')saveFinance();if(b.dataset.action==='save-comp')saveComp();if(b.dataset.action==='close-panel')render();}

function openFinance(projectId=''){
  const projects=(appState.projects||[]).filter(p=>p.financialYear===appState.meta.currentFY);const project=projects.find(p=>p.id===projectId)||projects[0];const month=selectedMonth==='ALL'?localDate().slice(0,7):selectedMonth;
  root.innerHTML=`<div class="stack-lg"><section class="panel"><div class="panel-header"><div><div class="section-eyebrow">Management only</div><h2 class="panel-title">Project financial entry</h2><p class="panel-subtitle">Enter monthly revenue, external cost and the revenue-owning Pond.</p></div></div><div class="panel-body"><div class="form-grid"><div class="field span-2"><label>Project</label><select id="finProject">${projects.map(p=>`<option value="${p.id}" ${p.id===project?.id?'selected':''}>${esc(p.brand)} · ${esc(p.pond)}</option>`).join('')}</select></div><div class="field"><label>Month</label><input id="finMonth" type="month" value="${month}"></div><div class="field"><label>Revenue-owning Pond</label><select id="finPond"><option ${project?.pond==='POND 1'?'selected':''}>POND 1</option><option ${project?.pond==='POND 2'?'selected':''}>POND 2</option></select></div><div class="field"><label>Revenue (₹)</label><input id="finRevenue" type="number" min="0" step="1"></div><div class="field"><label>External cost (₹)</label><input id="finExternal" type="number" min="0" step="1"></div><div class="field span-2"><label>Notes</label><input id="finNotes" maxlength="220"></div></div><div class="worklog-edit-actions"><button class="button button-secondary" data-action="close-panel" type="button">Cancel</button><button class="button button-primary" data-action="save-finance" type="button">Save financial entry</button></div></div></section></div>`;
}
async function saveFinance(){const project=(appState.projects||[]).find(p=>p.id===document.getElementById('finProject').value);const month=document.getElementById('finMonth').value;if(!project||!month)return toast('Choose a project and month.','warning');const payload={project_id:project.id,project_name:project.brand,ownership_pond:document.getElementById('finPond').value,entry_month:month+'-01',revenue:Number(document.getElementById('finRevenue').value||0),external_cost:Number(document.getElementById('finExternal').value||0),notes:document.getElementById('finNotes').value.trim(),updated_at:new Date().toISOString()};const r=await sb.from('project_financial_entries').upsert(payload,{onConflict:'project_id,entry_month'});if(r.error)return toast('Could not save project financials.','error');toast('Project financials saved.');await loadData();}

function openComp(){root.innerHTML=`<div class="stack-lg"><section class="panel"><div class="panel-header"><div><div class="section-eyebrow">Management only</div><h2 class="panel-title">Compensation history</h2><p class="panel-subtitle">Use monthly company cost with effective dates so historical project costs stay stable.</p></div></div><div class="panel-body"><div class="form-grid"><div class="field"><label>Employee</label><select id="compEmployee">${(appState.members||[]).filter(m=>m.active).map(m=>`<option value="${m.id}">${esc(m.name)} · ${esc(m.group)}</option>`).join('')}</select></div><div class="field"><label>Effective from</label><input id="compFrom" type="date" value="${localDate().slice(0,8)+'01'}"></div><div class="field"><label>Effective to</label><input id="compTo" type="date"></div><div class="field"><label>Monthly company cost (₹)</label><input id="compCost" type="number" min="0" step="1"></div><div class="field span-2"><label>Notes</label><input id="compNotes" maxlength="220"></div></div><div class="worklog-edit-actions"><button class="button button-secondary" data-action="close-panel" type="button">Cancel</button><button class="button button-primary" data-action="save-comp" type="button">Add cost period</button></div></div></section></div>`;}
async function saveComp(){const id=document.getElementById('compEmployee').value,from=document.getElementById('compFrom').value,to=document.getElementById('compTo').value||null,cost=Number(document.getElementById('compCost').value||0);if(!id||!from||cost<0)return toast('Enter employee, effective date and a valid cost.','warning');if(to&&to<from)return toast('Effective-to cannot be before effective-from.','warning');const r=await sb.from('compensation_history').insert({employee_id:id,effective_from:from,effective_to:to,monthly_cost:cost,notes:document.getElementById('compNotes').value.trim()});if(r.error)return toast('Could not save compensation history.','error');toast('Compensation period added.');await loadData();}

function fyMonths(fy){const y=Number(fy.slice(0,4)),a=[];for(let i=0;i<12;i++){const d=new Date(y,3+i,1);a.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}return a;}
function monthLabel(m){const [y,n]=m.split('-').map(Number);return new Date(y,n-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});}
function formatMoney(v){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(v||0));}
function formatPct(v){return (Number(v||0)*100).toFixed(1).replace(/\.0$/,'')+'%';}
function formatDuration(v){const t=Math.round(Number(v||0)),h=Math.floor(t/60),m=t%60;return h?(m?`${h}h ${m}m`:`${h}h`):`${m}m`;}
function localDate(){const d=new Date(),off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10);}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function toast(message,type=''){const el=document.createElement('div');el.className='toast '+(type?`is-${type}`:'');el.textContent=message;toastRegion.appendChild(el);setTimeout(()=>el.remove(),3200);}
