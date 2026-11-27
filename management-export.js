'use strict';
/* Management-only extension of the FY review workbook. Uses authenticated Supabase RLS. */
(() => {
  const financeEmails = new Set([
    'piyush@jumpinggoose.com','tuhin@jumpinggoose.com',
    'theo@jumpinggoose.com','accounts@jumpinggoose.com'
  ]);
  const numeric = value => Number(value || 0);
  const dateOnly = value => String(value || '').slice(0,10);
  const clean = value => {
    if (value == null) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    const str = String(value);
    return /^[\s]*[=+\-@\t\r]/.test(str) ? "'" + str : str;
  };
  const dayStart = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
      timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return [parts.year,parts.month,parts.day].join('-');
  };
  function fyBounds(fy) {
    const match = /^(\d{4})-(\d{2})$/.exec(fy);
    if (!match || String(Number(match[1])+1).slice(-2)!==match[2]) throw Error('Invalid financial year');
    return {start:match[1]+'-04-01',end:(Number(match[1])+1)+'-03-31',firstYear:Number(match[1])};
  }
  async function all(sb,table,sort) {
    const result=[];
    for(let offset=0;offset<50000;offset+=500) {
      const {data,error}=await sb.from(table).select('*').order(sort,{ascending:true}).range(offset,offset+499);
      if(error) throw Error('Could not load '+table+': '+error.message);
      result.push(...(data||[]));
      if((data||[]).length<500)return result;
    }
    throw Error('Export too large: '+table+' exceeded 50,000 rows. No partial Excel file was created.');
  }
  function add(addSheet,name,headers,rows) {
    addSheet(name,headers,rows.map(row=>row.map(clean)));
  }
  function employeeName(directory,id) {
    return directory.get(id)?.display_name || id || '';
  }
  function compFor(history,id,day) {
    return history.filter(x=>x.employee_id===id&&dateOnly(x.effective_from)<=day&&
      (!x.effective_to||dateOnly(x.effective_to)>=day))
      .sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0];
  }
  function rateFor(c) {
    if(!c)return null;
    return c.hourly_cost_override!=null?numeric(c.hourly_cost_override):numeric(c.monthly_cost)/(22*8);
  }
  function totalApproved(requests,id,type,year) {
    return requests.filter(r=>r.member_id===id&&r.leave_type===type&&r.status==='Approved'&&
      dateOnly(r.start_date).startsWith(String(year)))
      .reduce((sum,r)=>sum+numeric(r.days),0);
  }
  function credited(policy,year,type,today) {
    if(!policy)return null;
    const currentYear=Number(today.slice(0,4));
    const quarters=year<currentYear?4:year>currentYear?0:Math.ceil(Number(today.slice(5,7))/3);
    return quarters*numeric(type==='Earned Leave'?policy.earned_quarterly:policy.sick_quarterly);
  }
  async function append(sb,fy,addSheet,projects) {
    const {start,end,firstYear}=fyBounds(fy);
    const {data:{user},error:authError}=await sb.auth.getUser();
    if(authError || !user || !financeEmails.has(String(user.email||'').toLowerCase()))
      throw Error('The complete management export is restricted to authorised finance management.');
    const {data:access,error:accessError}=await sb.from('user_access')
      .select('access_level,active,employment_status').eq('email',user.email.toLowerCase()).maybeSingle();
    if(accessError||!access||access.access_level!=='management'||!access.active||access.employment_status==='Exited')
      throw Error('Management access is required for the complete export.');

    // Fetch every page; Supabase PostgREST normally caps unpaginated queries at 1,000 rows.
    const tables=[
      ['time_entries','id'],['user_access','email'],['project_financial_entries','id'],
      ['project_revenue_history','id'],['compensation_history','id'],
      ['founder_monthly_hours','id'],['jg_attendance','id'],
      ['hr_leave_requests','id'],['hr_leave_opening','member_id'],
      ['hr_policy','calendar_year'],['hr_lifecycle_tasks','id']
    ];
    const records=await Promise.all(tables.map(([table,sort])=>all(sb,table,sort)));
    const data=Object.fromEntries(tables.map((x,i)=>[x[0],records[i]]));
    const staff=new Map(data.user_access.map(x=>[x.member_id,x]));
    const within=v=>dateOnly(v)>=start&&dateOnly(v)<=end;
    const logs=data.time_entries.filter(x=>within(x.work_date));
    const attendance=data.jg_attendance.filter(x=>within(x.attendance_date));
    const leaves=data.hr_leave_requests.filter(x=>dateOnly(x.end_date)>=start&&dateOnly(x.start_date)<=end);
    const lifecycle=data.hr_lifecycle_tasks.filter(x=>
      within(x.created_at)||within(x.due_on)||within(x.completed_on));
    const financials=data.project_financial_entries;
    const revenues=data.project_revenue_history;
    const comps=data.compensation_history;
    const today=dayStart();

    add(addSheet,'Daily Work Logs',
      ['Date','Employee','Member ID','Project','Project ID','Pond','Activity','Task','Minutes','Hours','Locked'],
      logs.map(x=>[x.work_date,employeeName(staff,x.employee_id),x.employee_id,x.project_name,x.project_id,
        x.project_pond,x.activity_type,x.task_description,numeric(x.minutes),numeric(x.minutes)/60,Boolean(x.locked)]));
    const hours=new Map();
    for(const log of logs) {
      const key=log.project_id+'|'+log.employee_id;
      if(!hours.has(key))hours.set(key,{id:log.project_id,name:log.project_name,
        employee:log.employee_id,minutes:0,entries:0});
      const r=hours.get(key);r.minutes+=numeric(log.minutes);r.entries++;
    }
    add(addSheet,'Actual Project Hours',
      ['Project','Project ID','Employee','Entries','Minutes','Hours'],
      [...hours.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(x=>
        [x.name,x.id,employeeName(staff,x.employee),x.entries,x.minutes,x.minutes/60]));

    // Project profitability follows the existing profitability dashboard's FY and lifetime
    // basis, with explicit warning when labour rates or time entries are unavailable.
    const projectRows=[];
    for(const project of projects) {
      const classification=project.financialClass||
        (project.type==='Internal'?'Internal':project.type==='Pitch'?'Non-Revenue External':'Revenue Generating');
      const commercial=classification==='Revenue Generating';
      const fixed=commercial&&project.type!=='Retainer';
      const projectLogs=data.time_entries.filter(x=>x.project_id===project.id&&(fixed||within(x.work_date)));
      const fin=financials.filter(x=>x.project_id===project.id&&(fixed||within(x.entry_month)));
      const mins=projectLogs.reduce((sum,x)=>sum+numeric(x.minutes),0);
      const missingRates=projectLogs.filter(x=>!compFor(comps,x.employee_id,dateOnly(x.work_date))).length;
      const labour=projectLogs.reduce((sum,x)=>{
        const c=compFor(comps,x.employee_id,dateOnly(x.work_date));
        const rate=rateFor(c);
        return sum+(rate===null?0:rate*numeric(x.minutes)/60);
      },0);
      const external=fin.reduce((sum,x)=>sum+numeric(x.external_cost),0);
      let revenue=0;
      if(commercial) {
        if(fixed) {
          const latest=financials.filter(x=>x.project_id===project.id).sort((a,b)=>
            String(b.entry_month).localeCompare(String(a.entry_month))||
            String(b.updated_at).localeCompare(String(a.updated_at)))[0];
          revenue=numeric(latest?.revenue);
        }else {
          const months=[...new Set(projectLogs.map(x=>dateOnly(x.work_date).slice(0,7)))];
          if(!months.length) revenue=fin.reduce((s,x)=>s+numeric(x.revenue),0);
          else for(const month of months){
            const rate=revenues.filter(x=>x.project_id===project.id&&dateOnly(x.effective_from)<=month+'-31'&&
              (!x.effective_to||dateOnly(x.effective_to)>=month+'-01'))
              .sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0];
            revenue+=rate?numeric(rate.monthly_revenue):fin.filter(x=>dateOnly(x.entry_month).slice(0,7)===month)
              .reduce((s,x)=>s+numeric(x.revenue),0);
          }
        }
      }
      const valid=mins>0&&missingRates===0;
      const profit=valid&&commercial?revenue-labour-external:null;
      const margin=profit!==null&&revenue>0?profit/revenue:null;
      projectRows.push([project.brand,project.id,project.type,classification,fixed?'Lifetime':'Selected FY',
        mins/60,revenue,valid?labour:null,external,valid?labour+external:null,profit,margin,
        missingRates?('Missing cost rates on '+missingRates+' entries'):!mins?'Awaiting Work Logs':
        !commercial?'Investment / non-revenue':'Indicative: verify completeness']);
    }
    add(addSheet,'Project Profitability',
      ['Project','Project ID','Type','Financial Class','Basis','Logged Hours','Revenue INR',
        'Labour Cost INR','External Cost INR','Total Cost INR','Profit INR','Margin','Data Quality'],
      projectRows);

    add(addSheet,'Financial Entries',
      ['Month','Project','Project ID','Pond','Revenue INR','External Cost INR','Notes'],
      financials.filter(x=>within(x.entry_month)).map(x=>[x.entry_month,x.project_name,x.project_id,
        x.ownership_pond,numeric(x.revenue),numeric(x.external_cost),x.notes]));
    add(addSheet,'Revenue Schedules',
      ['Project ID','Project','Effective From','Effective To','Monthly Revenue INR','Notes'],
      revenues.filter(x=>dateOnly(x.effective_from)<=end&&(!x.effective_to||dateOnly(x.effective_to)>=start))
        .map(x=>[x.project_id,x.project_name,x.effective_from,x.effective_to,numeric(x.monthly_revenue),x.notes]));
    add(addSheet,'Cost Rate History',
      ['Employee','Member ID','From','To','Monthly Cost INR','Hourly Override INR','Notes'],
      comps.filter(x=>dateOnly(x.effective_from)<=end&&(!x.effective_to||dateOnly(x.effective_to)>=start))
        .map(x=>[employeeName(staff,x.employee_id),x.employee_id,x.effective_from,x.effective_to,
          numeric(x.monthly_cost),x.hourly_cost_override,x.notes]));
    add(addSheet,'Founder Hour Overrides',
      ['Employee','Member ID','Project ID','Month','Hours','Notes'],
      data.founder_monthly_hours.filter(x=>within(x.entry_month)).map(x=>
        [employeeName(staff,x.employee_id),x.employee_id,x.project_id,x.entry_month,numeric(x.hours),x.note]));
    add(addSheet,'Employee Attendance',
      ['Date','Employee','Member ID','Work Mode','Check-in IST','Check-out IST'],
      attendance.map(x=>[x.attendance_date,employeeName(staff,x.member_id),x.member_id,x.work_mode,
        x.check_in_at,x.check_out_at]));
    add(addSheet,'Leave History',
      ['Employee','Member ID','Leave Type','Start','End','Days','Status','Decision Date'],
      leaves.map(x=>[employeeName(staff,x.member_id),x.member_id,x.leave_type,x.start_date,
        x.end_date,numeric(x.days),x.status,x.decided_at]));
    const balanceRows=[];
    for(const person of data.user_access) {
      for(const year of [firstYear,firstYear+1]) {
        const policy=data.hr_policy.find(x=>x.calendar_year===year);
        const opening=data.hr_leave_opening.find(x=>x.member_id===person.member_id&&x.calendar_year===year);
        const earned=credited(policy,year,'Earned Leave',today),sick=credited(policy,year,'Sick Leave',today);
        const earnedUsed=totalApproved(data.hr_leave_requests,person.member_id,'Earned Leave',year);
        const sickUsed=totalApproved(data.hr_leave_requests,person.member_id,'Sick Leave',year);
        const compassionUsed=totalApproved(data.hr_leave_requests,person.member_id,'Compassion Leave',year);
        balanceRows.push([person.display_name,person.member_id,year,earned,
          opening?numeric(opening.earned_adjustment):0,earnedUsed,
          earned===null?null:Math.max(0,earned+numeric(opening?.earned_adjustment)-earnedUsed),
          sick,opening?numeric(opening.sick_adjustment):0,sickUsed,
          sick===null?null:Math.max(0,sick+numeric(opening?.sick_adjustment)-sickUsed),
          policy?numeric(policy.compassion_days):null,compassionUsed,
          policy?Math.max(0,numeric(policy.compassion_days)-compassionUsed):null,
          policy?'INDICATIVE - prior Keka history not imported':'NOT CONFIGURED - year policy missing']);
      }
    }
    add(addSheet,'Leave Balances',
      ['Employee','Member ID','Calendar Year','Earned Credited','Earned Adjustment','Earned Used',
        'Earned Indicative Balance','Sick Credited','Sick Adjustment','Sick Used','Sick Indicative Balance',
        'Compassion Entitlement','Compassion Used','Compassion Indicative Balance','Reliability'],
      balanceRows);
    add(addSheet,'Employee Directory',
      ['Name','Member ID','Email','Designation','Group','Access Level','Employment Status',
        'Active','Joining Date','Last Working Date'],
      data.user_access.map(x=>[x.display_name,x.member_id,x.email,x.title,x.head_group,
        x.access_level,x.employment_status,x.active,x.joining_date,x.last_working_date]));
    add(addSheet,'Onboarding Exits',
      ['Employee','Member ID','Lifecycle','Task','Assigned To','Due Date','Status',
        'Completed On','Notes'],
      lifecycle.map(x=>[employeeName(staff,x.member_id),x.member_id,x.lifecycle_type,x.task_title,
        employeeName(staff,x.assigned_to_member_id),x.due_on,x.status,x.completed_on,x.notes]));
    add(addSheet,'Management Report Notes',
      ['Item','Important context'],[
        ['Reporting window',start+' through '+end+' (April to March financial year)'],
        ['Security','Confidential management report: contains employee, leave and financial information.'],
        ['Leave balances','Indicative only. Prior Keka history and individual opening balances may not be imported.'],
        ['Leave history','Only currently stored requests; reset requests from before Jan 2027 are archived separately.'],
        ['Profitability','Retainers use FY work logs; fixed-fee projects use lifetime entries, matching dashboard basis.'],
        ['Profitability reliability','Incomplete time logs and cost rates can understate labour cost and overstate profit.'],
        ['Attendance','Recorded check-in sessions only, not a payroll attendance calculation.'],
        ['Onboarding and exits','Shows stored checklist tasks within the FY. No tasks means no records exist.'],
        ['Sensitive information','Do not forward or upload externally. Retain according to company HR policy.']
      ]);
    return {sheetsAdded:13,records:logs.length};
  }
  window.JGManagementExport={append};
})();