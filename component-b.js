'use strict';
function buildWorklogForm(){
  var s=document.createElement('section');s.className='panel';
  var head=document.createElement('div');head.className='panel-header';
  var t=document.createElement('h2');t.className='panel-title';t.textContent='New time entry';
  var p=document.createElement('p');p.className='panel-subtitle';p.textContent='Use separate entries for design, meetings, research, planning and other activities.';
  var box=document.createElement('div');box.append(t,p);head.appendChild(box);s.appendChild(head);
  var body=document.createElement('div');body.className='panel-body';
  var grid=document.createElement('div');grid.className='worklog-entry-grid';
  grid.append(makeProjectField(),makeActivityField(),makeTextField('Task / description','wlTask','What did you work on?'),makeNumberField('Hours','wlHours','0.1','1'),makeNumberField('Minutes','wlMinutes','1','20'));
  var add=document.createElement('div');add.className='worklog-add-wrap';
  var b=document.createElement('button');b.type='button';b.className='button button-primary';b.dataset.action='worklog-save';b.textContent='Add entry';
  var sm=document.createElement('small');sm.textContent='Any whole minutes from 0–59. No seconds.';add.append(b,sm);grid.appendChild(add);
  body.appendChild(grid);s.appendChild(body);return s;
}
function makeProjectField(){
  var d=document.createElement('div');d.className='field worklog-project-field';
  var l=document.createElement('label');l.textContent='Project';
  var x=document.createElement('select');x.id='wlProject';addProjectOptions(x);d.append(l,x);return d;
}
function makeActivityField(){
  var d=document.createElement('div');d.className='field';var l=document.createElement('label');l.textContent='Activity';
  var x=document.createElement('select');x.id='wlActivity';
  ['Design / Execution','Idea / Concept','Research','Planning / Strategy','Meeting / Review','Coordination / Management','Production / Shoot','Copy / Content','Other'].forEach(function(v){var o=document.createElement('option');o.textContent=v;x.appendChild(o);});
  d.append(l,x);return d;
}
