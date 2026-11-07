// عامل الخدمة: الشبكة أولًا (فتصلك أي تحديث فورًا)، وإذا انقطع الاتصال تعمل اللعبة من النسخة المخزّنة
const C='ml-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
 if(e.request.method!='GET'||u.pathname.startsWith('/api/')||u.pathname=='/ws')return;
 e.respondWith(fetch(e.request).then(r=>{if(r&&(r.ok||r.type=='opaque')){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))))});
