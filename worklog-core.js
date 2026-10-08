'use strict';
const cfg=window.JG_SUPABASE;
const sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
let user=null,access=null,appState=null,entries=[];
document.addEventListener('DOMContentLoaded',async()=>{
  const auth=await sb.auth.getUser();
  if(auth.error||!auth.data.user)return location.replace('/login.html');
  user=auth.data.user;
  const email=String(user.email||'').toLowerCase();
  const ar=await sb.from('user_access').select('member_id,display_name,access_level,title,active').eq('email',email).maybeSingle();
  if(ar.error||!ar.data?.active)return location.replace('/login.html');
  access=ar.data;
  document.getElementById('worklogUser').textContent=access.display_name+' · '+(access.title||'Work Log');
});