'use strict';
function buildEntriesPanel(day,totalMinutes){
  var s=document.createElement('section');
  s.className='panel';
  var head=document.createElement('div');
  head.className='panel-header';
  var title=document.createElement('h2');
  title.className='panel-title';
  title.textContent='Entries';
  var total=document.createElement('span');
  total.className='pill-count';
  total.textContent=duration(totalMinutes);
  head.append(title,total);
  s.appendChild(head);
  if(!day.length){
    var empty=document.createElement('div');
    empty.className='empty-state';
    empty.textContent='No entries for this date.';
    s.appendChild(empty);
    return s;
  }
  var body=document.createElement('div');
  body.className='panel-body';
  var list=document.createElement('div');
  list.className='entry-list';
  day.forEach(function(item){list.appendChild(buildEntryRow(item));});
  body.appendChild(list);
  s.appendChild(body);
  return s;
}
