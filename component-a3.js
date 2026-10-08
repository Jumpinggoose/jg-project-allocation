'use strict';
function makePanelHeader(){
  var s=document.createElement('section');
  s.className='panel';
  var h=document.createElement('h2');
  h.textContent='Entries';
  s.appendChild(h);
  return s;
}
