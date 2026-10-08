'use strict';
function handleWorklogChange(event){
  if(event.target.dataset.control==='worklog-date'){
    selectedDate=event.target.value||localDate();
    renderWorklog();
  }
}
function handleWorklogClick(event){
  var b=event.target.closest('[data-action]');
  if(!b)return;
  if(b.dataset.action==='worklog-today'){
    selectedDate=localDate();
    renderWorklog();
    return;
  }
  if(b.dataset.action==='worklog-save')saveWorklogEntry();
}
