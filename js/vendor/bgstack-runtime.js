/*! bgstack runtime - plays bgstack layer specs (JSON) without the editor page.
 *
 *   const bg = BgStack.create(canvas, { scale: 3, smooth: true });
 *   await bg.loadSprites({ sp_v3bg_mainmenu: 'art/sp_v3bg_mainmenu_0.png', ... });
 *   bg.load(spec);            // a spec object or a JSON string
 *   bg.start();
 *
 * create(canvas, opts)   opts: overlay (2D canvas stacked above, made for you if omitted),
 *                        scale (1-4, default 3), smooth (default true), keys (default true:
 *                        arrow keys + Space/Enter drive a `graph`), font, fontSize
 * load(spec)             set the layer stack (layers, emitters, graph, text, lyrics, audio)
 * start() / stop()       run or pause the animation (and the audio, if any)
 * setScale(n, smooth)    output resolution multiplier and sprite smoothing
 * setSprite(name, imgs)  register frames (images/canvases) under a sprite name
 * loadSprites(map)       { name: url | [url,...] } -> Promise
 * loadFolder(dir, list)  list = { name: frameCount }; loads dir/name_0.png ... -> Promise
 * loadFont(url, size)    pixel font for text and lyrics -> Promise
 * loadPackage(url)       load a bgstack-package v1 manifest and all referenced files -> Promise
 * setAudio(urlOrAudio)   track used when the spec has an `audio` block
 * nav(dx, dy) press() release()   drive a graph without the keyboard
 * destroy()              stop and remove key listeners
 * Units are the game's 320x180 pixels, 60 steps per second.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BgStack = factory();
})(typeof self !== 'undefined' ? self : this, function () {
function create(canvas, opts) {
opts = opts || {};
const W=320,H=180,cv=canvas,gl=cv.getContext('webgl',{alpha:false,antialias:false});
if(!gl)throw new Error('WebGL is not available');
let running=false,raf=0,S=Math.min(4,Math.max(1,opts.scale||3)),SMOOTH=opts.smooth!==false,FONT=opts.font||'monospace',FS=opts.fontSize||8,AUD=null;
const FR={};
const mkc=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'),w,h);return c};
const ART={solid:()=>mkc(1,1,x=>{x.fillStyle='#fff';x.fillRect(0,0,1,1)})};
const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw gl.getShaderInfoLog(o);return o};
const pr=gl.createProgram();
gl.attachShader(pr,sh(gl.VERTEX_SHADER,'attribute vec2 a;varying vec2 v;uniform vec4 uR;uniform vec2 uRes;void main(){v=uR.xy+a*uR.zw;vec2 n=v/uRes;gl_Position=vec4(n.x*2.-1.,1.-n.y*2.,0,1);}'));
gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 v;
uniform sampler2D uTex,uNoise;uniform vec2 uRes,uSize,uOff,uTile;uniform vec4 uColor;uniform vec3 uD1,uD2;uniform vec2 uNC;uniform float uT,uChroma,uTS,uEdge;uniform vec2 uNS;
vec4 samp(vec2 q){vec2 u=(q-uOff)/uSize;if(uTile.x>.5)u.x=fract(u.x);if(uTile.y>.5)u.y=fract(u.y);
 if(u.x<0.||u.x>=1.||u.y<0.||u.y>=1.)return vec4(0.);return texture2D(uTex,u);}
vec2 wq(vec2 q){return uEdge<.5?clamp(q,vec2(.5),uRes-.5):(uEdge<1.5?mod(q,uRes):q);}
void main(){vec2 p=v;
 vec2 k1=(p+uNC)/(uNS*uD1.y)+vec2(0.,uD1.x*uT*uTS),k2=(p+uNC)/(uNS*uD2.y)+vec2(0.,uD2.x*uT*uTS);
 vec2 o=(texture2D(uNoise,k1).xy-.5)*uD1.z+(texture2D(uNoise,k2).xy-.5)*uD2.z;
 vec4 r=samp(wq(p+o*(1.+uChroma))),g=samp(wq(p+o*(1.+uChroma*.5))),b=samp(wq(p+o));
 gl_FragColor=vec4(vec3(r.r,g.g,b.b)*uColor.rgb,r.a*uColor.a);}`));
gl.linkProgram(pr);gl.useProgram(pr);
const U={};['uTex','uNoise','uRes','uSize','uOff','uTile','uColor','uD1','uD2','uT','uChroma','uNC','uR','uTS','uNS','uEdge'].forEach(k=>U[k]=gl.getUniformLocation(pr,k));
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);
const al=gl.getAttribLocation(pr,'a');gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.viewport(0,0,W,H);
const mkTex=(src,rep,lin)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
 const f=lin?gl.LINEAR:gl.NEAREST,w=rep?gl.REPEAT:gl.CLAMP_TO_EDGE;
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,w);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,w);return t};
const noise=mkTex(mkc(64,64,(x,w,h)=>{const d=x.createImageData(w,h),T=Math.PI*2/64;for(let j=0;j<h;j++)for(let i=0;i<w;i++){const k=(j*w+i)*4;
 d.data[k]=128+127*(Math.sin(T*(2*i+3*j))+Math.sin(T*(3*j-i)+1))/2;d.data[k+1]=128+127*(Math.sin(T*(i-2*j)+2)+Math.sin(T*(4*i+j)))/2;d.data[k+2]=128+127*(Math.sin(T*(3*i+2*j)+4)+Math.sin(T*(j-3*i)+3))/2;d.data[k+3]=255}x.putImageData(d,0,0)}),true,true);
let NZ={t:noise,w:64,h:64};const NOISE_RATE=1;/* heat-haze scroll: noise tiles per second per speed unit (unverified) */const cache={};const getArt=(k,f=0)=>{const key=k+':'+f;return cache[key]||(cache[key]=(()=>{const c=FR[k]?FR[k][f%FR[k].length]:(ART[k]||ART.solid)();return{t:mkTex(c,false,SMOOTH),w:c.width,h:c.height}})())};
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);const mod=(a,b)=>((a%b)+b)%b;
let spec=null,t0=performance.now();const cam={x:0,y:0};
function frame(){if(!running)return;const t=(performance.now()-t0)/1000*60;gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,t);const rn=FR['_filter_heathaze_noise_sprite'];if(rn&&rn[0]&&NZ.src!==rn[0])NZ={t:mkTex(rn[0],true,true),w:rn[0].width,h:rn[0].height,src:rn[0]};gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,NZ.t);gl.uniform1i(U.uNoise,1);gl.uniform2f(U.uNS,NZ.w,NZ.h);gl.uniform1f(U.uTS,NOISE_RATE/60);gl.uniform1i(U.uTex,0);
 if(spec)[...spec.layers.filter(l=>l.visible!==false),...(spec.emitters||[]).filter(e=>e.visible!==false).map(e=>({depth:e.depth,em:e}))].sort((a,b)=>b.depth-a.depth).forEach(l=>{if(l.em)return({pulse,bars}[l.em.type]||emit)(l.em,t);
  const nf=FR[l.art]?FR[l.art].length:1,a=getArt(l.art,nf>1?Math.floor(t*(l.anim||30)/60)%nf:0),tl=l.tile||[false,false],sp=l.spd||[0,0],o=l.off||[0,0];
  const pf=l.par||[0,0];let ox=o[0]+sp[0]*t-cam.x*pf[0],oy=o[1]+sp[1]*t-cam.y*pf[1];if(tl[0])ox=mod(ox,a.w);if(tl[1])oy=mod(oy,a.h);
  const fx=l.fx||{},d1=fx.d1||[0,1,0],d2=fx.d2||[0,1,0],c=hex(l.tint||'#ffffff');
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,a.t);
  gl.uniform2f(U.uSize,l.stretch?W:a.w,l.stretch?H:a.h);gl.uniform2f(U.uOff,ox,oy);gl.uniform2f(U.uTile,+tl[0],+tl[1]);
  gl.uniform4f(U.uColor,c[0],c[1],c[2],lalpha(l,t));gl.uniform3f(U.uD1,d1[0],d1[1]||1,d1[2]);gl.uniform3f(U.uD2,d2[0],d2[1]||1,d2[2]);gl.uniform1f(U.uChroma,fx.chroma||0);gl.uniform1f(U.uEdge,fx.edge==='repeat'?1:fx.edge==='none'?2:0);gl.uniform4f(U.uR,0,0,W,H);const cs=fx.cam==null?1:fx.cam;gl.uniform2f(U.uNC,cam.x*cs,cam.y*cs);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4)});
 graph(t);credits(t);lyr(t);raf=requestAnimationFrame(frame)}
let overlay=opts.overlay;
if(!overlay){const w=document.createElement('div');w.style.cssText='position:relative;display:inline-block;line-height:0';
 cv.parentNode.insertBefore(w,cv);w.appendChild(cv);overlay=document.createElement('canvas');
 overlay.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';w.appendChild(overlay)}
const oc=overlay.getContext('2d');let GS=null;
const en=n=>n.prereq.every(p=>GS.by[p].unlocked);
const dm=(x,y,r)=>{oc.beginPath();oc.moveTo(x,y-r);oc.lineTo(x+r,y);oc.lineTo(x,y+r);oc.lineTo(x-r,y);oc.closePath()};
const nav=d=>{const c=GS.cur;let b=null;GS.src.nodes.forEach(n=>{if(n===c)return;const dx=n.x-c.x,dy=n.y-c.y;
 const ok=d[0]?(dy===0&&Math.sign(dx)===d[0]):(dx===0&&Math.sign(dy)===d[1]);
 if(ok&&(!b||Math.abs(dx+dy)<Math.abs(b.x-c.x+b.y-c.y)))b=n});
 if(b){GS.cur=b;GS.tw={t0:GS.t,d:10,fx:cam.x,fy:cam.y,tx:b.x-160+(b.cam&&b.cam.x||0),ty:b.y-80+(b.cam&&b.cam.y||0)}}};
const unlock=()=>{const n=GS.cur;if(!n.unlocked&&en(n)){n.unlocked=true;GS.fx.push({x:n.x,y:n.y,t:GS.t})}};
const kd=e=>{if(!GS||e.repeat||/^(TEXTAREA|INPUT)$/.test(e.target&&e.target.tagName))return;
 const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
 if(d){e.preventDefault();nav(d)}else if(e.key===' '||e.key==='Enter'){e.preventDefault();GS.press=true}};
const ku=e=>{if(GS&&GS.press&&(e.key===' '||e.key==='Enter')){GS.press=false;unlock()}};
if(opts.keys!==false){addEventListener('keydown',kd);addEventListener('keyup',ku)}
function graph(t){oc.setTransform(S,0,0,S,0,0);oc.imageSmoothingEnabled=SMOOTH;oc.clearRect(0,0,W,H);const g=spec&&spec.graph;if(!g){GS=null;cam.x=cam.y=0;return}
 if(!GS||GS.src!==g){GS={src:g,t,by:{},press:false,fx:[],tw:null};g.nodes.forEach(n=>{n.type=n.type||0;n.prereq=n.prereq||[];GS.by[n.id]=n});GS.cur=GS.by[g.start||0];cam.x=GS.cur.x-160;cam.y=GS.cur.y-80}
 GS.t=t;
 if(GS.tw){const w=GS.tw,k=Math.min(1,(t-w.t0)/w.d),e=1-Math.pow(1-k,3);cam.x=w.fx+(w.tx-w.fx)*e;cam.y=w.fy+(w.ty-w.fy)*e;if(k>=1)GS.tw=null}
 const sx=n=>Math.round(n.x-cam.x),sy=n=>Math.round(n.y-cam.y);
 const ln=(a,b)=>{oc.beginPath();oc.moveTo(sx(a)-1,sy(a));oc.lineTo(sx(b)-1,sy(b));oc.stroke()};
 g.nodes.forEach(n=>n.prereq.forEach(p=>{const a=GS.by[p],red=n.type==3||a.type==3;
  oc.globalAlpha=.5;oc.strokeStyle=red?'#f00':'#000';oc.lineWidth=2;ln(a,n);
  if(a.unlocked&&g.lit!==false){oc.globalAlpha=1;if(!sline(a,n)){oc.strokeStyle=red?'#ff8a8a':'#fff';oc.lineWidth=1;ln(a,n)}}}));
 oc.globalAlpha=1;
 g.nodes.forEach(n=>{const u=n.unlocked,ok=en(n),x=sx(n),y=sy(n),r=n.type?7:5,pr=GS.press&&GS.cur===n;
  if(snode(n,x,y,ok,pr,u))return;dm(x,y,r);oc.fillStyle=pr?'#fff':u?'#18181f':ok?'#2b2b38':'#14141a';oc.fill();
  oc.strokeStyle=u||pr?'#fff':ok?'#bbb':'#555';oc.lineWidth=1;oc.stroke();
  if(ok&&!u){oc.fillStyle='#fff';oc.fillRect(x+5,y-12,3,3)}});
 const c=GS.cur;if(!scur(c,t)){dm(sx(c),sy(c)+1,(c.type?7:5)+3+(((t/20)|0)%2));oc.strokeStyle='#ddff47';oc.stroke()}
 GS.fx=GS.fx.filter(f=>t-f.t<80);
 GS.fx.forEach(f=>{const a=t-f.t,k=Math.min(1,a/45),s=.5+.5*(1-Math.pow(2,-10*k));oc.globalAlpha=a<45?1:1-(a-45)/35;dm(f.x-cam.x,f.y-cam.y,22*s);oc.strokeStyle='#fff';oc.stroke()});
  if(g.hud){const hm=fr(g.hud.sprite||'sp_eventline_hud',g.hud.frame||0);if(hm){oc.globalAlpha=1;oc.drawImage(hm,0,0)}}
 oc.globalAlpha=1}
const hc=d=>{d%=360;const f=n=>{const k=(n+d/60)%6;return 1-Math.max(0,Math.min(k,4-k,1))};return[f(5),f(3),f(1)]};
const rr=(a,b)=>a+Math.random()*(b-a);
function emit(e,t){const f=Math.floor(t);
 if(!e._p||f-e._t>30){e._p=e._p||[];e._t=f;e._k=0}
 while(e._t<f){e._t++;e._k++;const ev=e.every||2;
  while(e._k>=ev){e._k-=ev;for(let i=0;i<(e.count||1);i++){const al=e.alpha||[1,1],nf=(FR[e.sprite]||[1]).length,b=e.blend||'white';
   const c=b==='white'?[1,1,1]:b==='black'?[0,0,0]:b==='rainbow'?hc(rr(0,360)):b==='cool'?hc(rr(173,278)):hex(b);
   e._p.push({x:rr(0,W),y:rr(0,H),vx:rr(-1,1)*(e.speed||1),vy:rr(-1,1)*(e.speed||1),a:rr(al[0],al[1]),f:Math.floor(Math.random()*nf),c})}}
  e._p.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.a-=e.fade==null?.00833:e.fade});
  e._p=e._p.filter(p=>p.a>0&&p.x>-50&&p.x<W+50&&p.y>-50&&p.y<H+50)}
 gl.uniform2f(U.uTile,0,0);gl.uniform3f(U.uD1,0,1,0);gl.uniform3f(U.uD2,0,1,0);gl.uniform1f(U.uChroma,0);gl.uniform2f(U.uNC,0,0);gl.activeTexture(gl.TEXTURE0);
 e._p.forEach(p=>{const a=getArt(e.sprite,p.f),x=Math.round(p.x)-(a.w>>1),y=Math.round(p.y)-(a.h>>1);gl.bindTexture(gl.TEXTURE_2D,a.t);
  gl.uniform4f(U.uR,x,y,a.w,a.h);gl.uniform2f(U.uSize,a.w,a.h);gl.uniform2f(U.uOff,x,y);gl.uniform4f(U.uColor,p.c[0],p.c[1],p.c[2],p.a);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)})}
function pulse(e,t){const f=Math.floor(t);
 if(!e._p||f-e._t>30){e._p=e._p||[];e._t=f}
 const g=e.grow||60,mx=e.size||50,ez=k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
 while(e._t<f){e._t++;for(let i=0;i<(e.count||1);i++)e._p.push({x:Math.floor(Math.random()*(W+1)),y:Math.floor(Math.random()*(H+1)),s:Math.floor(Math.random()*(mx+1)),a:0});
  e._p.forEach(p=>p.a++);e._p=e._p.filter(p=>p.a<2*g)}
 const b=e.blend||'black',c=b==='white'?[1,1,1]:b==='black'?[0,0,0]:hex(b),a=getArt(e.sprite||'solid',0);
 gl.uniform2f(U.uTile,0,0);gl.uniform3f(U.uD1,0,1,0);gl.uniform3f(U.uD2,0,1,0);gl.uniform1f(U.uChroma,0);gl.uniform2f(U.uNC,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,a.t);
 e._p.forEach(p=>{const z=p.s*(p.a<g?ez(p.a/g):1-ez((p.a-g)/g));if(z<.3)return;const x=p.x-z/2,y=p.y-z/2;
  gl.uniform4f(U.uColor,c[0],c[1],c[2],e.alpha==null?1:e.alpha);
  const [ml,mt,mr,mb]=e.slice||[2,2,2,2],tw=a.w,th=a.h;
  if(tw<=ml+mr||th<=mt+mb){gl.uniform4f(U.uR,x,y,z,z);gl.uniform2f(U.uSize,z,z);gl.uniform2f(U.uOff,x,y);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return}
  const fx=Math.min(1,z/(ml+mr)),fy=Math.min(1,z/(mt+mb)),L=ml*fx,R=mr*fx,T=mt*fy,B=mb*fy;
  const xs=[[0,ml,x,x+L],[ml,tw-mr,x+L,x+z-R],[tw-mr,tw,x+z-R,x+z]],ys=[[0,mt,y,y+T],[mt,th-mb,y+T,y+z-B],[th-mb,th,y+z-B,y+z]];
  xs.forEach(X=>ys.forEach(Y=>{const dw=X[3]-X[2],dh=Y[3]-Y[2];if(dw<=0||dh<=0||X[1]<=X[0]||Y[1]<=Y[0])return;
   const kx=dw/(X[1]-X[0]),ky=dh/(Y[1]-Y[0]);
   gl.uniform4f(U.uR,X[2],Y[2],dw,dh);gl.uniform2f(U.uSize,tw*kx,th*ky);gl.uniform2f(U.uOff,X[2]-X[0]*kx,Y[2]-Y[0]*ky);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}))})}
function bars(e,t){const f=Math.floor(t);
 if(!e._p||f-e._t>30){e._p=e._p||[];e._t=f;e._k=0}
 const ev=e.every||3,d=e.dur||[30,60],hh=e.height==null?.5:e.height,al=e.alpha||[.01,.4],bn=(e.mode||'bounce')==='bounce',life=bn?2:(e.life||4);
 const eo=k=>1-Math.pow(1-Math.min(Math.max(k,0),1),5);
 const ys=p=>{const k=p.a/p.d;return hh*(k<=1?eo(k):bn?eo(2-k):1)};
 const am=p=>{const k=p.a/p.d;return al[0]+(al[1]-al[0])*(k<=1?0:k<=2?eo(k-1):bn?eo(3-k):1)};
 while(e._t<f){e._t++;e._p.forEach(p=>p.a++);if(++e._k>=ev){e._k=0;e._p.push({y:Math.floor(Math.random()*181),d:rr(d[0],d[1]),a:0})}
  e._p=e._p.filter(p=>p.a<life*p.d)}
 const a=getArt(e.sprite||'sp_v3bg_bar',0),c=hex(e.tint||'#ffffff');
 gl.uniform2f(U.uTile,0,0);gl.uniform3f(U.uD1,0,1,0);gl.uniform3f(U.uD2,0,1,0);gl.uniform1f(U.uChroma,0);gl.uniform2f(U.uNC,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,a.t);
 e._p.forEach(p=>{const s=ys(p);if(s<.01)return;const h=a.h*s,y=p.y-h/2;
  gl.uniform4f(U.uR,0,y,a.w,h);gl.uniform2f(U.uSize,a.w,h);gl.uniform2f(U.uOff,0,y);gl.uniform4f(U.uColor,c[0],c[1],c[2],am(p));gl.drawArrays(gl.TRIANGLE_STRIP,0,4)})}
function credits(t){const c=spec&&spec.text;if(!c)return;
 if(c._t0==null)c._t0=t+(c.delay||0)*60;
 const e=k=>k>=1?1:1-Math.pow(2,-10*k),ib=k=>{const s=1.70158;return(s+1)*k*k*k-s*k*k},cl=k=>Math.min(1,Math.max(0,k));
 const my=-(c.speed||14)*(t-c._t0)/60,band=c.band||[10,170];
 oc.textBaseline='top';oc.textAlign='left';
 c.lines.forEach(L=>{const hh=L.sprite?((FR[L.sprite]&&FR[L.sprite][0].height)||24):0,y=L.y+hh/2+my,on=y>=band[0]&&y<=band[1];
  if(on&&!L._on){L._on=1;L._a=t}if(!on&&L._on){L._on=0;L._b=t}
  if(!L._on&&L._b==null)return;
  if(L.sprite){const k=Math.min(1,(t-(L._on?L._a:L._b))/30),c1=1.70158,c3=c1+1,s=L._on?1+c3*Math.pow(k-1,3)+c1*Math.pow(k-1,2):1-(c3*k*k*k-c1*k*k),im=FR[L.sprite]&&FR[L.sprite][0];if(s<=0)return;
   oc.save();oc.translate(160,y);oc.scale(s,s);
   if(im)oc.drawImage(im,-im.width/2,-im.height/2);else{oc.strokeStyle='#888';oc.strokeRect(-60,-12,120,24);oc.fillStyle='#888';oc.font='6px monospace';oc.textAlign='center';oc.textBaseline='middle';oc.fillText(L.sprite,0,0)}
   oc.restore();return}
  oc.font=FS+'px '+FONT;let x=160-oc.measureText(L.t).width/2;
  for(let i=0;i<L.t.length;i++){const ch=L.t[i],w=oc.measureText(ch).width;let yo,al;
   if(L._on){const k=cl((t-L._a-2*i)/30);yo=-10*(1-e(k));al=e(k)}else{const k=cl((t-L._b-2*i)/30);yo=10*ib(k);al=1-k}
   if(al>0){oc.globalAlpha=al;oc.fillStyle=L.color||'#fff';oc.fillText(ch,Math.round(x),Math.round(y+yo))}
   x+=w}});oc.globalAlpha=1}
const lalpha=(l,t)=>{const a=l.alpha==null?1:l.alpha,f=l.fade;if(!f)return a;let k=Math.min(1,Math.max(0,(t/60-(f[2]||0))/f[3]));if(f[4]==='q5')k=k<.5?16*k**5:1-Math.pow(-2*k+2,5)/2;return a*(f[0]+(f[1]-f[0])*k)};
function lyr(t){const c=spec&&spec.lyrics;if(!c)return;const p=(AUD&&!AUD.paused&&spec.audio)?AUD.currentTime:t/60+(c.offset||0);let cur='';
 let ls=c.lines;if(typeof ls[0]==='string'){ls=[];for(let i=0;i+1<c.lines.length;i+=2)ls.push([c.lines[i],c.lines[i+1]])}
 for(const l of ls){if(p>=l[1])cur=l[0];else break}
 if(!cur)return;
 oc.font=(c.size||FS)+'px '+FONT;oc.textBaseline='top';oc.textAlign='center';
 const mw=c.width||300,rows=[];let r='';
 cur.split(' ').forEach(w=>{const n=r?r+' '+w:w;if(oc.measureText(n).width>mw&&r){rows.push(r);r=w}else r=n});rows.push(r);
 rows.forEach((s,i)=>{const y=(c.y||160)+i*(c.sep||10);
  oc.fillStyle=c.outline||'#000000';[-1,0,1].forEach(dx=>[-1,0,1].forEach(dy=>{if(dx||dy)oc.fillText(s,160+dx,y+dy)}));
  oc.fillStyle=c.color||'#808080';oc.fillText(s,160,y)})}
function startAudio(){if(!AUD)return;AUD.pause();const a=spec&&spec.audio;if(!a)return;AUD.currentTime=a.offset!=null?a.offset:((spec.lyrics&&spec.lyrics.offset)||0);AUD.volume=a.volume==null?1:a.volume;AUD.play().catch(()=>{})}
const SP=()=>(spec&&spec.graph&&spec.graph.sprites)||{};
const fr=(k,i)=>{const a=FR[k];return a&&a.length?a[((i|0)%a.length+a.length)%a.length]:null};
function snode(n,x,y,ok,pr,u){const s=SP(),im=s.node&&fr(s.node,n.type*3+(!ok?0:pr?2:1));if(!im)return false;
 const o=(s.origin&&s.origin.node)||[im.width>>1,im.height>>1];oc.globalAlpha=1;oc.drawImage(im,x-o[0],y-o[1]);
 if(ok&&!u){const av=fr(s.avail||'sp_nodeavailable',0),q=(s.origin&&s.origin.avail)||[0,0];if(av)oc.drawImage(av,x+6-q[0],y-10-q[1]);else{oc.fillStyle='#fff';oc.fillRect(x+5,y-12,3,3)}}
 return true}
function scur(c,t){const s=SP(),a=FR[c.type==0?(s.cursor||'sp_n_nodecursor'):(s.cursorSpecial||'sp_s_nodecursor')];if(!a||!a.length)return false;
 const im=a[Math.floor(t*.05)%a.length],o=(s.origin&&s.origin[c.type==0?'cursor':'cursorSpecial'])||[im.width>>1,im.height>>1];
 oc.globalAlpha=1;oc.drawImage(im,Math.round(c.x-cam.x)-o[0],Math.round(c.y-cam.y)+1-o[1]);return true}
function sline(a,n){const s=SP(),im=s.line&&fr(s.line,0);if(!im)return false;
 const dx=n.x-a.x,dy=n.y-a.y,o=(s.origin&&s.origin.line)||[0,im.height>>1];
 oc.save();oc.translate(Math.round(a.x-cam.x),Math.round(a.y-cam.y));oc.rotate(Math.atan2(dy,dx));oc.scale(Math.hypot(dx,dy),s.lineScale||1);oc.drawImage(im,-o[0],-o[1]);oc.restore();return true}
function setRes(){cv.width=W*S;cv.height=H*S;overlay.width=W*S;overlay.height=H*S;
 [cv,overlay].forEach(c=>{c.style.imageRendering=(S===1&&!SMOOTH)?'pixelated':'auto'});
 gl.viewport(0,0,W*S,H*S);
 Object.values(cache).forEach(a=>{gl.bindTexture(gl.TEXTURE_2D,a.t);const f=SMOOTH?gl.LINEAR:gl.NEAREST;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f)})}
setRes();
const loadImg=u=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('failed to load '+u));i.src=u});
function setSprite(k,ims){FR[k]=[].concat(ims).map(i=>(typeof HTMLCanvasElement!=='undefined'&&i instanceof HTMLCanvasElement)?i:mkc(i.naturalWidth||i.width,i.naturalHeight||i.height,x=>x.drawImage(i,0,0)));
 Object.keys(cache).filter(c=>c.split(':')[0]===k).forEach(c=>delete cache[c])}
async function loadSprites(map){for(const k of Object.keys(map)){setSprite(k,await Promise.all([].concat(map[k]).map(loadImg)))}return api}
async function loadFolder(dir,list){const m={};for(const k of Object.keys(list)){m[k]=Array.from({length:list[k]||1},(_,i)=>dir.replace(/\/$/,'')+'/'+k+'_'+i+'.png')}return loadSprites(m)}
async function loadFont(url,fontSize){const ff=await new FontFace('bgfont',"url("+url+")").load();document.fonts.add(ff);FONT='bgfont';FS=fontSize||opts.fontSize||16;return api}
async function loadPackage(manifestUrl='bgstack.json'){
 const manifestHref=new URL(manifestUrl,document.baseURI).href;
 const readJson=async url=>{const r=await fetch(url);if(!r.ok)throw new Error('bgstack package: failed to fetch '+url+' ('+r.status+')');return r.json()};
 const manifest=await readJson(manifestHref);
 if(!manifest||manifest.format!=='bgstack-package'||manifest.version!==1)throw new Error('Unsupported bgstack package manifest (expected bgstack-package v1)');
 const base=new URL('./',manifestHref),resolve=p=>new URL(p,base).href;
 const sceneUrl=resolve(manifest.scene||'scene.json');
 const scene=await readJson(sceneUrl);
 if(!scene||!Array.isArray(scene.layers))throw new Error('bgstack package scene needs a "layers" array');
 const assets=manifest.assets||{};
 api.stop();
 const images=assets.images||manifest.images||{};
 const spriteMap={};
 Object.keys(images).forEach(name=>{spriteMap[name]=[].concat(images[name]).map(resolve)});
 // A package replaces the previous package's resources on this instance.
 if(AUD){AUD.pause();AUD=null;}
 Object.keys(FR).forEach(name=>delete FR[name]);
 Object.values(cache).forEach(item=>{if(gl.deleteTexture)gl.deleteTexture(item.t)});
 Object.keys(cache).forEach(name=>delete cache[name]);
 FONT=opts.font||'monospace';FS=opts.fontSize||8;
 if(Object.keys(spriteMap).length)await loadSprites(spriteMap);
 if(assets.font)await loadFont(resolve(assets.font),assets.fontSize);
 if(assets.audio){AUD=new Audio(resolve(assets.audio));AUD.preload='auto';if(!scene.audio)scene.audio={};}
 api.load(scene);
 return api;
}
const api={gl,canvas:cv,overlay,
 get spec(){return spec},
 load(s){if(typeof s==='string')s=JSON.parse(s);if(!s||!Array.isArray(s.layers))throw new Error('spec needs a "layers" array');spec=s;t0=performance.now();startAudio();return api},
 start(){if(running)return api;running=true;t0=performance.now();startAudio();frame();return api},
 stop(){running=false;cancelAnimationFrame(raf);if(AUD)AUD.pause();return api},
 setScale(n,sm){S=Math.min(4,Math.max(1,n|0||1));if(sm!=null)SMOOTH=!!sm;setRes();return api},
 setSprite(k,ims){setSprite(k,ims);return api},loadSprites,loadFolder,loadFont,loadPackage,
 setAudio(a){if(AUD)AUD.pause();AUD=typeof a==='string'?new Audio(a):a;if(AUD)AUD.preload='auto';startAudio();return api},
 nav(dx,dy){if(GS)nav([dx,dy]);return api},press(){if(GS)GS.press=true;return api},release(){if(GS&&GS.press){GS.press=false;unlock()}return api},
 destroy(){api.stop();removeEventListener('keydown',kd);removeEventListener('keyup',ku)}};
return api;
}
return { create: create };
});
