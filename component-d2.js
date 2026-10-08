'use strict';
function renderWorklog(){
  var root=document.getElementById('worklogRoot');
  root.replaceChildren();
  var wrap=document.createElement('div');
  wrap.className='stack-lg';
  wrap.appendChild(makePanelHeader());
  wrap.appendChild(buildWorklogForm());
  var day=entries.filter(function(item){return item.work_date===selectedDate;});
  var total=day.reduce(function(sum,item){return sum+Number(item.minutes||0);},0);
  wrap.appendChild(buildEntriesPanel(day,total));
  root.appendChild(wrap);
}
