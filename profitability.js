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
  const commercialRows=rows.filter(r=>r.financialClass==='Revenue Generating');
  const investmentRows=rows.filter(r=>r.financialClass!=='Revenue Generating');
  const company=aggregate(commercialRows);
  const p1=aggregate(commercialRows.filter(r=>r.owner==='POND 1'));
  const p2=aggregate(commercialRows.filter(r=>r.owner==='POND 2'));
  const unpaidPitch=aggregate(investmentRows.filter(r=>r.financialClass==='Non-Revenue External'));
  const internal=aggregate(investmentRows.filter(r=>r.financialClass==='Internal'));
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
      <section class="grid-2">
        ${investmentCard('Unpaid pitch / non-revenue external',unpaidPitch,'Cost invested in external opportunities without project revenue.')}
        ${investmentCard('Internal / JG investment',internal,'Cost invested in JG internal work. Profit and margin do not apply.')}
      </section>
      <section class="panel"><div class="panel-header"><div><div class="section-eyebrow">Two Pond metrics</div><h2 class="panel-title">Revenue ownership vs delivery contribution</h2><p class="panel-subtitle">Revenue follows the owning Pond. Delivery follows the Pond or Pool of the people who actually logged the work.</p></div></div><div class="panel-body"><div class="delivery-grid">${['POND 1','POND 2','POOL'].map(g=>deliveryCard(g,delivery[g])).join('')}</div></div></section>
      ${missing.length?`<div class="notice notice-warning"><strong>Compensation missing:</strong> ${esc(missing.join(', '))}. Labour cost is understated until a cost period is added.</div>`:''}
      <section class="panel"><div class="panel-header"><div><div class="section-eyebrow">Project profitability</div><h2 class="panel-title">Actual effort against revenue</h2></div></div><div class="panel-body flush">${projectTable(rows)}</div></section>
    </div>`;
}

function projectRows(fy,month){
  return (appState.projects||[]).filter(p=>p.financialYear===fy).map(project=>{
    const times=timeEntries.filter(e=>e.project_id===project.id&&inPeriod(e.work_date,fy,month));
    const fin=financials.filter(e=>e.project_id===project.id&&inPeriod(e.entry_month,fy,month));
    const financialClass=project.financialClass||defaultFinancialClass(project.type);
    const revenue=fin.reduce((s,e)=>s+Number(e.revenue||0),0);
    const external=fin.reduce((s,e)=>s+Number(e.external_cost||0),0);
    const labour=times.reduce((s,e)=>s+labourCost(e),0);
    const minutes=times.reduce((s,e)=>s+Number(e.minutes||0),0);
    const owner=fin[0]?.ownership_pond||project.pond;
    const totalCost=labour+external, profit=revenue-totalCost;
    return {project,financialClass,owner,revenue,external,labour,totalCost,profit,margin:financialClass==='Revenue Generating'&&revenue?profit/revenue:0,minutes};
  }).filter(r=>r.minutes||r.revenue||r.external);
}
function aggregate(rows){const a=rows.reduce((x,r)=>{x.revenue+=r.revenue;x.external+=r.external;x.labour+=r.labour;x.minutes+=r.minutes;return x;},{revenue:0,external:0,labour:0,minutes:0});a.totalCost=a.external+a.labour;a.profit=a.revenue-a.totalCost;a.margin=a.revenue?a.profit/a.revenue:0;a.roi=a.totalCost?a.profit/a.totalCost:0;return a;}
function deliveryContribution(fy,month){const out={'POND 1':{minutes:0,cost:0},'POND 2':{minutes:0,cost:0},'POOL':{minutes:0,cost:0}};timeEntries.filter(e=>inPeriod(e.work_date,fy,month)).forEach(e=>{const g=member(e.employee_id)?.group||'POOL';if(!out[g])out[g]={minutes:0,cost:0};out[g].minutes+=Number(e.minutes||0);out[g].cost+=labourCost(e);});return out;}
function compFor(id,date){return compensation.filter(c=>c.employee_id===id&&c.effective_from<=date&&(!c.effective_to||c.effective_to>=date)).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0]||null;}
function labourCost(e){const c=compFor(e.employee_id,e.work_date);if(!c)return 0;const weekly=Math.max(1,Number(member(e.employee_id)?.weeklyCapacity||45));const hourly=Number(c.monthly_cost||0)/(weekly*52/12);return hourly*(Number(e.minutes||0)/60);}
function member(id){return (appState.members||[]).find(m=>m.id===id);}
function memberName(id){return member(id)?.name||id;}
function inPeriod(date,fy,month){if(!date)return false;const d=new Date(String(date).slice(0,10)+'T00:00:00'),y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;const key=y+'-'+String(y+1).slice(-2);return key===fy&&(month==='ALL'||String(date).slice(0,7)===month);}

function projectTable(rows){
  if(!rows.length)return '<div class="empty-state"><h3>No project data for this period</h3><p>Logged time and financial entries will appear here.</p></div>';
  return `<div class="table-wrap"><table class="data-table profitability-table"><thead><tr><th>Project</th><th>Class</th><th>Owned by</th><th>Hours</th><th>Revenue</th><th>Labour</th><th>External</th><th>Profit / Investment</th><th>Margin</th><th></th></tr></thead><tbody>${rows.sort((a,b)=>b.revenue-a.revenue||b.minutes-a.minutes).map(r=>{
    const commercial=r.financialClass==='Revenue Generating';
    return `<tr>
      <td><strong>${esc(r.project.brand)}</strong><div class="cell-subtitle">${esc(r.project.type)} · ${esc(r.project.status)}</div></td>
      <td>${esc(financialClassLabel(r.financialClass))}</td>
      <td>${esc(r.owner)}</td>
      <td>${formatDuration(r.minutes)}</td>
      <td>${commercial?formatMoney(r.revenue):'N/A'}</td>
      <td>${formatMoney(r.labour)}</td>
      <td>${formatMoney(r.external)}</td>
      <td><strong>${commercial?formatMoney(r.profit):formatMoney(r.totalCost)}</strong><div class="cell-subtitle">${commercial?'Profit':'Investment cost'}</div></td>
      <td>${commercial&&r.revenue?formatPct(r.margin):'N/A'}</td>
      <td><div class="project-detail-actions"><button class="link-button" data-action="project-people" data-id="${r.project.id}" type="button">People & cost</button>${commercial?'<button class="link-button" data-action="finance-project" data-id="'+r.project.id+'" type="button">Financials</button>':''}</div></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function openProjectPeople(projectId){
  const fy=appState.meta.currentFY||'2026-27';
  const row=projectRows(fy,selectedMonth).find(r=>r.project.id===projectId);
  if(!row)return toast('No data is available for this project in the selected period.','warning');
  const people=projectPeopleRows(row.project,fy,selectedMonth);
  const commercial=row.financialClass==='Revenue Generating';
  const labourShareTotal=Math.max(0,row.labour);

  root.innerHTML=`
    <div class="stack-lg">
      <section class="panel">
        <div class="panel-header project-detail-head">
          <div>
            <div class="section-eyebrow">Project people & cost</div>
            <h2 class="panel-title">${esc(row.project.brand)}</h2>
            <p class="panel-subtitle">${esc(financialClassLabel(row.financialClass))} · ${esc(row.owner)} · ${selectedMonth==='ALL'?'FY '+esc(fy):esc(monthLabel(selectedMonth))}</p>
          </div>
          <div class="project-detail-actions">
            <button class="button button-secondary" data-action="close-panel" type="button">Back to profitability</button>
            ${commercial?'<button class="button button-primary" data-action="finance-project" data-id="'+row.project.id+'" type="button">Financials</button>':''}
          </div>
        </div>
        <div class="panel-body">
          <div class="project-person-summary">
            ${summaryStat('People involved',String(people.length),'Contributors who logged time')}
            ${summaryStat('Actual time',formatDuration(row.minutes),'Total logged time')}
            ${summaryStat('Labour cost',formatMoney(row.labour),'Actual people cost')}
            ${summaryStat('External cost',formatMoney(row.external),'Vendors / production / other')}
            ${summaryStat(commercial?'Total project cost':'Total investment',formatMoney(row.totalCost),commercial?(row.revenue?formatPct(row.totalCost/row.revenue)+' of revenue':'Revenue not entered'):'Non-commercial cost')}
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="section-eyebrow">Individual contribution</div>
            <h2 class="panel-title">Time and cost by person</h2>
            <p class="panel-subtitle">Cost uses the compensation rate effective on the date of each time entry, so historical cost remains accurate when salaries change.</p>
          </div>
        </div>
        <div class="panel-body flush">
          ${people.length?`<div class="table-wrap"><table class="data-table project-person-table">
            <thead><tr><th>Person</th><th>Home group</th><th>Project role</th><th>Planned</th><th>Actual time</th><th>Avg cost / hr</th><th>Labour cost</th><th>Share of labour</th><th>Activity mix</th></tr></thead>
            <tbody>${people.map(p=>`<tr>
              <td><strong>${esc(p.name)}</strong></td>
              <td>${esc(p.group)}</td>
              <td>${esc(p.roles.join(', ')||'Unplanned contribution')}</td>
              <td>${p.plannedHours>0?formatHoursDecimal(p.plannedHours)+'/wk':'—'}</td>
              <td><strong>${formatDuration(p.minutes)}</strong><div class="cell-subtitle">${p.entries} ${p.entries===1?'entry':'entries'}</div></td>
              <td>${p.minutes&&p.cost>0?formatMoney(p.cost/(p.minutes/60)):'Not set'}</td>
              <td><strong>${formatMoney(p.cost)}</strong></td>
              <td>${labourShareTotal>0?formatPct(p.cost/labourShareTotal):'—'}</td>
              <td><div class="activity-breakdown">${esc(p.activityText||'—')}</div></td>
            </tr>`).join('')}</tbody>
          </table></div>`:'<div class="empty-state"><h3>No time logged yet</h3><p>Individual contribution will appear once team members start logging time against this project.</p></div>'}
        </div>
      </section>
    </div>`;
}

function projectPeopleRows(project,fy,month){
  const projectEntries=timeEntries.filter(e=>e.project_id===project.id&&inPeriod(e.work_date,fy,month));
  const byPerson=new Map();
  projectEntries.forEach(entry=>{
    if(!byPerson.has(entry.employee_id)){
      const m=member(entry.employee_id);
      byPerson.set(entry.employee_id,{employeeId:entry.employee_id,name:m?.name||entry.employee_id,group:m?.group||'POOL',minutes:0,cost:0,entries:0,activities:new Map()});
    }
    const item=byPerson.get(entry.employee_id);
    item.minutes+=Number(entry.minutes||0);
    item.cost+=labourCost(entry);
    item.entries+=1;
    item.activities.set(entry.activity_type,(item.activities.get(entry.activity_type)||0)+Number(entry.minutes||0));
  });
  return [...byPerson.values()].map(item=>{
    const roleData=projectRolesForMember(project,item.employeeId);
    const activities=[...item.activities.entries()].sort((a,b)=>b[1]-a[1]);
    return {...item,roles:roleData.roles,plannedHours:roleData.plannedHours,activityText:activities.map(([name,mins])=>name+' '+formatDuration(mins)).join(' · ')};
  }).sort((a,b)=>b.minutes-a.minutes);
}

function projectRolesForMember(project,memberId){
  const labels={leadSpoc:'Lead SPOC',primary1:'Primary 1',primary2:'Primary 2',support1:'Support 1',support2:'Support 2',support3:'Support 3',support4:'Support 4',mentor1:'Mentor 1',mentor2:'Mentor 2'};
  const roles=[];
  let plannedHours=0;
  Object.keys(labels).forEach(key=>{
    if(project[key]===memberId){
      roles.push(labels[key]);
      plannedHours+=Number(project.allocationHours?.[key]||0);
    }
  });
  return {roles,plannedHours};
}

function summaryStat(label,value,meta){
  return `<div class="kpi-card"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-meta">${esc(meta)}</div></div>`;
}

function formatHoursDecimal(value){
  const n=Number(value||0);
  return (Number.isInteger(n)?String(n):n.toFixed(1).replace(/\.0$/,''))+'h';
}
function pondCard(name,s){return `<article class="panel pond-profit-card"><div class="panel-header"><div><div class="section-eyebrow">${esc(name)}</div><h2 class="panel-title">Owned profitability</h2></div></div><div class="panel-body"><div class="profit-stat-grid"><div><span>Revenue owned</span><strong>${formatMoney(s.revenue)}</strong></div><div><span>Total delivery cost</span><strong>${formatMoney(s.totalCost)}</strong></div><div><span>Profit</span><strong>${formatMoney(s.profit)}</strong></div><div><span>Margin</span><strong>${s.revenue?formatPct(s.margin):'—'}</strong></div></div></div></article>`;}
function investmentCard(label,stats,meta){
  return `<article class="panel"><div class="panel-header"><div><div class="section-eyebrow">Non-commercial effort</div><h2 class="panel-title">${esc(label)}</h2><p class="panel-subtitle">${esc(meta)}</p></div></div><div class="panel-body"><div class="profit-stat-grid"><div><span>Hours invested</span><strong>${formatDuration(stats.minutes)}</strong></div><div><span>Labour cost</span><strong>${formatMoney(stats.labour)}</strong></div><div><span>External cost</span><strong>${formatMoney(stats.external)}</strong></div><div><span>Total investment</span><strong>${formatMoney(stats.totalCost)}</strong></div></div></div></article>`;
}
function defaultFinancialClass(type){
  if(type==='Internal')return 'Internal';
  if(type==='Pitch')return 'Non-Revenue External';
  return 'Revenue Generating';
}
function financialClassLabel(value){
  if(value==='Revenue Generating')return 'Commercial';
  if(value==='Non-Revenue External')return 'Unpaid Pitch / Non-Revenue';
  return 'Internal';
}
function deliveryCard(g,x){x=x||{minutes:0,cost:0};return `<div class="delivery-card"><span>${esc(g)}</span><strong>${formatDuration(x.minutes)}</strong><small>${formatMoney(x.cost)} labour supplied</small></div>`;}
function moneyKpi(l,v,m,c=''){return `<article class="kpi-card ${c}"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${formatMoney(v)}</div><div class="kpi-meta">${esc(m)}</div></article>`;}
function textKpi(l,v,m){return `<article class="kpi-card"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${esc(v)}</div><div class="kpi-meta">${esc(m)}</div></article>`;}

function onChange(e){if(e.target.dataset.control==='month'){selectedMonth=e.target.value;render();}}
function onClick(e){const b=e.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='finance')openFinance();if(b.dataset.action==='finance-project')openFinance(b.dataset.id);if(b.dataset.action==='project-people')openProjectPeople(b.dataset.id);if(b.dataset.action==='comp')openComp();if(b.dataset.action==='save-finance')saveFinance();if(b.dataset.action==='save-comp')saveComp();if(b.dataset.action==='close-panel')render();}

function openFinance(projectId=''){
  const projects=(appState.projects||[]).filter(p=>p.financialYear===appState.meta.currentFY&&(p.financialClass||defaultFinancialClass(p.type))==='Revenue Generating');const project=projects.find(p=>p.id===projectId)||projects[0];const month=selectedMonth==='ALL'?localDate().slice(0,7):selectedMonth;
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
