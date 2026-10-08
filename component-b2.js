'use strict';
function makeTextField(label,id,placeholder){
  var d=document.createElement('div');d.className='field worklog-task-field';
  var l=document.createElement('label');l.textContent=label;
  var x=document.createElement('input');x.id=id;x.maxLength=220;x.placeholder=placeholder;
  d.append(l,x);return d;
}
function makeNumberField(label,id,step,placeholder){
  var d=document.createElement('div');d.className='field';
  var l=document.createElement('label');l.textContent=label;
  var x=document.createElement('input');x.id=id;x.type='number';x.min='0';x.step=step;x.placeholder=placeholder;x.inputMode='decimal';
  if(id==='wlMinutes')x.max='59';else x.max='24';
  d.append(l,x);return d;
}
