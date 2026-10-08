'use strict';
function buildWorklogKpi(label,value,meta,accent){
  var a=document.createElement('article');
  a.className='kpi-card'+(accent?' is-accent':'');
  var l=document.createElement('div');l.className='kpi-label';l.textContent=label;
  var v=document.createElement('div');v.className='kpi-value';v.textContent=value;
  var m=document.createElement('div');m.className='kpi-meta';m.textContent=meta;
  a.append(l,v,m);
  return a;
}
