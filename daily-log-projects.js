'use strict';
function worklogProjects(){
  var all=(appState&&appState.projects?appState.projects:[]).filter(function(p){
    return p.financialYear===appState.meta.currentFY&&p.status!=='Completed';
  });
  var keys=['leadSpoc','primary1','primary2','support1','support2','support3','support4','mentor1','mentor2'];
  var assigned=all.filter(function(p){return keys.some(function(k){return p[k]===access.member_id;});});
  var other=all.filter(function(p){return assigned.indexOf(p)<0;});
  return {assigned:assigned,other:other};
}
function addProjectOptions(select){
  var groups=worklogProjects();
  function addGroup(label,list){
    if(!list.length)return;
    var g=document.createElement('optgroup');g.label=label;
    list.slice().sort(function(a,b){return a.brand.localeCompare(b.brand);}).forEach(function(p){
      var o=document.createElement('option');o.value=p.id;o.textContent=p.brand+' · '+p.pond;g.appendChild(o);
    });
    select.appendChild(g);
  }
  addGroup('Assigned to me',groups.assigned);
  addGroup('Other live JG projects',groups.other);
}
