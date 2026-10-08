'use strict';
function buildWorklogHeader(){
  var s=document.createElement('section');
  s.className='worklog-summary';
  var h=document.createElement('h2');
  h.textContent=longDate(selectedDate);
  var p=document.createElement('p');
  p.textContent='Record actual project time for this day. There is no required daily total.';
  s.append(h,p);
  return s;
}
