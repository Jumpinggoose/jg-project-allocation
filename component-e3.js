'use strict';
async function saveWorklogEntry(){
  var projectId=document.getElementById('wlProject').value;
  var project=(appState.projects||[]).find(function(p){return p.id===projectId;});
  var hours=Number(document.getElementById('wlHours').value||0);
  var mins=Number(document.getElementById('wlMinutes').value||0);
  var total=Math.round(hours*60)+Math.round(mins);
  if(!project)return alert('Choose a project.');
  if(!Number.isFinite(total)||total<=0)return alert('Enter hours and/or minutes.');
  if(!Number.isInteger(mins)||mins<0||mins>59)return alert('Minutes must be a whole number from 0 to 59.');
  var result=await sb.rpc('add_time_entry',{
    p_work_date:selectedDate,
    p_project_id:project.id,
    p_project_name:project.brand,
    p_project_pond:project.pond,
    p_activity_type:document.getElementById('wlActivity').value,
    p_task_description:document.getElementById('wlTask').value.trim(),
    p_minutes:total
  });
  if(result.error)return alert('Could not save this entry.');
  await loadWorklogEntries();
}
