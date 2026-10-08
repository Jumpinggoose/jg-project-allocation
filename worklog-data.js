'use strict';
let selectedDate=localDate();
document.addEventListener('DOMContentLoaded',function(){setTimeout(startWorklogData,150);});

async function startWorklogData(){
  if(!access||!user){setTimeout(startWorklogData,150);return;}
  const sr=await sb.from('app_state').select('data').eq('id',1).single();
  if(sr.error)return showMessage('Could not load project data.');
  appState=sr.data.data;
  document.getElementById('profitLink').hidden=access.access_level!=='management';
  document.getElementById('planningLink').hidden=access.access_level==='employee';
  document.getElementById('logoutButton').addEventListener('click',async function(){await sb.auth.signOut();location.replace('/login.html');});
  document.getElementById('worklogRoot').addEventListener('click',handleWorklogClick);
  document.getElementById('worklogRoot').addEventListener('change',handleWorklogChange);
  await loadWorklogEntries();
}

async function loadWorklogEntries(){
  const fy=appState.meta.currentFY||'2026-27';
  const y=Number(fy.slice(0,4));
  const r=await sb.from('time_entries')
    .select('id,user_id,employee_id,work_date,project_id,project_name,project_pond,activity_type,task_description,minutes,locked,created_at')
    .eq('user_id',user.id)
    .gte('work_date',y+'-04-01')
    .lte('work_date',(y+1)+'-03-31')
    .order('work_date',{ascending:false});
  if(r.error)return showMessage('Could not load your work log.');
  entries=r.data||[];
  renderWorklog();
}
