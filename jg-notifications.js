'use strict';
/* Shared in-app notifications. Leave data remains governed by existing Supabase RLS. */
(() => {
  const STYLE = 'jg-notification-styles';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => { const d=new Date(value); return isNaN(d.getTime())?'':d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}); };
  let client=null,user=null,items=[],reads=new Set(),panel=null,button=null,count=null,content=null,refreshing=false;
  let timer=null;
  function addStyles(){
    if(document.getElementById(STYLE))return;
    const st=document.createElement('style');st.id=STYLE;
    st.textContent=`
      .jg-notifications{position:relative;flex:0 0 auto;align-self:center;z-index:35}
      .jg-notification-button{position:relative;display:grid;place-items:center;width:42px;height:42px;border-radius:12px;border:1px solid #44404d;background:#28252e;color:#f4eff6;cursor:pointer}
      .jg-notification-button:hover,.jg-notification-button:focus-visible{border-color:#ff0072;background:#342633}
      .jg-notification-button svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .jg-notification-count{position:absolute;top:-5px;right:-6px;min-width:19px;height:19px;border-radius:12px;background:#ff0072;color:white;font-size:10px;display:grid;place-items:center;font-weight:800;padding:0 4px}
      .jg-notification-count[hidden],.jg-notification-panel[hidden]{display:none!important}
      .jg-notification-panel{position:fixed;top:0;left:0;width:min(360px,calc(100vw - 24px));max-height:min(480px,75vh);overflow:auto;background:#222027;border:1px solid #4c434f;border-radius:17px;box-shadow:0 24px 58px #0009;color:#f7f1f7;z-index:1000}
      .jg-notification-head{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:15px 16px;background:#25212a;border-bottom:1px solid #403a45;z-index:1}
      .jg-notification-head strong{font-size:14px}.jg-notification-head button{border:0;background:none;color:#ff8aba;font:inherit;font-size:12px;cursor:pointer}
      .jg-notification-item{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #39343d;background:transparent;color:inherit;padding:13px 16px;cursor:pointer}
      .jg-notification-item:hover{background:#302731}.jg-notification-item.unread{background:#342631}
      .jg-notification-item strong{display:block;font-size:13px;margin-bottom:5px}
      .jg-notification-item span{display:block;color:#bab2c1;font-size:12px;line-height:1.45}
      .jg-notification-item small{display:block;color:#9e98a4;font-size:11px;margin-top:6px}
      .jg-notification-empty{padding:22px 16px;text-align:center;color:#bab2c1;font-size:13px}
      @media(max-width:760px){.jg-notifications{margin-left:auto}.jg-notification-panel{max-height:70vh}}
    `;
    document.head.appendChild(st);
  }
  function render(){
    if(!content)return;
    const unread=items.filter(i=>!reads.has(i.key)).length;
    count.hidden=unread===0;count.textContent=unread>99?'99+':String(unread);
    button.setAttribute('aria-label',unread?unread+' unread notifications':'Notifications');
    if(!items.length){content.innerHTML='<div class="jg-notification-empty">You\'re all caught up.</div>';return;}
    content.innerHTML=items.map(item=>'<button type="button" class="jg-notification-item '+(reads.has(item.key)?'':'unread')+'" data-notification-key="'+esc(item.key)+'"><strong>'+esc(item.title)+'</strong><span>'+esc(item.detail)+'</span><small>'+esc(item.date)+'</small></button>').join('');
  }
  async function markRead(keys){
    const missing=keys.filter(k=>!reads.has(k));if(!missing.length||!client||!user)return;
    // Update the badge immediately; save read receipts under authenticated RLS.
    missing.forEach(k=>reads.add(k));render();
    const {error}=await client.from('jg_notification_reads').upsert(missing.map(notification_key=>({user_id:user.id,notification_key})),{onConflict:'user_id,notification_key'});
    if(error){missing.forEach(k=>reads.delete(k));render();console.warn('Notification read status could not be saved',error.message);}
  }
  function positionPanel(){
    if(!panel||!button||panel.hidden)return;
    const rect=button.getBoundingClientRect();
    const width=Math.min(360,window.innerWidth-24);
    const sidebar=document.querySelector('.sidebar');
    const sidebarRect=sidebar?.getBoundingClientRect();
    const occupied=sidebarRect&&sidebarRect.right>0&&sidebarRect.left<window.innerWidth&&sidebarRect.width<window.innerWidth*.65;
    const minLeft=occupied&&window.innerWidth>=760?Math.max(12,sidebarRect.right+12):12;
    const available=window.innerWidth-minLeft-12;
    const usableWidth=Math.max(180,Math.min(width,available));
    panel.style.width=usableWidth+'px';
    panel.style.left=Math.max(minLeft,Math.min(rect.right-usableWidth,window.innerWidth-usableWidth-12))+'px';
    const spaceBelow=window.innerHeight-rect.bottom-14;
    const maxHeight=Math.min(480,Math.max(160,window.innerHeight-24));
    if(spaceBelow<190&&rect.top>spaceBelow){
      panel.style.maxHeight=Math.min(maxHeight,Math.max(140,rect.top-24))+'px';
      panel.style.top='auto';panel.style.bottom=(window.innerHeight-rect.top+8)+'px';
    }else{
      panel.style.bottom='auto';
      panel.style.top=Math.max(12,Math.min(rect.bottom+8,window.innerHeight-160))+'px';
      panel.style.maxHeight=Math.min(maxHeight,Math.max(140,window.innerHeight-rect.bottom-20))+'px';
    }
  }
  function createBell(){
    const topbar=document.querySelector('.topbar');if(!topbar)return false;
    addStyles();
    const shell=document.createElement('div');shell.className='jg-notifications';
    shell.innerHTML='<button type="button" class="jg-notification-button" aria-label="Notifications" aria-expanded="false" title="Notifications"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="jg-notification-count" hidden></span></button><section class="jg-notification-panel" role="region" aria-label="Notifications" hidden><div class="jg-notification-head"><strong>Notifications</strong><button type="button" class="jg-notification-read-all">Mark all read</button></div><div class="jg-notification-content"><div class="jg-notification-empty">Loading notifications…</div></div></section>';
    const actions=topbar.querySelector('.topbar-actions');
    if(actions)actions.prepend(shell);else topbar.appendChild(shell);
    button=shell.querySelector('.jg-notification-button');panel=shell.querySelector('.jg-notification-panel');count=shell.querySelector('.jg-notification-count');content=shell.querySelector('.jg-notification-content');
    // Portal outside topbar's stacking context so sidebar cannot cover the dropdown.
    document.body.appendChild(panel);
    button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){positionPanel();refresh();}});
    panel.querySelector('.jg-notification-read-all').addEventListener('click',()=>markRead(items.map(i=>i.key)));
    panel.addEventListener('click',async e=>{const target=e.target.closest('[data-notification-key]');if(!target)return;const item=items.find(i=>i.key===target.dataset.notificationKey);if(!item)return;await markRead([item.key]);window.location.href=item.href;});
    document.addEventListener('click',e=>{if(!shell.contains(e.target)&&!panel.contains(e.target)){panel.hidden=true;button.setAttribute('aria-expanded','false');}});
    window.addEventListener('resize',positionPanel);
    window.addEventListener('scroll',positionPanel,true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();}});
    return true;
  }
  async function refresh(){
    if(refreshing||!client||!user)return;
    refreshing=true;
    try {
      const [accessRes,requestRes,reportRes,readRes]=await Promise.all([
        client.from('user_access').select('member_id,access_level,email').limit(100),
        client.from('hr_leave_requests').select('id,member_id,leave_type,start_date,end_date,status,created_at,decided_at').order('created_at',{ascending:false}).limit(200),
        client.from('hr_reporting').select('member_id,manager_member_id'),
        client.from('jg_notification_reads').select('notification_key').eq('user_id',user.id)
      ]);
      if(requestRes.error)throw requestRes.error;
      if(readRes.error)throw readRes.error;
      const access=(accessRes.data||[]).find(a=>String(a.email||'').toLowerCase()===String(user.email||'').toLowerCase())
        ||(accessRes.data||[]).find(a=>a.member_id===({'accounts@jumpinggoose.com':'bhagya','saurabh@jumpinggoose.com':'sourabh','sirajul@jumpinggoose.com':'siraj'}[String(user.email||'').toLowerCase()]));
      const member=access?.member_id;
      const admin=access?.access_level==='management'||member==='bhagya';
      const direct=new Set((reportRes.data||[]).filter(r=>r.manager_member_id===member).map(r=>r.member_id));
      reads=new Set((readRes.data||[]).map(r=>r.notification_key));
      items=[];
      for(const r of requestRes.data||[]){
        const range=fmt(r.start_date)+(r.end_date!==r.start_date?' – '+fmt(r.end_date):'');
        if(r.member_id===member&&['Approved','Rejected'].includes(r.status)){
          items.push({key:'leave-decision:'+r.id+':'+r.status,title:'Leave request '+r.status.toLowerCase(),detail:r.leave_type+' · '+range,date:fmt(r.decided_at||r.created_at),sort:r.decided_at||r.created_at,href:'/hr.html?tab=leave'});
        }
        if(r.status==='Pending'&&r.member_id!==member&&(admin||direct.has(r.member_id))){
          // HR's leave SELECT RLS also protects the underlying request visibility.
          items.push({key:'leave-request:'+r.id,title:'New leave request',detail:r.member_id+' · '+r.leave_type+' · '+range,date:fmt(r.created_at),sort:r.created_at,href:'/hr.html?tab=approvals'});
        }
      }
      items.sort((a,b)=>String(b.sort).localeCompare(String(a.sort)));
      render();
    }catch(err){console.warn('Notifications unavailable',err.message);if(!items.length&&content)content.innerHTML='<div class="jg-notification-empty">Notifications are temporarily unavailable.</div>';}
    finally{refreshing=false;}
  }
  async function start(){
    if(!createBell())return;
    const conf=window.JG_SUPABASE;
    if(!window.supabase||!conf?.url||!conf?.publishableKey)return;
    client=window.supabase.createClient(conf.url,conf.publishableKey);
    const auth=await client.auth.getUser();
    if(auth.error||!auth.data?.user)return;
    user=auth.data.user;
    await refresh();
    timer=setInterval(()=>{if(!document.hidden)refresh();},30000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
