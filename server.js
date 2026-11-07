'use strict';
// أرض الوحوش — خادم لعب جماعي بدون أي مكتبات خارجية.  التشغيل:  node server.js
// يقدّم اللعبة (index.html) ويستقبل اتصالات WebSocket على /ws  — غرف عبر ?room=اسم
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||3000,DIR=__dirname,LBF=path.join(DIR,'leaderboard.json'),MAXP=+process.env.MAX_PLAYERS_PER_ROOM||60;
let LB={};try{LB=JSON.parse(fs.readFileSync(LBF,'utf8'))}catch(e){}
let lbDirty=false;setInterval(()=>{if(lbDirty){lbDirty=false;const k=Object.keys(LB);if(k.length>500){k.sort((a,b)=>LB[b].pt-LB[a].pt).slice(400).forEach(x=>delete LB[x])}fs.writeFile(LBF,JSON.stringify(LB),()=>{})}},15000);
const rooms=new Map(),GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SAVES=path.join(DIR,'saves.json'),INDEX=path.join(DIR,'index.html');let SV={};try{SV=JSON.parse(fs.readFileSync(SAVES,'utf8'))}catch(e){}
let svDirty=false;setInterval(()=>{if(svDirty){svDirty=false;fs.writeFile(SAVES,JSON.stringify(SV),()=>{})}},10000);
const ACF=path.join(DIR,'accounts.json'),FRF=path.join(DIR,'friends.json');let ACC={},FR={fr:{},rq:{},names:{}};
try{ACC=JSON.parse(fs.readFileSync(ACF,'utf8'))}catch(e){}try{FR=Object.assign(FR,JSON.parse(fs.readFileSync(FRF,'utf8')))}catch(e){}
let frDirty=false;setInterval(()=>{if(frDirty){frDirty=false;fs.writeFile(FRF,JSON.stringify(FR),()=>{})}},10000);
const online=new Map(),loginTry={},L=(o,k)=>o[k]||(o[k]=[]),idok=s=>typeof s=='string'&&/^[0-9a-f]{10}$/.test(s);
function doLogin(body,ip){let j;try{j=JSON.parse(body)}catch(e){return[400,{err:'طلب غير صالح'}]}
 const name=String(j.name||'').trim(),pass=String(j.pass||''),key=name.toLowerCase();
 if(!/^[\w\u0600-\u06FF]{3,16}$/.test(name)||pass.length<4||pass.length>64)return[400,{err:'الاسم من 3 إلى 16 حرفًا بلا مسافات، وكلمة السر 4 أحرف على الأقل'}];
 const t=Date.now(),a=(loginTry[ip]=(loginTry[ip]||[]).filter(x=>t-x<60000));if(a.length>=10)return[429,{err:'محاولات كثيرة، انتظر دقيقة'}];a.push(t);
 let ac=ACC[key];
 if(j.mode=='register'){if(ac)return[409,{err:'هذا الاسم مستخدم'}];const salt=crypto.randomBytes(16).toString('hex');ac=ACC[key]={name,salt,hash:crypto.scryptSync(pass,salt,32).toString('hex'),pid:crypto.randomBytes(12).toString('hex')};fs.writeFile(ACF,JSON.stringify(ACC),()=>{});return[200,{pid:ac.pid,name}]}
 if(!ac||!crypto.timingSafeEqual(Buffer.from(crypto.scryptSync(pass,ac.salt,32).toString('hex')),Buffer.from(ac.hash)))return[401,{err:'اسم أو كلمة سر خاطئة'}];return[200,{pid:ac.pid,name:ac.name}]}
function pushFr(id){const c=online.get(id);if(!c)return;const list=L(FR.fr,id).map(f=>{const o=online.get(f);return{id:f,name:FR.names[f]||'لاعب',on:!!o,lv:o&&o.pres&&o.pres.lv||0}});send(c,{t:'friends',list,req:L(FR.rq,id).map(f=>({id:f,name:FR.names[f]||'لاعب'}))})}
const lastSave={},STATIC={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'],'/sw.js':['sw.js','text/javascript'],'/login.html':['login.html','text/html; charset=utf-8'],'/icon-192.png':['icon-192.png','image/png'],'/icon-512.png':['icon-512.png','image/png']};
const server=http.createServer((req,res)=>{const U=new URL(req.url,'http://x'),u=U.pathname;
 if(u=='/health'){res.end('ok');return}
 if(u=='/api/login'&&req.method=='POST'){let b='';req.on('data',d=>{b+=d;if(b.length>2000)req.destroy()});req.on('end',()=>{const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(),[st,o]=doLogin(b,ip);res.writeHead(st,{'Content-Type':'application/json'});res.end(JSON.stringify(o))});return}
 if(u=='/api/save'){const pid0=U.searchParams.get('pid')||'',slot=U.searchParams.get('slot')||'1';if(!/^[0-9a-f]{16,64}$/.test(pid0)||!/^[1-3]$/.test(slot)){res.writeHead(400);res.end();return}const pid=pid0+':'+slot;
  if(req.method=='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(SV[pid]||(slot=='1'?SV[pid0]:'')||'');return}
  if(req.method=='POST'){const now=Date.now();if(now-(lastSave[pid]||0)<2000){res.writeHead(429);res.end();return}lastSave[pid]=now;let b='';req.on('data',d=>{b+=d;if(b.length>60000)req.destroy()});
   req.on('end',()=>{try{const j=JSON.parse(b);if(!j||!j.P||typeof j.P!='object')throw 0;SV[pid]=b;svDirty=true;res.writeHead(204);res.end()}catch(e){res.writeHead(400);res.end()}});return}
  res.writeHead(405);res.end();return}
 const f=STATIC[u];if(f){fs.readFile(path.join(DIR,f[0]),(e,b)=>{if(e){res.writeHead(404);res.end('missing '+f[0]);return}res.writeHead(200,{'Content-Type':f[1],'Cache-Control':'no-cache'});res.end(b)});return}
 res.writeHead(404);res.end('not found')});
// تحديث تلقائي اختياري: اضبط UPDATE_URL على رابط ملف index.html الخام (مثلًا من GitHub) فيسحب الخادم أحدث نسخة كل 10 دقائق
if(process.env.UPDATE_URL){const upd=async()=>{try{const r=await fetch(process.env.UPDATE_URL,{cache:'no-store'}),t=await r.text();if(r.ok&&t.includes('<title>أرض الوحوش')&&t.length>20000&&t!==fs.readFileSync(INDEX,'utf8')){fs.writeFileSync(INDEX,t);console.log('تم تحديث index.html')}}catch(e){}};upd();setInterval(upd,600000)}
server.on('upgrade',(req,sock)=>{
 if(req.url.split('?')[0]!='/ws'||String(req.headers.upgrade).toLowerCase()!='websocket'||!req.headers['sec-websocket-key']){sock.destroy();return}
 sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(req.headers['sec-websocket-key']+GUID).digest('base64')+'\r\n\r\n');
 sock.setNoDelay(true);const c={sock,buf:Buffer.alloc(0),alive:true,room:null,id:null,tok:80,t0:Date.now()};
 sock.on('data',d=>{c.buf=Buffer.concat([c.buf,d]);if(c.buf.length>70000){sock.destroy();return}parse(c)});
 sock.on('close',()=>leave(c));sock.on('error',()=>sock.destroy())});
function parse(c){for(;;){const b=c.buf;if(b.length<2)return;const fin=b[0]&128,op=b[0]&15;let len=b[1]&127,o=2;
 if(!(b[1]&128)||!fin){c.sock.destroy();return}
 if(len==126){if(b.length<4)return;len=b.readUInt16BE(2);o=4}else if(len==127){c.sock.destroy();return}
 if(b.length<o+4+len)return;const mk=b.slice(o,o+4),pl=Buffer.from(b.slice(o+4,o+4+len));for(let i=0;i<len;i++)pl[i]^=mk[i&3];c.buf=b.slice(o+4+len);
 if(op==8){c.sock.end();return}if(op==9){frame(c,10,pl);continue}if(op==10){c.alive=true;continue}if(op==1)onMsg(c,pl.toString('utf8'))}}
function frame(c,op,pl){if(c.sock.destroyed||pl.length>65000)return;const n=pl.length;let h;if(n<126)h=Buffer.from([128|op,n]);else{h=Buffer.alloc(4);h[0]=128|op;h[1]=126;h.writeUInt16BE(n,2)}c.sock.write(Buffer.concat([h,pl]))}
const send=(c,o)=>frame(c,1,Buffer.from(JSON.stringify(o)));
const num=(v,a,b)=>typeof v=='number'&&isFinite(v)&&v>=a&&v<=b;
const clean=s=>String(s||'لاعب').replace(/[\u0000-\u001f<>&"'`]/g,'').trim().slice(0,16)||'لاعب';
function topLB(){return Object.entries(LB).sort((a,b)=>b[1].pt-a[1].pt).slice(0,10).map(([id,e])=>({id,name:e.name,lv:e.lv,k:e.k}))}
function onMsg(c,s){const now=Date.now();c.tok=Math.min(80,c.tok+(now-c.t0)/1000*60);c.t0=now;if(c.tok<1)return;c.tok--;
 let m;try{m=JSON.parse(s)}catch(e){return}if(!m||typeof m!='object')return;
 if(m.t=='join'&&!c.room){const room=String(m.room||'main').replace(/[^\w\-]/g,'').slice(0,24)||'main',pid=String(m.pid||'').slice(0,40);if(pid.length<8)return;
  let R=rooms.get(room);if(!R)rooms.set(room,R={players:new Map(),dirty:false});
  c.id=crypto.createHash('sha1').update(pid).digest('hex').slice(0,10);
  const old=R.players.get(c.id);if(old)old.sock.destroy();
  if(R.players.size>=MAXP){send(c,{t:'full'});c.sock.end();return}
  c.name=clean(m.name);c.pres={};c.room=R;R.players.set(c.id,c);send(c,{t:'welcome',id:c.id});c.rname=room;online.set(c.id,c);FR.names[c.id]=c.name;frDirty=true;pushFr(c.id);for(const f of L(FR.fr,c.id))pushFr(f);send(c,{t:'lb',list:topLB()});R.dirty=true;return}
 const R=c.room;if(!R)return;
 if(m.t=='pres'&&m.d&&typeof m.d=='object'){const d=m.d,p=c.pres;if(num(d.x,-30000,30000))p.x=d.x;if(num(d.y,-30000,30000))p.y=d.y;
  if(Array.isArray(d.f)&&num(d.f[0],-2,2)&&num(d.f[1],-2,2))p.f=[d.f[0],d.f[1]];if(num(d.lv,1,999))p.lv=d.lv|0;if(typeof d.a=='string')p.a=d.a.slice(0,12);R.dirty=true;return}
 if(m.t=='ev'){const d=m.data;let ok=false;
  if(m.topic=='hit')ok=d&&Number.isInteger(d.i)&&d.i>=0&&d.i<5000&&num(d.v,0,500);
  else if(m.topic=='emo')ok=d&&typeof d.e=='string'&&d.e.length<=8;
  if(!ok)return;const out=Buffer.from(JSON.stringify({t:'ev',topic:m.topic,from:c.id,data:d}));for(const p of R.players.values())if(p!==c)frame(p,1,out);return}
 if(m.t=='fadd'&&idok(m.code)&&m.code!=c.id&&FR.names[m.code]){const a=L(FR.fr,c.id);if(!a.includes(m.code)){const q=L(FR.rq,m.code),mine=L(FR.rq,c.id);if(mine.includes(m.code)){mine.splice(mine.indexOf(m.code),1);a.push(m.code);L(FR.fr,m.code).push(c.id)}else if(!q.includes(c.id)&&q.length<50)q.push(c.id);frDirty=true;pushFr(c.id);pushFr(m.code)}return}
 if(m.t=='facc'&&idok(m.id)){const q=L(FR.rq,c.id),i=q.indexOf(m.id);if(i>=0){q.splice(i,1);const a=L(FR.fr,c.id),b=L(FR.fr,m.id);if(!a.includes(m.id))a.push(m.id);if(!b.includes(c.id))b.push(c.id);frDirty=true;pushFr(c.id);pushFr(m.id)}return}
 if(m.t=='fdel'&&idok(m.id)){for(const [x,y] of [[c.id,m.id],[m.id,c.id]]){for(const o of [FR.fr,FR.rq]){const a=L(o,x),i=a.indexOf(y);if(i>=0)a.splice(i,1)}}frDirty=true;pushFr(c.id);pushFr(m.id);return}
 if((m.t=='fjoin'||m.t=='finv')&&idok(m.id)&&L(FR.fr,c.id).includes(m.id)){const o=online.get(m.id);if(!o)return;
  if(m.t=='fjoin'){if(o.rname)send(c,{t:'goto',room:o.rname,x:(o.pres&&o.pres.x)||1000,y:(o.pres&&o.pres.y)||800})}
  else send(o,{t:'invite',from:c.id,name:c.name,room:c.rname,x:(c.pres&&c.pres.x)||1000,y:(c.pres&&c.pres.y)||800});return}
 if(m.t=='score'&&num(m.lv,1,999)&&num(m.k,0,1e7)){const lv=m.lv|0,k=m.k|0;LB[c.id]={name:c.name,lv,k,pt:lv*1000+k};lbDirty=true}}
function leave(c){if(c.id&&online.get(c.id)===c){online.delete(c.id);for(const f of L(FR.fr,c.id))pushFr(f)}const R=c.room;if(!R)return;if(R.players.get(c.id)===c)R.players.delete(c.id);R.dirty=true;c.room=null;if(!R.players.size)for(const [k,v] of rooms)if(v===R)rooms.delete(k)}
setInterval(()=>{for(const R of rooms.values()){if(!R.dirty)continue;R.dirty=false;
 const peers=[];for(const p of R.players.values())if(p.pres.x!==undefined)peers.push({id:p.id,name:p.name,pres:p.pres});
 const out=Buffer.from(JSON.stringify({t:'peers',peers}));for(const p of R.players.values())frame(p,1,out)}},120);
setInterval(()=>{for(const id of online.keys())pushFr(id)},15000);
setInterval(()=>{const out=Buffer.from(JSON.stringify({t:'lb',list:topLB()}));for(const R of rooms.values())for(const p of R.players.values())frame(p,1,out)},10000);
setInterval(()=>{for(const R of rooms.values())for(const p of R.players.values()){if(!p.alive){p.sock.destroy();continue}p.alive=false;frame(p,9,Buffer.alloc(0))}},25000);
server.listen(PORT,()=>console.log('أرض الوحوش تعمل على المنفذ '+PORT+' — افتح http://localhost:'+PORT));
