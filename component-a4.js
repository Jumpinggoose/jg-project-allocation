'use strict';
function makePanelHeader(){
  var s=document.createElement('section');s.className='worklog-summary';
  var left=document.createElement('div');
  var eye=document.createElement('div');eye.className='section-eyebrow';eye.textContent='Daily entries';
  var h=document.createElement('h2');h.textContent=longDate(selectedDate);
  var p=document.createElement('p');p.textContent='Add each activity separately. There is no required daily total.';
  left.append(eye,h,p);
  var right=document.createElement('div');right.className='worklog-summary-actions';
  var label=document.createElement('label');label.className='field';
  var cap=document.createElement('span');cap.className='field-label';cap.textContent='Date';
  var input=document.createElement('input');input.type='date';input.value=selectedDate;input.dataset.control='worklog-date';
  label.append(cap,input);
  var b=document.createElement('button');b.type='button';b.className='button button-secondary';b.dataset.action='worklog-today';b.textContent='Today';
  right.append(label,b);s.append(left,right);return s;
}
