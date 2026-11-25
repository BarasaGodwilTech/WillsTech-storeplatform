/* Will's Tech admin — single-page app (hash routing). Core + dashboard + orders. Other pages: pages.js */
(function(){
'use strict';
var TOKEN='willstech_admin_token', $=function(s,r){return(r||document).querySelector(s)};
var A=window.A={cache:{},pages:{},state:{}};
A.esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
A.money=function(n){return 'UGX '+Math.round(Number(n)||0).toLocaleString('en-UG')};
A.short=function(n){n=Number(n)||0;return n>=1e6?'UGX '+(n/1e6).toFixed(2).replace(/\.?0+$/,'')+'M':n>=1e3?'UGX '+Math.round(n/1e3)+'K':'UGX '+n};
A.date=function(d){return d?new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'};
A.ago=function(d){var s=(Date.now()-new Date(d))/1000;if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+' min ago';if(s<86400)return Math.floor(s/3600)+' hr ago';if(s<172800)return'Yesterday';return A.date(d)};
A.debounce=function(f,ms){var t;return function(){var a=arguments,c=this;clearTimeout(t);t=setTimeout(function(){f.apply(c,a)},ms||200)}};
A.api=async function(path,o){o=o||{};var h=Object.assign({},o.headers||{});var tk=localStorage.getItem(TOKEN);if(tk)h.Authorization='Bearer '+tk;
  if(o.body&&!(o.body instanceof FormData)){h['Content-Type']='application/json';if(typeof o.body!=='string')o.body=JSON.stringify(o.body)}
  var r=await fetch('/api'+path,Object.assign({},o,{headers:h}));
  if(r.status===401||r.status===403){localStorage.removeItem(TOKEN);location.replace('/admin/login');throw new Error('Session expired')}
  var d=null;try{d=await r.json()}catch(e){}
  if(!r.ok)throw new Error((d&&d.error)||'Request failed ('+r.status+')');return d};
/* cached GET (stale-while-revalidate not needed; explicit invalidate) */
A.get=async function(key,path,force){if(!force&&A.cache[key])return A.cache[key];return A.cache[key]=await A.api(path)};
A.bust=function(){for(var i=0;i<arguments.length;i++)delete A.cache[arguments[i]]};
A.toast=function(m,err){var t=document.createElement('div');t.className='toast'+(err?' err':'');t.innerHTML='<i class="fa-solid fa-'+(err?'triangle-exclamation':'check')+'"></i><span>'+A.esc(m)+'</span>';$('#toasts').appendChild(t);setTimeout(function(){t.remove()},3500)};
A.confirm=function(title,text,okLabel){return new Promise(function(res){var o=$('#overlay');o.innerHTML='<div class="modal"><div class="box"><h2>'+A.esc(title)+'</h2><p style="margin:0;color:var(--t2)">'+A.esc(text||'')+'</p><div class="acts" style="justify-content:flex-end"><button class="btn btn-s" data-x>Cancel</button><button class="btn btn-d" data-ok>'+A.esc(okLabel||'Delete')+'</button></div></div></div>';
  var done=function(v){o.innerHTML='';res(v)};o.querySelector('[data-x]').onclick=function(){done(false)};o.querySelector('[data-ok]').onclick=function(){done(true)};o.querySelector('.modal').onclick=function(e){if(e.target===this)done(false)}})};
A.drawer=function(title,body,foot){$('#drawer').innerHTML='<header><h2>'+title+'</h2><button class="ibtn" id="dx" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></header><div class="dbody">'+body+'</div>'+(foot?'<div class="dfoot">'+foot+'</div>':'');$('#drawer').classList.add('on');$('#dbg').classList.add('on');$('#dx').onclick=A.closeDrawer};
A.closeDrawer=function(){$('#drawer').classList.remove('on');$('#dbg').classList.remove('on')};
A.badge=function(s){var m={pending:['warn','Pending'],confirmed:['info','Confirmed'],shipped:['pur','Out for delivery'],completed:['ok','Completed'],cancelled:['bad','Cancelled'],new:['warn','New'],read:['n','Read'],done:['ok','Done']}[s]||['n',s];return'<span class="b b-'+m[0]+'">'+m[1]+'</span>'};
A.skeleton=function(n){var h='';for(var i=0;i<(n||6);i++)h+='<div class="sk" style="margin:16px 20px;width:'+(60+Math.random()*35)+'%"></div>';return h};
A.empty=function(icon,t){return'<div class="empty"><i class="fa-solid fa-'+icon+'"></i>'+A.esc(t)+'</div>'};
A.csv=function(name,rows){var c=rows.map(function(r){return r.map(function(v){v=String(v==null?'':v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')}).join('\n');var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+c],{type:'text/csv'}));a.download=name;a.click()};
A.head=function(t,s,acts){return'<div class="head"><div><h1>'+t+'</h1><p>'+(s||'')+'</p></div><div class="acts">'+(acts||'')+'</div></div>'};
A.wa=function(phone,msg){var p=String(phone||'').replace(/\D/g,'');if(p.length===10&&p[0]==='0')p='256'+p.slice(1);return'https://wa.me/'+p+(msg?'?text='+encodeURIComponent(msg):'')};

/* ---------- nav ---------- */
var NAV=[['Overview',[['dashboard','Dashboard','house']]],['Sell',[['orders','Orders','bag-shopping'],['products','Products','box'],['customers','Customers','user-group'],['coupons','Discount codes','ticket']]],['Catalog',[['categories','Categories','tags'],['reviews','Reviews & ratings','star']]],['Engage',[['messages','Messages','message'],['newsletter','Newsletter','envelope']]],['Store setup',[['delivery','Delivery & payments','truck'],['templates','Delivery templates','clipboard-list'],['store','Store details','store'],['photos','Photo storage','cloud']]],['System',[['settings','Settings','gear']]]];
A.counts={};
function renderNav(){var cur=(location.hash||'#dashboard').slice(1).split('/')[0],h='<div class="brand"><img class="logo" src="favicon.svg?v=4" alt="" width="38" height="38"><div><b>Will\'s Tech</b><small>ADMIN</small></div></div>';
  NAV.forEach(function(g){h+='<div class="grp">'+g[0].toUpperCase()+'</div>';g[1].forEach(function(i){var c=A.counts[i[0]];h+='<a class="nav'+(cur===i[0]?' on':'')+'" href="#'+i[0]+'"><i class="fa-solid fa-'+i[2]+'"></i>'+i[1]+(c?'<span class="cnt">'+c+'</span>':'')+'</a>'})});
  var u={};try{u=JSON.parse(localStorage.getItem('willstech_admin_user')||'{}')}catch(e){}var ini=(u.name||'WT').split(/\s+/).map(function(x){return x[0]}).join('').slice(0,2).toUpperCase();
  h+='<div class="sp"></div><a class="nav" href="/" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i>View store</a><div class="acct"><div class="av">'+A.esc(ini)+'</div><div style="flex:1;min-width:0"><b>'+A.esc(u.name||'Admin')+'</b><small>Store owner</small></div><button class="ibtn" id="lo" title="Sign out" style="width:32px;height:32px;color:#fff;border-color:rgba(255,255,255,.2)"><i class="fa-solid fa-right-from-bracket"></i></button></div>';
  $('#sb').innerHTML=h;$('#topav').textContent=ini;$('#lo').onclick=function(){localStorage.removeItem(TOKEN);location.replace('/admin/login')}}
<<<<<<< HEAD
/* ---------- notifications (bell): everything that needs the owner, in one list ---------- */
A.notes=[];
A.refreshCounts=async function(){try{var r=await Promise.all([A.api('/admin/summary'),A.api('/admin/analytics?days=30')]),s=r[0],a=r[1],d=a.delivery||{},n=[];
  A.counts.orders=s.pending;A.counts.messages=s.newMessages;
  var add=function(c,h,ic,tone,t,sub){if(c>0)n.push({h:h,ic:ic,tone:tone,t:t,sub:sub})};
  add(s.pending,'#orders/pending','bag-shopping','warn',s.pending+' new order'+(s.pending>1?'s':'')+' waiting','Confirm them to start delivery');
  add(d.overdue,'#orders/overdue','clock','bad',d.overdue+' overdue deliver'+(d.overdue>1?'ies':'y'),'Past the planned delivery date');
  add(d.unscheduled,'#orders/unscheduled','calendar-day','warn',d.unscheduled+' order'+(d.unscheduled>1?'s':'')+' without a delivery date','Pick a delivery plan');
  add(d.today,'#orders/today','truck','info',d.today+' deliver'+(d.today>1?'ies':'y')+' planned for today','');
  add(s.newMessages,'#messages','message','warn',s.newMessages+' new message'+(s.newMessages>1?'s':''),'Customers are waiting for a reply');
  var out=(a.lowStock||[]).filter(function(x){return x.stock==='out-of-stock'}).length,low=(a.lowStock||[]).length-out;
  add(out,'#products','box','bad',out+' product'+(out>1?'s':'')+' sold out','Hidden from buying until restocked');
  add(low,'#products','box','warn',low+' product'+(low>1?'s':'')+' running low','');
  (a.expiringCoupons||[]).forEach(function(c){n.push({h:'#coupons',ic:'ticket',tone:'info',t:'Code '+c.code+' expires '+A.date(c.expires_at),sub:''})});
  A.notes=n;$('#bdot').classList.toggle('hidden',!n.length);renderNav();if($('#notes'))A.drawNotes()}catch(e){}};
A.drawNotes=function(){var p=$('#notes');if(!p)return;p.innerHTML='<div class="nh"><b>Notifications</b><small>'+(A.notes.length?A.notes.length+' need you':'')+'</small></div>'+(A.notes.length?A.notes.map(function(x){return'<a href="'+x.h+'" class="ni"><i class="fa-solid fa-'+x.ic+' t-'+x.tone+'"></i><span><b>'+A.esc(x.t)+'</b>'+(x.sub?'<small>'+A.esc(x.sub)+'</small>':'')+'</span></a>'}).join(''):'<div class="ne"><i class="fa-solid fa-circle-check"></i>You are all caught up</div>')};
A.toggleNotes=function(e){e&&e.stopPropagation();var p=$('#notes');if(p){p.remove();return}p=document.createElement('div');p.id='notes';p.className='notes';document.body.appendChild(p);A.drawNotes();A.refreshCounts();
  setTimeout(function(){var off=function(ev){if(!p.contains(ev.target)){p.remove();document.removeEventListener('click',off)}};document.addEventListener('click',off);p.addEventListener('click',function(ev){if(ev.target.closest('a')){p.remove();document.removeEventListener('click',off)}})},0)};
setInterval(function(){if(!document.hidden)A.refreshCounts()},60000);
=======
A.refreshCounts=async function(){try{var s=await A.api('/admin/summary');A.counts.orders=s.pending;A.counts.messages=s.newMessages;$('#bdot').classList.toggle('hidden',!s.pending);renderNav()}catch(e){}};
>>>>>>> c338fb81c595c3987b795b730eafef80368aa8e0

/* ---------- router ---------- */
async function route(){A.closeDrawer();$('#sb').classList.remove('on');var p=(location.hash||'#dashboard').slice(1).split('/'),n=p[0],f=A.pages[n]||A.pages.dashboard;renderNav();var v=$('#view');v.innerHTML='<div class="card"><div class="pad">'+A.skeleton(8)+'</div></div>';
  try{await f(v,p.slice(1));window.scrollTo(0,0)}catch(e){v.innerHTML='<div class="card">'+A.empty('triangle-exclamation',e.message)+'</div>'}}
window.addEventListener('hashchange',route);

/* ---------- theme / chrome ---------- */
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('wt_admin_theme',t)}catch(e){}$('#theme').innerHTML='<i class="fa-solid fa-'+(t==='dark'?'sun':'moon')+'"></i>'}
$('#theme').onclick=function(){setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')};
$('#burger').onclick=function(){$('#sb').classList.toggle('on')};$('#dbg').onclick=A.closeDrawer;$('#bell').onclick=A.toggleNotes;
setTheme(document.documentElement.dataset.theme||'light');

/* ---------- command palette (Ctrl+K) ---------- */
function palette(){var o=$('#overlay');var items=[];NAV.forEach(function(g){g[1].forEach(function(i){items.push({t:i[1],s:'Go to page',h:'#'+i[0],i:i[2]})})});
  o.innerHTML='<div class="cmd"><div class="box"><input placeholder="Search pages, orders, products…" autofocus><div id="cr" style="max-height:50vh;overflow:auto"></div></div></div>';var inp=o.querySelector('input');
  var draw=async function(){var q=inp.value.trim().toLowerCase(),r=items.filter(function(x){return!q||x.t.toLowerCase().includes(q)});
    if(q.length>1){try{var od=(await A.get('orders','/orders')).orders.filter(function(x){return(x.orderNumber+' '+x.customerName+' '+x.customerPhone).toLowerCase().includes(q)}).slice(0,4).map(function(x){return{t:x.orderNumber+' · '+x.customerName,s:'Order',h:'#orders/'+x.id,i:'bag-shopping'}});
      var pd=(await A.get('products','/products?all=1')).products.filter(function(x){return(x.name+' '+(x.sku||'')).toLowerCase().includes(q)}).slice(0,4).map(function(x){return{t:x.name,s:'Product',h:'#products/'+x.id,i:'box'}});r=r.concat(od,pd)}catch(e){}}
    $('#cr').innerHTML=r.slice(0,10).map(function(x,i){return'<a href="'+x.h+'" class="'+(i?'':'sel')+'"><i class="fa-solid fa-'+x.i+'" style="width:18px"></i>'+A.esc(x.t)+'<small>'+x.s+'</small></a>'}).join('')||A.empty('magnifying-glass','No matches')};
  inp.oninput=A.debounce(draw,120);inp.onkeydown=function(e){if(e.key==='Enter'){var a=o.querySelector('#cr a');if(a)a.click()}};o.querySelector('.cmd').onclick=function(e){if(e.target===this)o.innerHTML=''};o.addEventListener('click',function(e){if(e.target.closest('#cr a'))setTimeout(function(){o.innerHTML=''},0)});draw()}
$('#srch').onclick=palette;
document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();palette()}if(e.key==='Escape'){$('#overlay').innerHTML='';A.closeDrawer()}});

/* =========================== DASHBOARD =========================== */
A.pages.dashboard=async function(v){var days=A.state.days||30;
  var d=await A.api('/admin/analytics?days='+days),t=d.totals,pc=function(a,b){return b?Math.round((a-b)/b*1000)/10:null};
  var rc=pc(t.rev,t.prev_rev),oc=pc(t.ord,t.prev_ord),st={};d.status.forEach(function(x){st[x.status]=x.n});
  var u={};try{u=JSON.parse(localStorage.getItem('willstech_admin_user')||'{}')}catch(e){}var hr=new Date().getHours(),gr=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  var delta=function(x){return x==null?'<span class="b b-n">new</span>':'<span class="b b-'+(x>=0?'ok':'bad')+'">'+(x>=0?'+':'')+x+'%</span>'};
  var kpi=function(l,val,ic,bg,fg,dl,sub,hl){return'<div class="card kpi'+(hl?' hl':'')+'"><div class="t"><span>'+l+'</span><div class="chip" style="background:'+bg+';color:'+fg+'"><i class="fa-solid fa-'+ic+'"></i></div></div><div class="v">'+val+'</div><div class="d">'+dl+' '+sub+'</div></div>'};
  var pend=st.pending||0,P=d.products;
  var orders=(await A.get('orders','/orders',true)).orders;A.bust('products');
  var html=A.head('Dashboard',gr+(u.name?', '+A.esc(u.name.split(' ')[0]):'')+'. Here is how the store is doing.','<button class="btn btn-s" id="exp"><i class="fa-solid fa-download"></i>Export orders</button><a class="btn btn-p" href="#products/new"><i class="fa-solid fa-plus"></i>Add product</a>');
  html+='<div class="grid4">'+kpi('Revenue','<span title="'+A.money(t.rev)+'">'+A.short(t.rev)+'</span>','arrow-trend-up','var(--ok-s)','var(--ok)',delta(rc),'vs previous '+days+' days')+kpi('Orders',t.ord,'bag-shopping','var(--info-s)','var(--info)',delta(oc),'vs previous '+days+' days')+kpi('Waiting for you',pend,'triangle-exclamation','var(--sun-soft)','var(--warn)','<span class="b b-warn">new orders</span>','need confirming',pend>0)+kpi('Products',P.total,'box','var(--surface)','var(--purple)',(P.low||P.out?'<span class="b b-bad">'+P.low+' low · '+P.out+' out</span>':'<span class="b b-ok">stock healthy</span>'),P.hidden+' hidden')+'</div>';
  html+='<div class="row2"><div class="card"><div class="ch"><div><h2>Revenue</h2><small>Excluding cancelled orders, last '+days+' days</small></div><div class="seg" id="rng">'+[7,30,90].map(function(x){return'<button data-d="'+x+'" class="'+(x===days?'on':'')+'">'+x+'D</button>'}).join('')+'</div></div><div class="big">'+A.money(t.rev)+' '+delta(rc)+'</div><div class="chart" id="chart"></div></div>';
  var colors={pending:'var(--sun)',confirmed:'var(--info)',shipped:'var(--purple)',completed:'var(--ok)',cancelled:'var(--bad)'},names={pending:'Pending',confirmed:'Confirmed',shipped:'Out for delivery',completed:'Completed',cancelled:'Cancelled'},mx=Math.max.apply(null,Object.keys(names).map(function(k){return st[k]||0}).concat([1]));
  html+='<div class="card"><div class="ch"><div><h2>Orders by status</h2><small>Last '+days+' days · '+t.ord+' orders</small></div></div><div class="bars">'+Object.keys(names).map(function(k){var n=st[k]||0;return'<div><div class="l">'+names[k]+'<b>'+n+'</b></div><div class="trk"><i style="width:'+(n?Math.max(4,n/mx*100):0)+'%;background:'+colors[k]+'"></i></div></div>'}).join('')+'</div></div></div>';
  html+='<div class="row2"><div class="card"><div class="ch"><h2>Recent orders</h2><a class="btn btn-g btn-sm" href="#orders">View all</a></div><div class="tw">'+ordersTable(orders.slice(0,6),true)+'</div></div><div style="display:flex;flex-direction:column;gap:16px">';
  var at=[];if(pend)at.push(['#orders/pending','bag-shopping','var(--sun-soft)','var(--warn)',pend+' new order'+(pend>1?'s':'')+' waiting','Confirm them to start delivery']);
  var dv=d.delivery||{};if(dv.unscheduled)at.push(['#orders/unscheduled','calendar-plus','var(--sun-soft)','var(--warn)',dv.unscheduled+' order'+(dv.unscheduled>1?'s':'')+' without a delivery date','Pick a date from a template']);if(dv.overdue)at.push(['#orders/overdue','clock','var(--bad-s)','var(--bad)',dv.overdue+' delivery'+(dv.overdue>1?' dates':' date')+' passed','Complete or reschedule']);if(dv.today)at.push(['#orders/today','truck','var(--info-s)','var(--info)',dv.today+' deliver'+(dv.today>1?'ies':'y')+' today','See the list']);if(dv.unpaid)at.push(['#orders/unpaid','coins','var(--bad-s)','var(--bad)',dv.unpaid+' completed order'+(dv.unpaid>1?'s':'')+' not marked paid','Record the payment']);
  if(P.low+P.out)at.push(['#products/low','box','var(--bad-s)','var(--bad)',(P.low+P.out)+' product'+(P.low+P.out>1?'s':'')+' low or out','Update the stock level']);
  if(d.newMessages)at.push(['#messages','message','var(--info-s)','var(--info)',d.newMessages+' unread message'+(d.newMessages>1?'s':''),'Reply from the inbox']);
  d.expiringCoupons.forEach(function(c){at.push(['#coupons','ticket','var(--surface)','var(--purple)','Code '+A.esc(c.code)+' ends '+A.date(c.expires_at),'Used '+c.used_count+(c.max_uses?' of '+c.max_uses:'')+' times'])});
  html+='<div class="card"><div class="ch"><h2>Needs attention</h2></div><div class="attn">'+(at.map(function(a){return'<a href="'+a[0]+'"><div class="chip" style="background:'+a[2]+';color:'+a[3]+'"><i class="fa-solid fa-'+a[1]+'"></i></div><div><b>'+a[4]+'</b><small>'+a[5]+'</small></div></a>'}).join('')||'<div style="color:var(--t3)">All clear. Nothing needs you right now.</div>')+'</div></div>';
  html+='<div class="card"><div class="ch"><h2>Best sellers</h2></div><div class="attn">'+(d.topProducts.map(function(p,i){return'<div style="display:flex;gap:10px"><b style="color:var(--t3);width:16px">'+(i+1)+'</b><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+A.esc(p.name)+'</span><b>'+p.units+'</b></div>'}).join('')||'<div style="color:var(--t3)">No sales in this period yet.</div>')+'</div></div></div></div>';
  v.innerHTML=html;drawChart($('#chart'),d.daily);
  $('#rng').onclick=function(e){var b=e.target.closest('button');if(b){A.state.days=+b.dataset.d;route()}};
  $('#exp').onclick=function(){exportOrders(orders)};bindOrderRows(v);A.refreshCounts()};
function drawChart(el,daily){var W=800,H=210,pad=6,max=Math.max.apply(null,daily.map(function(x){return x.revenue}).concat([1]));
  if(!daily.some(function(x){return x.revenue>0}))return el.innerHTML=A.empty('chart-line','No revenue in this period yet');
  var pts=daily.map(function(x,i){return[i*W/(daily.length-1),H-pad-(x.revenue/max)*(H-24)]}),ln=pts.map(function(p,i){return(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)}).join(' ');
  var grid='';for(var i=0;i<5;i++)grid+='<line x1="0" x2="'+W+'" y1="'+(i*(H-1)/4)+'" y2="'+(i*(H-1)/4)+'" stroke="var(--line)"/>';
  var lab=[0,.25,.5,.75,1].map(function(f){var x=daily[Math.round(f*(daily.length-1))];return'<span>'+new Date(x.day).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+'</span>'}).join('');
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'+grid+'<path d="'+ln+' L'+W+' '+H+' L0 '+H+'Z" fill="var(--purple)" opacity=".13"/><path d="'+ln+'" fill="none" stroke="var(--purple)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg><div style="display:flex;justify-content:space-between;color:var(--t3);font-size:12px;margin-top:6px">'+lab+'</div>';
  var tip=document.createElement('div');tip.style.cssText='position:absolute;pointer-events:none;background:var(--ink);color:var(--tinv);padding:4px 10px;border-radius:8px;font-size:12px;display:none;white-space:nowrap';el.style.position='relative';el.appendChild(tip);var svg=el.querySelector('svg');
  svg.onmousemove=function(e){var r=svg.getBoundingClientRect(),i=Math.round((e.clientX-r.left)/r.width*(daily.length-1)),x=daily[i];if(!x)return;tip.style.display='block';tip.textContent=new Date(x.day).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' · '+A.money(x.revenue)+' · '+x.orders+' orders';tip.style.left=Math.min(Math.max(0,e.clientX-r.left-60),r.width-200)+'px';tip.style.top='0px'};svg.onmouseleave=function(){tip.style.display='none'}}

/* =========================== ORDERS =========================== */
var STATUS_FILTERS=['pending','confirmed','shipped','completed','cancelled'],EXTRA=['unscheduled','today','overdue','unpaid'];
var todayStr=function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
var active=function(o){return o.status==='confirmed'||o.status==='shipped'};
var matchFilter=function(o,f){var t=todayStr();return f==='all'||o.status===f||(f==='unscheduled'&&active(o)&&!o.deliveryDate)||(f==='today'&&active(o)&&o.deliveryDate===t)||(f==='overdue'&&active(o)&&o.deliveryDate&&o.deliveryDate<t)||(f==='unpaid'&&o.status==='completed'&&o.paymentStatus==='unpaid')};
A.fmtDay=function(d){return d?new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}):''};
function delCell(o){if(o.status==='cancelled'||o.status==='completed')return'<span style="color:var(--t3)">'+(o.deliveryDate?A.fmtDay(o.deliveryDate):'—')+'</span>';if(!o.deliveryDate)return'<span class="b b-warn">Not scheduled</span>';var t=todayStr();return'<span class="b b-'+(o.deliveryDate<t?'bad':o.deliveryDate===t?'info':'n')+'">'+(o.deliveryDate===t?'Today':A.fmtDay(o.deliveryDate))+'</span>'}
function payBadge(o){var m={paid:['ok','Paid'],unpaid:['n','Unpaid'],refunded:['bad','Refunded']}[o.paymentStatus]||['n',o.paymentStatus];return'<span class="b b-'+m[0]+'">'+m[1]+'</span>'}
function ordersTable(list,compact){if(!list.length)return A.empty('bag-shopping','No orders here yet');
  return'<table><thead><tr><th>Order</th><th>Customer</th>'+(compact?'':'<th>Items</th>')+'<th>Total</th><th>Status</th>'+(compact?'':'<th>Delivery</th><th>Payment</th>')+'<th>Placed</th></tr></thead><tbody>'+list.map(function(o){return'<tr class="click" data-id="'+o.id+'"><td><strong>'+A.esc(o.orderNumber||o.id)+'</strong></td><td>'+A.esc(o.customerName)+(compact?'':'<br><small style="color:var(--t3)">'+A.esc(o.customerPhone||'')+'</small>')+'</td>'+(compact?'':'<td>'+(o.items||[]).reduce(function(s,i){return s+(Number(i.quantity||i.qty)||1)},0)+'</td>')+'<td>'+A.money(o.total)+(o.deliveryFeePending?'<br><small style="color:var(--warn)">fee to confirm</small>':'')+'</td><td>'+A.badge(o.status)+'</td>'+(compact?'':'<td>'+delCell(o)+'</td><td>'+payBadge(o)+'</td>')+'<td>'+A.ago(o.createdAt)+'</td></tr>'}).join('')+'</tbody></table>'}
function bindOrderRows(root){root.querySelectorAll('tr.click[data-id]').forEach(function(r){r.onclick=function(){location.hash='#orders/'+r.dataset.id}})}
function exportOrders(list){A.csv('orders-'+new Date().toISOString().slice(0,10)+'.csv',[['Order','Date','Customer','Phone','Email','Zone','Address','Payment method','Payment status','Payment ref','Items','Subtotal','Delivery','Discount','Total','Status','Delivery date','Window','Rider']].concat(list.map(function(o){var a=o.shippingAddress||{};return[o.orderNumber,new Date(o.createdAt).toISOString(),o.customerName,o.customerPhone,o.customerEmail,o.deliveryZone,[a.street,a.landmark].filter(Boolean).join(', '),o.paymentMethod,o.paymentStatus,o.paymentRef||'',(o.items||[]).map(function(i){return(i.quantity||i.qty||1)+'x '+i.name}).join('; '),o.subtotal,o.deliveryFee,o.discount,o.total,o.status,o.deliveryDate||'',o.deliveryWindow||'',o.riderName||'']})))}
A.pages.orders=async function(v,args){var all=(await A.get('orders','/orders',true)).orders;var f=args[0]&&(STATUS_FILTERS.concat(EXTRA)).includes(args[0])?args[0]:'all',q='';
  var cnt=function(s){return all.filter(function(o){return matchFilter(o,s)}).length};
  var lab={all:'All',shipped:'Out for delivery',unscheduled:'Needs a date',today:'Deliver today',overdue:'Overdue',unpaid:'Completed, unpaid'};
  v.innerHTML=A.head('Orders',all.length+' orders. You manage the whole process here: confirm, schedule delivery, record payment.','<button class="btn btn-s" id="exp"><i class="fa-solid fa-download"></i>Export CSV</button>')+'<div class="card"><div class="tools"><input class="inp" id="q" placeholder="Search order number, name, phone…">'+['all'].concat(STATUS_FILTERS,EXTRA).map(function(s){return'<button class="pill'+(s===f?' on':'')+'" data-s="'+s+'">'+(lab[s]||s[0].toUpperCase()+s.slice(1))+' '+cnt(s)+'</button>'}).join('')+'</div><div class="tw" id="tb"></div></div>';
  var draw=function(){var l=all.filter(function(o){return matchFilter(o,f)&&(!q||(o.orderNumber+' '+o.customerName+' '+o.customerPhone).toLowerCase().includes(q))});$('#tb').innerHTML=ordersTable(l);bindOrderRows($('#tb'))};draw();
  $('#q').oninput=A.debounce(function(){q=this.value.trim().toLowerCase();draw()},150);
  v.querySelectorAll('.pill').forEach(function(b){b.onclick=function(){f=b.dataset.s;v.querySelectorAll('.pill').forEach(function(x){x.classList.toggle('on',x===b)});draw()}});$('#exp').onclick=function(){exportOrders(all)};};
function fillTpl(t,o,date,win,rider){return String(t||'').replace(/\{name\}/g,(o.customerName||'').split(' ')[0]).replace(/\{date\}/g,date?A.fmtDay(date):'(date)').replace(/\{window\}/g,win||'').replace(/\{rider\}/g,rider||'Our rider').replace(/\s+\(\)/g,'').replace(/\s{2,}/g,' ').trim()}
async function openOrder(id){var all=(await A.get('orders','/orders')).orders,o=all.find(function(x){return String(x.id)===String(id)});if(!o)return A.toast('Order not found',true);
  var ev=[];try{ev=(await A.api('/admin/orders/'+o.id+'/events')).events}catch(e){}var a=o.shippingAddress||{},tpls=[];try{tpls=(await A.get('tpl','/admin/settings/delivery_templates')).value}catch(e){}
  var next={pending:['confirmed','Confirm order'],confirmed:['shipped','Out for delivery'],shipped:['completed','Mark completed']}[o.status];
  var addr=[a.street,a.landmark].filter(Boolean).join(', '),map=a.lat?'https://www.openstreetmap.org/?mlat='+a.lat+'&mlon='+a.lng+'#map=17/'+a.lat+'/'+a.lng:'';
  var sec=function(t,b){return'<div class="osec"><h3>'+t+'</h3>'+b+'</div>'};
  var body='<dl class="kv"><dt>Customer</dt><dd>'+A.esc(o.customerName)+'</dd><dt>Phone</dt><dd><a href="tel:'+A.esc(o.customerPhone)+'">'+A.esc(o.customerPhone||'—')+'</a></dd><dt>Email</dt><dd>'+A.esc(o.customerEmail||'—')+'</dd><dt>Deliver to</dt><dd>'+A.esc(o.deliveryZone||'')+(addr?' · '+A.esc(addr):'')+(map?' <a href="'+map+'" target="_blank" rel="noopener"><i class="fa-solid fa-location-dot"></i> map pin</a>':'')+'</dd><dt>Payment</dt><dd>'+A.esc(o.paymentMethod||'—')+' '+payBadge(o)+'</dd><dt>Placed</dt><dd>'+new Date(o.createdAt).toLocaleString('en-GB')+'</dd>'+(o.notes?'<dt>Customer note</dt><dd>'+A.esc(o.notes)+'</dd>':'')+'</dl>'+
   '<div class="items">'+(o.items||[]).map(function(i){return'<div><span>'+A.esc(i.name)+' <small style="color:var(--t3)">× '+(i.quantity||i.qty||1)+'</small></span><b>'+A.money((Number(i.price)||0)*(Number(i.quantity||i.qty)||1))+'</b></div>'}).join('')+'<div><span>Subtotal</span><b>'+A.money(o.subtotal)+'</b></div><div><span>Delivery</span><b>'+(o.deliveryFeePending?'<span style="color:var(--warn)">To be confirmed</span>':A.money(o.deliveryFee))+'</b></div>'+(o.discount?'<div><span>Discount '+A.esc(o.couponCode||'')+'</span><b>− '+A.money(o.discount)+'</b></div>':'')+'<div><span><b>Total</b></span><b>'+A.money(o.total)+'</b></div></div>'+
   sec('Delivery plan','<div class="f"><label>Start from a template</label><select class="sel" id="dt"><option value="">Choose a template…</option>'+tpls.map(function(t,i){return'<option value="'+i+'">'+A.esc(t.name)+'</option>'}).join('')+'</select></div><div class="f2"><div class="f"><label>Delivery date</label><input class="inp" id="dd" type="date" value="'+A.esc(o.deliveryDate||'')+'"></div><div class="f"><label>Time window</label><input class="inp" id="dw" value="'+A.esc(o.deliveryWindow||'')+'" placeholder="e.g. 9 AM to 5 PM"></div></div><div class="f2"><div class="f"><label>Rider / courier</label><input class="inp" id="dr" value="'+A.esc(o.riderName||'')+'"></div><div class="f"><label>Rider phone</label><input class="inp" id="drp" value="'+A.esc(o.riderPhone||'')+'"></div></div><div class="f2"><div class="f"><label>Delivery fee (UGX)'+(o.deliveryFeePending?' <small style="color:var(--warn)">customer is waiting for this</small>':'')+'</label><input class="inp" id="df" type="number" min="0" value="'+(o.deliveryFeePending?'':o.deliveryFee)+'" placeholder="Enter the fee"></div><div class="f"><label>Landmark</label><input class="inp" id="dl" value="'+A.esc(a.landmark||'')+'"></div></div><div class="f"><label>Message the customer sees on their tracking page</label><textarea class="ta" id="dn" rows="3">'+A.esc(o.deliveryNote||'')+'</textarea></div><button class="btn btn-y" id="dsv">Save delivery plan</button>')+
   sec('Payment','<div class="f2"><div class="f"><label>Status</label><select class="sel" id="ps"><option value="unpaid"'+(o.paymentStatus==='unpaid'?' selected':'')+'>Unpaid</option><option value="paid"'+(o.paymentStatus==='paid'?' selected':'')+'>Paid</option><option value="refunded"'+(o.paymentStatus==='refunded'?' selected':'')+'>Refunded</option></select></div><div class="f"><label>Reference <small>MoMo / Airtel transaction ID</small></label><input class="inp" id="pr" value="'+A.esc(o.paymentRef||'')+'"></div></div><button class="btn btn-s" id="psv">Save payment</button>'+(o.paidAt?' <small style="color:var(--t3)">Paid '+new Date(o.paidAt).toLocaleString('en-GB')+'</small>':''))+
   sec('Staff note <small style="font-weight:400;color:var(--t3)">(customers never see this)</small>','<textarea class="ta" id="in" rows="2">'+A.esc(o.internalNote||'')+'</textarea><button class="btn btn-s" id="isv" style="margin-top:8px">Save note</button>')+
   sec('Timeline','<div class="tl">'+(ev.map(function(e){return'<div>'+A.badge(e.status)+(e.note?' '+A.esc(e.note):'')+'<small>'+new Date(e.created_at).toLocaleString('en-GB')+'</small></div>'}).join('')||'<div>Order placed<small>'+new Date(o.createdAt).toLocaleString('en-GB')+'</small></div>')+'</div><div class="f" style="margin-top:12px"><label>Note on the timeline (optional, customer sees it)</label><input class="inp" id="on" placeholder="e.g. Packed and ready"></div>');
  A.drawer('Order '+A.esc(o.orderNumber||o.id)+' '+A.badge(o.status),body,'<button class="btn btn-s" onclick="print()"><i class="fa-solid fa-print"></i>Print</button>'+(o.status!=='cancelled'&&o.status!=='completed'?'<button class="btn btn-d" id="oc">Cancel</button>':'')+(o.status==='cancelled'?'<button class="btn btn-s" id="oo">Reopen</button>':'')+(next?'<button class="btn btn-y" id="on2">'+next[1]+'</button>':''));
  var done=function(m){A.bust('orders');A.toast(m);A.refreshCounts();var h=location.hash;route().then(function(){})};
  var call=async function(path,body,msg){try{await A.api('/orders/'+o.id+path,{method:'PATCH',body:body});A.bust('orders');A.toast(msg);A.refreshCounts();openOrderReload()}catch(e){A.toast(e.message,true)}};
  var openOrderReload=async function(){var l=location.hash;await route();};
  var upd=function(){var t=tpls[+$('#dt').value];if(!t)return;var d=new Date();d.setDate(d.getDate()+(Number(t.days)||0));var ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');$('#dd').value=ds;$('#dw').value=t.window||'';rn()};
  var rn=function(){var t=tpls[+$('#dt').value];if(t)$('#dn').value=fillTpl(t.note,o,$('#dd').value,$('#dw').value,$('#dr').value)};
  $('#dt').onchange=upd;['dd','dw','dr'].forEach(function(i){$('#'+i).addEventListener('change',rn)});
  $('#dsv').onclick=function(){if(!$('#dd').value&&!await0())return;call('/delivery',{date:$('#dd').value||null,window:$('#dw').value,riderName:$('#dr').value,riderPhone:$('#drp').value,fee:$('#df').value,note:$('#dn').value,address:{landmark:$('#dl').value}},'Delivery plan saved. The customer can see it.')};
  function await0(){return true}
  $('#psv').onclick=function(){call('/payment',{status:$('#ps').value,ref:$('#pr').value},'Payment saved')};
  $('#isv').onclick=function(){call('/note',{note:$('#in').value},'Note saved')};
  var set=async function(s){try{await A.api('/orders/'+o.id+'/status',{method:'PATCH',body:{status:s,note:$('#on').value,markPaid:s==='completed'&&o.paymentStatus==='unpaid'&&/cod|cash/i.test(o.paymentMethod||'')}});A.bust('orders');A.toast('Order updated');A.closeDrawer();A.refreshCounts();route()}catch(e){A.toast(e.message,true)}};
  if($('#on2'))$('#on2').onclick=function(){if(next[0]==='shipped'&&!o.deliveryDate&&!confirm('No delivery date is set yet. Continue anyway?'))return;set(next[0])};
  if($('#oc'))$('#oc').onclick=async function(){if(await A.confirm('Cancel this order?','The stock goes back on the shelf and the customer sees it as cancelled.','Cancel order'))set('cancelled')};
  if($('#oo'))$('#oo').onclick=function(){set('pending')}}
var rt=route;route=async function(){await rt();var p=(location.hash||'').slice(1).split('/');if(p[0]==='orders'&&p[1]&&!['pending','confirmed','shipped','completed','cancelled','all'].includes(p[1]))openOrder(p[1])};window.removeEventListener('hashchange',rt);window.addEventListener('hashchange',route);

A.start=function(){route();A.refreshCounts()};
})();
