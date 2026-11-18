'use strict';
/* One canonical navigation across JG Project Log. Role visibility set after each page verifies access. */
(function(){
  const dashboard = location.pathname === '/' || location.pathname.endsWith('/index.html');
  const path = location.pathname;
  const tab = new URLSearchParams(location.search).get('tab') || 'calendar';
  const view = new URLSearchParams(location.search).get('view') || 'dashboard';
  const active = dashboard ? view : path.includes('worklog') ? 'worklog' : path.includes('employee-logs') ? 'employee-logs' : path.includes('profitability') ? 'profitability' : path.includes('attendance.html') ? 'attendance' : path.includes('profile.html') ? 'profile' : path.includes('directory.html') ? 'directory' : path.includes('hr.html') ? ({calendar:'hr',leave:'hr-leave',availability:'hr-team',approvals:'hr-approvals',settings:'hr-settings'}[tab] || 'hr') : '';
  const items = [
    {type:'heading',label:'MY WORKSPACE'},
    {id:'worklog',label:'My Work Log',icon:'◷',url:'/worklog.html'},
    {id:'hr',label:'Calendar & Holidays',icon:'▦',url:'/hr.html?tab=calendar'},
    {id:'hr-leave',label:'My Leave',icon:'▣',url:'/hr.html?tab=leave'},
    {id:'attendance',label:'My Attendance & WFH',icon:'◉',url:'/attendance.html'},
    {id:'profile',label:'My Profile',icon:'♙',url:'/profile.html'},
    {type:'heading',label:'MANAGEMENT',management:true},
    {id:'dashboard',label:'Dashboard',icon:'▦',url:'/?view=dashboard'},
    {type:'pond'},
    {id:'directory',label:'Employee Directory',icon:'♧',url:'/directory.html',manager:true},
    {id:'team',label:'Team Overview',icon:'◎',url:'/?view=team',manager:true},
    {id:'hr-team',label:'Team Availability',icon:'▦',url:'/hr.html?tab=availability',manager:true},
    {id:'hr-approvals',label:'Leave Approvals',icon:'☷',url:'/hr.html?tab=approvals',approver:true},
    {id:'employee-logs',label:'Employee Logs',icon:'≡',url:'/employee-logs.html',manager:true},
    {id:'profitability',label:'Profitability',icon:'◴',url:'/profitability.html',finance:true},
    {id:'setup',label:'Admin Panel',icon:'⚙',url:'/?view=setup',admin:true}
  ];
  const attr=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function link(item){
    const isActive=active===item.id;
    const attrs=(item.manager?' data-management-nav':'')+(item.manager||item.approver||item.finance||item.admin?' hidden':'');
    const id=item.id==='employee-logs'?' id="'+(path.includes('/hr.html')?'hrEmployeeLogs':'employeeLogsLink')+'"':item.id==='profitability'?' id="'+(path.includes('/hr.html')?'hrProfitability':'profitLink')+'"':'';
    const label='<span class="nav-icon" aria-hidden="true">'+item.icon+'</span><span>'+attr(item.label)+'</span>';
    if(dashboard) return '<button class="nav-item'+(isActive?' is-active':'')+'" type="button" data-view="'+item.id+'"'+attrs+id+'>'+label+'</button>';
    return '<a class="nav-item'+(isActive?' is-active':'')+'" data-view="'+item.id+'" href="'+item.url+'"'+attrs+id+'>'+label+'</a>';
  }
  function pond(){
    const opened=active==='pond1'||active==='pond2';
    const child=(id,text,icon)=>link({id,label:text,icon,url:'/?view='+id});
    return '<div class="jg-nav-folder" data-pond-folder>'+
     '<button class="jg-nav-folder-toggle" id="jgPondToggle" type="button" aria-expanded="'+opened+'" aria-controls="jgPondLinks"><span class="nav-icon" aria-hidden="true">▤</span><span>Pond Projects</span><span class="jg-nav-chevron" aria-hidden="true">⌄</span></button>'+
     '<div class="jg-nav-folder-links" id="jgPondLinks"'+(opened?'':' hidden')+'>'+child('pond1','Pond 1 Projects','①')+child('pond2','Pond 2 Projects','②')+'</div></div>';
  }
  function install(){
    const nav=document.querySelector('aside.sidebar nav.nav-list');
    if(!nav)return;
    if (nav.dataset.jgCanonical !== 'true') {
      nav.innerHTML=items.map(item=>{
      if(item.type==='heading')return '<div class="jg-nav-group-label"'+(item.management?' data-management-section':'')+'>'+item.label+'</div>';
      if(item.type==='pond')return pond();
      if(item.later)return '<div class="nav-item jg-nav-coming" aria-disabled="true"><span class="nav-icon" aria-hidden="true">'+item.icon+'</span><span>'+attr(item.label)+'</span></div>';
      return link(item);
      }).join('');
    }
    nav.classList.add('jg-workspace-nav');
    if(path.includes('worklog')) nav.id='worklogSidebarNav';
    nav.setAttribute('aria-label','Workspace navigation');
    restoreVisibility();
    // Dashboard has its existing pond toggle listener in app.js.
    if(!dashboard){
      const toggle=nav.querySelector('#jgPondToggle'),panel=nav.querySelector('#jgPondLinks');
      toggle?.addEventListener('click',()=>{
        const next=toggle.getAttribute('aria-expanded')!=='true';
        toggle.setAttribute('aria-expanded',String(next));panel.hidden=!next;
      });
    }
  }
  // Restore cosmetic menu visibility before the browser paints a newly loaded page.
  // Actual access control remains in the page's authenticated Supabase checks.
  const ACCESS_CACHE_KEY = 'jg-nav-visibility-v1';
  function applyVisibility(flags) {
    if (!flags || typeof flags !== 'object') return;
    const {canManage, isAdmin, allowedFinance, canApprove} = flags;
    document.querySelectorAll('.jg-workspace-nav [data-management-nav]').forEach(el => {el.hidden = !canManage;});
    const ids = {employeeLogsLink:canManage,profitLink:allowedFinance,hrEmployeeLogs:canManage,hrProfitability:allowedFinance};
    Object.entries(ids).forEach(([id,visible]) => {const el=document.getElementById(id);if(el)el.hidden=!visible;});
    const show = (view,visible) => {
      const el=document.querySelector('.jg-workspace-nav [data-view="'+view+'"]');
      if (el) el.hidden=!visible;
    };
    show('hr-approvals',isAdmin||canApprove);
    show('hr-team',canManage);
    show('directory',Boolean(flags.isManagement));
    show('setup',isAdmin);
    const heading=document.querySelector('.jg-workspace-nav [data-management-section]');
    if (heading) heading.hidden=!canManage;
  }
  function restoreVisibility() {
    try {
      const cached=JSON.parse(sessionStorage.getItem(ACCESS_CACHE_KEY)||'null');
      if (cached && typeof cached.canManage==='boolean' &&
        typeof cached.isAdmin==='boolean' && typeof cached.allowedFinance==='boolean' &&
        typeof cached.canApprove==='boolean' && typeof cached.isManagement==='boolean') applyVisibility(cached);
    } catch (_) { /* Storage can be unavailable; fall back to permissions fetch. */ }
  }
  function setAccess({level='employee',memberId='',email='',canApprove=false}={}){
    const isAdmin=level==='management'||memberId==='bhagya';
    const canManage=isAdmin||level==='project_manager';
    const allowedFinance=isAdmin&&['piyush@jumpinggoose.com','tuhin@jumpinggoose.com','accounts@jumpinggoose.com','theo@jumpinggoose.com'].includes(String(email).toLowerCase());
    const flags={isAdmin,canManage,allowedFinance,canApprove:Boolean(canApprove),isManagement:level==='management'};
    applyVisibility(flags);
    try { sessionStorage.setItem(ACCESS_CACHE_KEY,JSON.stringify(flags)); } catch (_) {}

  }
  document.addEventListener('click',event=>{
    if (event.target.closest('#logoutButton,#hrLogout,[data-action="logout"]')) {
      try { sessionStorage.removeItem(ACCESS_CACHE_KEY); } catch (_) {}
    }
  },true);
  window.JGNav={setAccess,install};
  // Script loads after the sidebar markup on every page. Install synchronously
  // so the canonical menu is in place before deferred page initialization.
  install();
})();