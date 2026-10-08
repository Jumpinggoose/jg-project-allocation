'use strict';
function showMessage(message){
  var root=document.getElementById('worklogRoot');
  if(!root)return;
  root.textContent=String(message||'');
}
