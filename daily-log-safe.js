'use strict';
function safeText(v){
  var d=document.createElement('div');
  d.textContent=String(v==null?'':v);
  return d.innerHTML;
}
function showMessage(m){
  var r=document.getElementById('worklogRoot');
  if(r)r.textContent=String(m||'');
}
