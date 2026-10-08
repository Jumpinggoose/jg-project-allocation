'use strict';
function buildEntryRow(item){
  var row=document.createElement('div');
  row.className='entry-card';
  var name=document.createElement('strong');
  name.textContent=item.project_name;
  var meta=document.createElement('small');
  meta.textContent=(item.project_pond||'')+' · '+item.activity_type;
  var task=document.createElement('p');
  task.textContent=item.task_description||'—';
  var value=document.createElement('strong');
  value.textContent=duration(item.minutes);
  row.append(name,meta,task,value);
  return row;
}
