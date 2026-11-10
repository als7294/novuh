import * as THREE from './vendor/three.module.min.js';

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = Math.min(2, window.devicePixelRatio || 1);
const PHONE = Math.min(innerWidth, innerHeight) < 760; // lighter GPU budget on phones
// iOS fires resize whenever the address bar slides; only react to real width changes there (else canvases realloc mid-scroll and flash)
const onWidthResize = (fn) => { let w = innerWidth; addEventListener('resize', () => { if (PHONE && innerWidth === w) return; w = innerWidth; fn(); }); };
const root = document.documentElement;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
window.__nvStarted = true;
// the design runtime keeps a hidden template copy inside <x-dc>; always pick the live node
const live = (id) => [...document.querySelectorAll('#' + id)].find((el) => !el.closest('x-dc'));

/* =====================================================================
   Background: deep-space shader (stars, Milky Way, nebula, planet limb)
   ===================================================================== */
const BG_FRAG = /* glsl */`
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uScroll; uniform float uHero; uniform float uPx;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<OCT;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
vec3 stars(vec2 px,float cell,float dens,float seed){
  vec2 g=px/cell; vec2 id=floor(g); vec2 f=fract(g)-.5;
  float n=h21(id+seed);
  if(n>dens) return vec3(0.);
  vec2 o=vec2(h21(id+seed+1.7),h21(id+seed+9.3))-.5;
  vec2 d=(f-o*.5)*cell;
  float m=h21(id+seed+4.4);
  float sz=(.5+1.5*m*m*m)*uPx;
  float core=exp(-dot(d,d)/(sz*sz));
  float gr=min(sz*3.5,cell*.07);
  float glow=exp(-length(d)/gr)*.16*m*smoothstep(.5,.3,max(abs(f.x-o.x*.5),abs(f.y-o.y*.5)));
  float spike=0.;
  if(m>.94&&cell>40.*uPx){spike=(exp(-abs(d.x)/(.5*uPx))*exp(-abs(d.y)/(cell*.16))+exp(-abs(d.y)/(.5*uPx))*exp(-abs(d.x)/(cell*.16)))*.55;}
  float tw=.78+.22*sin(uTime*(.8+2.6*n)+n*60.);
  vec3 c=mix(vec3(1.,.74,.52),vec3(.68,.8,1.),h21(id+seed+2.2));
  c=mix(c,vec3(1.),.5);
  return c*(core+glow+spike)*tw*(.3+1.15*m);
}
void main(){
  vec2 fc=gl_FragCoord.xy, res=uRes;
  vec2 p=(fc-.5*res)/res.y;
  vec2 par=uMouse*vec2(1.,-1.);
  vec2 q=p+par*.02+vec2(0.,uScroll/res.y*.08);
  /* Milky Way band with dust lanes */
  vec2 bn=normalize(vec2(.45,1.));
  float bd=dot(q-vec2(.18,.08),bn);
  float band=exp(-bd*bd/.075);
  float coreB=exp(-bd*bd/.01);
  float w1=fbm(q*2.1+vec2(uTime*.003,0.));
  float w2=fbm(q*4.2+w1*1.9+3.1);
  float dust=smoothstep(.44,.74,fbm(q*7.+w2*1.3+11.));
  vec3 col=vec3(.0015,.002,.004);
  vec3 bandCol=mix(vec3(.26,.24,.40),vec3(1.,.80,.62),coreB*.85);
  col+=bandCol*band*(.025+.11*w2*w2)*(1.-.85*dust*band);
  /* emission / reflection nebulae */
  float n1=fbm(q*1.25+vec2(5.2,1.3)+w1*1.2);
  float n2=fbm(q*1.6+vec2(-3.,7.)+w2*.7);
  float n3=fbm(q*2.6+vec2(9.,2.)+w1);
  col+=vec3(.50,.10,.38)*pow(n1,3.6)*.22;
  col+=vec3(.08,.26,.42)*pow(n2,3.6)*.2;
  col+=vec3(1.,.38,.14)*pow(n3,4.8)*.14*(.3+band);
  /* stars, three depths with parallax */
  float sAll=1.-dust*band*.8;
  vec3 st=stars(fc+vec2(0.,uScroll*.04)+par*6.*uPx,11.*uPx,(.07+.5*band)*sAll,1.)*.5;
  st+=stars(fc+vec2(0.,uScroll*.1)+par*16.*uPx,23.*uPx,(.10+.32*band)*sAll,7.)*.8;
  st+=stars(fc+vec2(0.,uScroll*.22)+par*38.*uPx,64.*uPx,.15,13.);
  /* planet limb at the foot of the hero, sunrise on the edge */
  float k=1.-smoothstep(uHero*.72,uHero*1.02,uScroll); // rim scrolls up with the page and only fades as it reaches the top
  float R=2.6*res.y;
  float limbY=res.y-(uHero-36.*uPx-uScroll);
  vec2 c=vec2(res.x*.5-par.x*14.*uPx,limbY-R);
  float e=length(fc-c)-R;
  float inside=1.-smoothstep(-1.2*uPx,1.2*uPx,e);
  float sunX=res.x*.62;
  float wx=exp(-pow((fc.x-sunX)/(res.x*.2),2.));
  vec3 atm=mix(vec3(.22,.48,1.),vec3(1.,.5,.2),wx*.9);
  float eo=max(e,0.);
  float halo=exp(-eo/(.007*res.y))*.7+exp(-eo/(.05*res.y))*.18+exp(-eo/(.2*res.y))*.03;
  float rim=exp(-abs(e)/(1.1*uPx));
  vec2 surf=(fc-c)/res.y;
  float inner=exp(min(e,0.)/(.018*res.y));
  float clouds=fbm(surf*vec2(7.,26.)+vec2(uTime*.004,0.));
  vec3 planet=vec3(.002,.003,.006)+vec3(.04,.09,.18)*inner*(.35+clouds)*(.3+wx);
  planet+=vec3(1.,.6,.3)*exp(min(e,0.)/(.004*res.y))*wx*.3;
  vec3 limb=atm*halo*(.22+.95*wx)*(1.-inside)+mix(vec3(.55,.75,1.),vec3(1.,.85,.65),wx)*rim;
  float sy=c.y+sqrt(max(R*R-(sunX-c.x)*(sunX-c.x),0.))+1.5*uPx;
  vec2 sd=fc-vec2(sunX,sy);
  float sun=exp(-length(sd)/(.005*res.y))*2.+exp(-length(sd)/(.04*res.y))*.22;
  sun+=exp(-abs(sd.y)/(1.2*uPx))*exp(-abs(sd.x)/(.09*res.x))*.45;
  vec3 space=col+st*(1.-inside*k);
  vec3 outc=mix(space,planet,inside*k)+(limb+vec3(1.,.84,.68)*sun)*k;
  outc=1.-exp(-outc*1.1);
  outc+=(h21(fc+fract(uTime*7.))-.5)/255.;
  gl_FragColor=vec4(outc,1.);
}`;

function startBackground() {
  const cv = live('nv-bg');
  if (!cv) { requestAnimationFrame(startBackground); return; }
  let r;
  try { r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { return; }
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const u = {
    uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() },
    uScroll: { value: 0 }, uHero: { value: 800 }, uPx: { value: 1 },
  };
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false, defines: { OCT: PHONE ? 4 : 6 },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: BG_FRAG,
  })));
  // ponytail: fixed 1.25x render scale for the full-screen fbm; drop to 1 if low-end GPUs stutter
  const pr = PHONE ? Math.min(DPR, 0.75) : Math.min(DPR, 1.25);
  if (PHONE) cv.style.height = '100lvh'; // size to the large viewport so the address bar never resizes it
  let dirty = true;
  const size = () => { r.setPixelRatio(pr); r.setSize(cv.clientWidth, cv.clientHeight, false); u.uRes.value.set(cv.width, cv.height); u.uPx.value = cv.height / Math.max(1, cv.clientHeight); dirty = true; };
  size(); onWidthResize(size);
  addEventListener('scroll', () => { dirty = true; }, { passive: true });
  const mt = new THREE.Vector2();
  addEventListener('pointermove', (e) => mt.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));
  const t0 = performance.now();
  const loop = (now) => {
    // phones: no idle redraw (no twinkle); only re-render when the scroll moves the planet rim
    if (PHONE && !dirty) { requestAnimationFrame(loop); return; }
    dirty = false;
    const hero = live('top');
    u.uHero.value = (hero ? hero.offsetTop + hero.offsetHeight : innerHeight) * u.uPx.value;
    u.uScroll.value = scrollY * u.uPx.value;
    u.uMouse.value.lerp(mt, 0.04);
    u.uTime.value = RM || PHONE ? 0 : (now - t0) / 1000;
    r.render(scene, cam);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
startBackground();

/* =====================================================================
   Hero logo particles: one 3D cloud orbiting the logo, split across a
   canvas behind it and one in front so particles pass around the letters
   ===================================================================== */
function startParticles() {
  if (PHONE) return;
  const cvs = [...document.querySelectorAll('canvas.lg-pt')].filter((c) => !c.closest('x-dc'));
  if (cvs.length < 2) { requestAnimationFrame(startParticles); return; }
  const back = cvs.find((c) => c.dataset.layer === 'back'), front = cvs.find((c) => c.dataset.layer === 'front');
  const bx = back.getContext('2d'), fx = front.getContext('2d');
  const COLORS = ['127,232,255', '255,255,255', '196,155,255', '170,150,255'];
  const P = Array.from({ length: innerWidth < 700 ? 60 : 120 }, () => ({
    a: Math.random() * 6.283, r: 0.3 + Math.random() * 0.8, y: (Math.random() - 0.5) * 1.1,
    sp: (0.06 + Math.random() * 0.22) * (Math.random() < 0.7 ? 1 : -1), vy: -(0.006 + Math.random() * 0.03),
    s: 0.4 + Math.random() * 1.7, c: COLORS[Math.random() < 0.55 ? 0 : (Math.random() * 4) | 0], tw: Math.random() * 6.28,
  }));
  let W = 0, H = 0;
  const size = () => { for (const c of [back, front]) { c.width = c.clientWidth * DPR; c.height = c.clientHeight * DPR; } W = back.clientWidth; H = back.clientHeight; };
  size(); addEventListener('resize', size);
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
    requestAnimationFrame(loop);
    if (back.getBoundingClientRect().bottom < 0) return; // hero scrolled away
    for (const x of [bx, fx]) { x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, W, H); x.globalCompositeOperation = 'lighter'; }
    const yaw = Math.sin((t / 12) * 6.283 - Math.PI / 2) * 0.5; // follows the logo's swing
    for (const p of P) {
      if (!RM) { p.a += p.sp * dt; p.y += p.vy * dt; if (p.y < -0.6) p.y = 0.6; }
      const x3 = Math.cos(p.a) * p.r, z3 = Math.sin(p.a) * p.r;
      const x = x3 * Math.cos(yaw) - z3 * Math.sin(yaw), z = x3 * Math.sin(yaw) + z3 * Math.cos(yaw);
      const k = 1 / (1 - z * 0.38);
      const sx = W / 2 + x * W * 0.4 * k, sy = H / 2 + p.y * H * 0.5 * k;
      const ctx = z > 0 ? fx : bx;
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.6 + p.tw));
      const a = tw * (z > 0 ? 0.6 : 0.32), rad = p.s * k * 0.85;
      ctx.fillStyle = `rgba(${p.c},${(a * 0.18).toFixed(3)})`; ctx.beginPath(); ctx.arc(sx, sy, rad * 4.5, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(${p.c},${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, 6.283); ctx.fill();
    }
  };
  requestAnimationFrame(loop);
}
startParticles();

/* Live wall: muted loops play only while on screen */
function startLoops() {
  const vids = [...document.querySelectorAll('video.lv-v')].filter((v) => !v.closest('x-dc'));
  if (!vids.length) { requestAnimationFrame(startLoops); return; }
  if (RM) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target; v.muted = true;
    if (e.isIntersecting) v.play().catch(() => {}); else v.pause();
  }), { rootMargin: '200px' });
  vids.forEach((v) => { v.muted = true; v.setAttribute('muted', ''); io.observe(v); });
  // accordion: hover picks a slice, otherwise it cycles on its own
  const tiles = [...document.querySelectorAll('.lv')].filter((t) => !t.closest('x-dc'));
  const pick = (i) => { tiles.forEach((t, k) => t.classList.toggle('on', k === i)); };
  // the open slice stays open until another one is hovered (or tapped)
  tiles.forEach((t, i) => { t.addEventListener('mouseenter', () => pick(i)); t.addEventListener('click', () => pick(i)); });
  // meteor band: lazy-load and play only near the viewport
  const mv = [...document.querySelectorAll('video.mt-v')].find((v) => !v.closest('x-dc'));
  if (mv) {
    mv.muted = true; mv.setAttribute('muted', '');
    // excerpt, not a seamless loop: dip to black over the cut
    mv.style.transition = 'opacity .35s ease';
    mv.addEventListener('timeupdate', () => { mv.style.opacity = mv.duration - mv.currentTime < 0.45 ? '0' : '1'; });
    mv.addEventListener('seeked', () => { mv.style.opacity = '1'; });
    new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { if (mv.preload !== 'auto') { mv.preload = 'auto'; mv.load(); } mv.play().catch(() => {}); } else mv.pause();
    }), { rootMargin: '300px' }).observe(mv);
  }
}
startLoops();

/* About: glitch-in trigger + particles drifting up behind him */
function startAbout() {
  if (PHONE) return;
  const stage = [...document.querySelectorAll('.ab-stage')].find((x) => !x.closest('x-dc'));
  if (!stage) { requestAnimationFrame(startAbout); return; }
  const cv = stage.querySelector('.ab-pt'), cx = cv.getContext('2d');
  let W = 0, H = 0, on = false, visible = false;
  const size = () => { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * DPR; cv.height = H * DPR; };
  size(); addEventListener('resize', size);
  const COLORS = ['180,140,255', '127,232,255', '255,255,255', '214,91,255'];
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const P = Array.from({ length: innerWidth < 700 ? 50 : 110 }, () => ({
    x: 0.5 + gauss() * 0.42, y: Math.random(), v: 0.015 + Math.random() * 0.05, dx: (Math.random() - 0.5) * 0.01,
    s: 0.5 + Math.random() * 1.8, c: COLORS[(Math.random() * 4) | 0], tw: Math.random() * 6.28,
  }));
  new IntersectionObserver((es) => es.forEach((e) => {
    visible = e.isIntersecting;
    if (e.isIntersecting && e.intersectionRatio > 0.3 && !on) { on = true; stage.classList.add('ab-in'); }
  }), { threshold: [0, 0.3] }).observe(stage);
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
    requestAnimationFrame(loop);
    if (!on || !visible) return;
    cx.setTransform(DPR, 0, 0, DPR, 0, 0); cx.clearRect(0, 0, W, H); cx.globalCompositeOperation = 'lighter';
    for (const p of P) {
      if (!RM) { p.y -= p.v * dt; p.x += p.dx * dt; if (p.y < -0.02) { p.y = 1.02; p.x = 0.5 + gauss() * 0.42; } }
      const a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + p.tw))) * Math.min(1, (1 - p.y) * 4) * 0.7;
      const X = p.x * W, Y = p.y * H;
      cx.fillStyle = `rgba(${p.c},${(a * 0.16).toFixed(3)})`; cx.beginPath(); cx.arc(X, Y, p.s * 4, 0, 6.283); cx.fill();
      cx.fillStyle = `rgba(${p.c},${a.toFixed(3)})`; cx.beginPath(); cx.arc(X, Y, p.s, 0, 6.283); cx.fill();
    }
  };
  requestAnimationFrame(loop);
}
startAbout();

/* =====================================================================
   Launch intro: real-time 3D scene
   ===================================================================== */
const ov = document.getElementById('nv-intro');
const NV_WM = 'M520 531L644 531L689 707L689 531L796 487L796 930L673 930L623 748L623 930L520 975Z M910 532H1034A76 76 0 0 1 1110 608V856A76 76 0 0 1 1034 932H910A76 76 0 0 1 834 856V608A76 76 0 0 1 910 532Z M957 602A11 11 0 0 0 946 613V853A11 11 0 0 0 957 864H984A11 11 0 0 0 995 853V613A11 11 0 0 0 984 602Z M1130 487L1240 531L1278 770L1317 531L1428 487L1354 932L1210 932Z M1455 533H1567V850A17 17 0 0 0 1584 867H1600A17 17 0 0 0 1617 850V533H1720V855A77 77 0 0 1 1643 932H1530A75 75 0 0 1 1455 857Z M1774 491L1880 534L1880 694L1930 694L1930 534L2038 534L2038 976L1924 932L1924 765L1880 765L1880 932L1774 932Z';

/* timeline (s): engine already lit, intro opens on liftoff */
const T_IGN = -0.7, T_LIFT = 0, T_FADE = 1.85, T_END = 2.45, PREWARM = 0.55, ROCK_Y = 1.7;
const lift = (t) => { if (t < T_LIFT) return 0; const u = t - T_LIFT; return 5 * u * u + 14 * u * u * u * u; };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const puffTex = () => canvasTex(256, 256, (x) => {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * 6.283, d = Math.random() * 62, cx = 128 + Math.cos(a) * d, cy = 128 + Math.sin(a) * d * 0.85, rr = rnd(30, 70);
    const g = x.createRadialGradient(cx - rr * 0.25, cy - rr * 0.3, 0, cx, cy, rr);
    const l = rnd(0.82, 1);
    g.addColorStop(0, `rgba(${255 * l | 0},${255 * l | 0},${255 * l | 0},.55)`);
    g.addColorStop(0.6, `rgba(${215 * l | 0},${215 * l | 0},${215 * l | 0},.3)`);
    g.addColorStop(1, 'rgba(190,190,190,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, 6.283); x.fill();
  }
});
const glowTex = () => canvasTex(128, 128, (x) => {
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
});

/* Instanced camera-facing quads: no point-size limits, one draw call per system. */
class Particles {
  constructor(max, map, blending, near = 0) {
    this.max = max; this.list = [];
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(max * 3); this.dat = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    const mk = (arr, n) => { const a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    g.setAttribute('iPos', this.aPos = mk(this.pos, 3)); g.setAttribute('iD', this.aDat = mk(this.dat, 3)); g.setAttribute('iC', this.aCol = mk(this.col, 3));
    g.instanceCount = 0; this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uNear: { value: near } }, transparent: true, depthWrite: false, blending,
      vertexShader: `attribute vec3 iPos; attribute vec3 iD; attribute vec3 iC; uniform float uNear; varying vec2 vUv; varying float vA; varying vec3 vC;
        void main(){vUv=uv;vC=iC;vec4 mv=modelViewMatrix*vec4(iPos,1.);vA=iD.y*smoothstep(uNear*.3,uNear,-mv.z);float c=cos(iD.z),s=sin(iD.z);
        mv.xy+=mat2(c,s,-s,c)*position.xy*iD.x;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vA; varying vec3 vC;
        void main(){vec4 t=texture2D(map,vUv);gl_FragColor=vec4(vC*t.rgb,t.a*vA);}`,
    }));
    this.mesh.frustumCulled = false;
  }
  add(p) { if (this.list.length < this.max) this.list.push(p); }
  clear() { this.list.length = 0; this.geo.instanceCount = 0; }
  update(dt, fn) {
    let n = 0; const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.age += dt;
      if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      fn(p, dt);
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.dat[n * 3] = p.size; this.dat[n * 3 + 1] = p.alpha; this.dat[n * 3 + 2] = p.rot;
      this.col[n * 3] = p.r; this.col[n * 3 + 1] = p.g; this.col[n * 3 + 2] = p.b;
      n++;
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aDat.needsUpdate = this.aCol.needsUpdate = true;
  }
}

function buildIntro() {
  const cv = document.getElementById('nv-intro-c');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(DPR, PHONE ? 1 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04050a, 0.0042);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);

  /* sky dome with a far-off dawn glow on the horizon */
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vD;void main(){float y=vD.y;
      vec3 c=mix(vec3(.022,.028,.05),vec3(.003,.004,.011),smoothstep(0.,.45,y));
      float s=max(dot(normalize(vec3(vD.x,0.,vD.z)),normalize(vec3(.75,0.,-.66))),0.);
      c+=vec3(.75,.28,.08)*pow(s,5.)*exp(-max(y,0.)*10.)*.55;
      c+=vec3(.18,.22,.45)*pow(s,2.)*exp(-max(y,0.)*4.)*.12;
      if(y<0.)c=vec3(.003,.003,.005);
      gl_FragColor=vec4(c,1.);}`,
  })));

  /* stars + Milky Way band */
  const starLayer = (n, px, bright) => {
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3), v = new THREE.Vector3(), bandN = new THREE.Vector3(0.5, 0.3, 0.8).normalize();
    for (let i = 0; i < n; i++) {
      do { v.set(rnd(-1, 1), rnd(0.01, 1), rnd(-1, 1)).normalize(); } while (Math.abs(v.dot(bandN)) > 0.25 && Math.random() < 0.75);
      v.multiplyScalar(2200); P.set([v.x, v.y, v.z], i * 3);
      const l = bright * rnd(0.25, 1), w = Math.random();
      C.set([l * (w < 0.2 ? 1 : 0.85), l * 0.9, l * (w > 0.75 ? 1 : 0.8)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: px * DPR, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));
  };
  starLayer(6000, 1.0, 0.75); starLayer(380, 2.0, 1.2);

  /* ground, distant spaceport lights */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2000, 64), new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  {
    const n = 260, P = new Float32Array(n * 3), C = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.283), d = rnd(70, 900); P.set([Math.sin(a) * d, rnd(0.2, 2), Math.cos(a) * d], i * 3);
      const w = Math.random() < 0.8; C.set(w ? [1, 0.62, 0.3] : [0.7, 0.85, 1], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2 * DPR, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 })));
  }

  /* pad + tower */
  const concrete = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x40444c, roughness: 0.55, metalness: 0.75 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 22), concrete); pad.position.y = 0.6; scene.add(pad);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 0.5, 40), steel); deck.position.y = 1.45; scene.add(deck);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), steel);
    m.position.set(Math.sin(a) * 1.55, 2.2, Math.cos(a) * 1.55); scene.add(m);
  }
  const tower = new THREE.Group(); tower.position.set(-6.2, 1.2, 0); scene.add(tower);
  const TH = 21, TW = 2;
  const box = (w, h, d, x, y, z, rx = 0, rz = 0, parent = tower) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steel); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); parent.add(m); return m; };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.18, TH, 0.18, sx * TW / 2, TH / 2, sz * TW / 2);
  for (let face = 0; face < 4; face++) {
    const f = new THREE.Group(); f.rotation.y = face * Math.PI / 2; tower.add(f);
    const step = 1.75, len = Math.hypot(TW, step), ang = Math.atan2(step, TW);
    for (let y = step, i = 0; y <= TH; y += step, i++) {
      box(TW, 0.1, 0.1, 0, y, TW / 2, 0, 0, f);
      box(len, 0.07, 0.07, 0, y - step / 2, TW / 2, 0, i % 2 ? ang : -ang, f);
    }
  }
  const armPivot = new THREE.Group(); armPivot.position.set(TW / 2, 12.5, 0); tower.add(armPivot);
  box(4.1, 0.4, 0.7, 2.05, 0, 0, 0, 0, armPivot);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  beacon.position.set(0, TH + 0.4, 0); tower.add(beacon);

  /* rocket */
  const rocket = new THREE.Group(); rocket.position.y = ROCK_Y; scene.add(rocket);
  const DS = THREE.DoubleSide;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.36, metalness: 0.18, side: DS });
  const orange = new THREE.MeshStandardMaterial({ color: 0x8b5cff, roughness: 0.42, metalness: 0.12, side: DS });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.45, metalness: 0.6, side: DS });
  const metal = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.28, metalness: 0.95, side: DS });
  const V = (x, y) => new THREE.Vector2(x, y);
  rocket.add(new THREE.Mesh(new THREE.LatheGeometry([V(0.42, 1.0), V(0.5, 0.75), V(0.68, 0.35), V(0.9, 0)], 48), metal));
  rocket.add(new THREE.Mesh(new THREE.LatheGeometry([V(0.001, 0.9), V(0.82, 0.9), V(1, 1.15), V(1, 10)], 64), white));
  rocket.add(new THREE.Mesh(new THREE.LatheGeometry([V(1, 10), V(0.975, 10.8), V(0.87, 11.6), V(0.67, 12.4), V(0.41, 13.0), V(0.16, 13.4), V(0.001, 13.52)], 64), orange));
  const ring = (y, h, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.012, 1.012, h, 64, 1, true), mat); m.position.y = y; rocket.add(m); };
  ring(6.7, 0.42, orange); ring(1.55, 0.6, dark); ring(9.85, 0.12, dark);
  const fin = new THREE.Shape(); fin.moveTo(0, 4.4); fin.lineTo(0, 1.1); fin.lineTo(1.7, -0.3); fin.lineTo(1.8, 0.7); fin.lineTo(0.5, 3.3); fin.closePath();
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); finG.translate(0, 0, -0.07);
  for (let k = 0; k < 4; k++) { const g = new THREE.Group(); g.rotation.y = k * Math.PI / 2; const m = new THREE.Mesh(finG, dark); m.position.x = 0.94; g.add(m); rocket.add(g); }
  const FACE = THREE.MathUtils.degToRad(132); // the side the opening shot sees
  {
    const g = new THREE.Group(); g.rotation.y = FACE; rocket.add(g);
    const glass = new THREE.MeshStandardMaterial({ color: 0x0b1522, roughness: 0.08, metalness: 0.9, emissive: 0x0c1830 });
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 40), glass); w.rotation.x = Math.PI / 2; w.position.set(0, 8.3, 0.96); g.add(w);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.065, 12, 40), metal); t.position.set(0, 8.3, 1.02); g.add(t);
  }
  const decal = canvasTex(256, 1024, (x, w, h) => {
    const k = 0.58; x.translate(w / 2, h / 2); x.rotate(Math.PI / 2); x.scale(k, k); x.translate(-1279, -731);
    x.fillStyle = '#141418'; x.fill(new Path2D(NV_WM), 'evenodd');
  });
  const decalMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.016, 1.016, 4.6, 32, 1, true, FACE - 0.42, 0.84),
    new THREE.MeshStandardMaterial({ map: decal, transparent: true, roughness: 0.4, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
  decalMesh.position.y = 4.1; rocket.add(decalMesh);

  /* engine flame: two additive cones with shock diamonds */
  const flameMat = (hot) => new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `uniform float uT;varying float vT;varying vec3 vN;varying vec3 vV;
      void main(){vT=.5-position.y;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalMatrix*normal;vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float uI;uniform float uT;varying float vT;varying vec3 vN;varying vec3 vV;
      void main(){float fr=pow(abs(dot(normalize(vN),normalize(vV))),${hot ? '2.2' : '1.3'});
      float a=pow(vT,${hot ? '3.' : '1.4'})*fr*uI;
      float dia=.75+.25*sin(vT*46.-uT*80.);
      vec3 c=mix(vec3(1.,.3,.05),vec3(1.,.88,.62),pow(vT,2.));
      c+=vec3(.55,.68,1.)*pow(vT,9.)*${hot ? '1.2' : '.4'};
      gl_FragColor=vec4(c*a*dia,1.);}`,
  });
  const flameO = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1, 40, 1, true), flameMat(false));
  const flameI = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 40, 1, true), flameMat(true));
  for (const f of [flameO, flameI]) { f.rotation.x = Math.PI; rocket.add(f); }

  /* lights */
  scene.add(new THREE.HemisphereLight(0x27365a, 0x050505, 0.45));
  const rim = new THREE.DirectionalLight(0x9fbcff, 1.6); rim.position.set(-30, 40, -40); scene.add(rim);
  const warmKey = new THREE.DirectionalLight(0xffb27a, 0.5); warmKey.position.set(60, 8, -50); scene.add(warmKey);
  const flood = (x, z, c, i) => { const s = new THREE.SpotLight(c, i, 120, 0.42, 0.7, 1.4); s.position.set(x, 0.6, z); s.target.position.set(0, 8, 0); scene.add(s, s.target); };
  flood(15, -12, 0xdfe8ff, 520); flood(-16, 10, 0xffd6b0, 300); flood(16, 12, 0xc8d8ff, 260);
  const engine = new THREE.PointLight(0xff8a3c, 0, 140, 1.5); engine.position.y = -1.2; rocket.add(engine);

  /* particles */
  const smoke = new Particles(PHONE ? 800 : 2600, puffTex(), THREE.NormalBlending, 16);
  const fire = new Particles(PHONE ? 500 : 1600, glowTex(), THREE.AdditiveBlending);
  scene.add(smoke.mesh, fire.mesh);

  const st = { renderer, scene, camera, rocket, armPivot, beacon, flameO, flameI, engine, smoke, fire };
  st.size = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  return st;
}

/* camera choreography */
const polar = (deg, r, y) => { const a = THREE.MathUtils.degToRad(deg); return [Math.sin(a) * r, y, Math.cos(a) * r]; };
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
function shot(t, R) {
  const narrow = innerWidth < innerHeight; // portrait: pull back so the rocket fits
  // A: low dutch angle at the pad, rocket tears up through frame
  const ka = smooth(0, 1.1, t);
  const A = polar(lerp(150, 120, ka), lerp(narrow ? 16 : 12, narrow ? 21 : 16, ka), lerp(1.4, 4, ka));
  const Al = [0, 8 + R * 0.75, 0];
  // B: whip into a chase from below
  const B = [6, R * 0.8 - 5, 8], Bl = [0, R * 0.97 + 4, 0];
  // C: camera falls behind, tilting into open sky; rocket shrinks to a point
  const C = [16, R * 0.55 - 10, 20], Cl = [0, R + 6, 0];
  const k1 = smooth(0.65, 1.35, t), k2 = smooth(1.3, 2.0, t);
  return {
    pos: mix3(mix3(A, B, k1), C, k2), look: mix3(mix3(Al, Bl, k1), Cl, k2),
    fov: lerp(lerp(narrow ? 80 : 68, narrow ? 70 : 60, k1), narrow ? 62 : 52, k2),
    roll: lerp(lerp(0.3, -0.12, k1), 0, k2),
  };
}

let S = null, raf = 0, t0 = 0, last = 0, running = false, prevY = ROCK_Y;
const nozzle = new THREE.Vector3();

function simulate(t, dt, render) {
  const f60 = dt * 60;
  const R = lift(t);
  S.rocket.position.y = ROCK_Y + R;
  nozzle.set(0, S.rocket.position.y - 0.15, 0);
  const moved = Math.max(0, nozzle.y - prevY); prevY = nozzle.y; // emit along the path travelled this frame
  const ign = smooth(T_IGN, T_IGN + 0.3, t);
  const flick = 0.85 + 0.3 * Math.random();

  /* flame + light */
  const len = (2 + 7 * ign) * (1 + Math.min(1, R / 40) * 1.4) * (0.92 + 0.16 * Math.random());
  S.flameO.scale.set(1 + 0.08 * Math.random(), len, 1 + 0.08 * Math.random()); S.flameO.position.y = -len / 2;
  S.flameI.scale.set(1, len * 0.55, 1); S.flameI.position.y = -len * 0.275;
  S.flameO.material.uniforms.uI.value = ign * flick * 1.1; S.flameI.material.uniforms.uI.value = ign * flick * 1.6;
  S.flameO.material.uniforms.uT.value = S.flameI.material.uniforms.uT.value = t;
  S.engine.intensity = ign * 300 * flick;
  S.armPivot.rotation.y = -1.25;
  S.beacon.visible = Math.sin(t * 8) > 0;

  /* emit */
  const nf = Math.round((14 + moved * 6) * ign * f60);
  for (let i = 0; i < nf; i++) S.fire.add({ x: rnd(-0.3, 0.3), y: nozzle.y - rnd(0, 1.5 + moved), z: rnd(-0.3, 0.3), vx: rnd(-2, 2), vy: -rnd(28, 48), vz: rnd(-2, 2), age: 0, life: rnd(0.18, 0.4), size: rnd(1.0, 2.0) * (1 + Math.min(2, R / 80)), rot: rnd(0, 6.28), r: 1, g: 1, b: 1, alpha: 0 });
  if (R < 30) { // ground cloud blasting out of the pad
    const ns = Math.round((PHONE ? 8 : 22) * ign * f60 * (1 - R / 30));
    for (let i = 0; i < ns; i++) {
      const a = rnd(0, 6.283), sp = rnd(10, 34), up = Math.random() < 0.3;
      S.smoke.add({ x: Math.sin(a) * rnd(1.5, 3.5), y: rnd(1.6, 3.2), z: Math.cos(a) * rnd(1.5, 3.5), vx: Math.sin(a) * sp * (up ? 0.3 : 1), vy: up ? rnd(4, 11) : rnd(0.3, 3), vz: Math.cos(a) * sp * (up ? 0.3 : 1), age: 0, life: rnd(3.2, 5.5), size: rnd(4, 8), grow: rnd(3, 8), rot: rnd(0, 6.28), vr: rnd(-0.4, 0.4), sh: rnd(0.55, 1), a0: rnd(0.55, 0.85), drag: 1.1, r: 1, g: 1, b: 1, alpha: 0 });
    }
  }
  if (R > 2) { // contrail
    const nc = Math.round((5 + moved * 2.5) * f60);
    for (let i = 0; i < nc; i++) S.smoke.add({ x: rnd(-0.5, 0.5), y: nozzle.y - rnd(2, 5 + moved), z: rnd(-0.5, 0.5), vx: rnd(-1.5, 1.5), vy: rnd(-3, 0), vz: rnd(-1.5, 1.5), age: 0, life: rnd(2, 3), size: rnd(1.6, 3), grow: rnd(2, 4), rot: rnd(0, 6.28), vr: rnd(-0.4, 0.4), sh: rnd(0.7, 1), a0: rnd(0.5, 0.75), drag: 0.8, r: 1, g: 1, b: 1, alpha: 0 });
  }

  /* simulate */
  const eI = ign * flick;
  S.fire.update(dt, (p, d) => {
    p.x += p.vx * d; p.y += p.vy * d; p.z += p.vz * d;
    if (p.y < 1.8 && p.vy < 0) { const a = rnd(0, 6.283), s = -p.vy * 0.7; p.vx = Math.sin(a) * s; p.vz = Math.cos(a) * s; p.vy = rnd(0, 3); p.y = 1.8; }
    const u = p.age / p.life; p.size += d * 9;
    p.r = 1; p.g = lerp(0.9, 0.35, u); p.b = lerp(0.65, 0.08, u); p.alpha = (1 - u) * 0.55;
  });
  S.smoke.update(dt, (p, d) => {
    const dr = Math.exp(-p.drag * d); p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + 0.8 * d;
    p.x += p.vx * d; p.y += p.vy * d; p.z += p.vz * d; p.size += p.grow * d; p.rot += p.vr * d;
    p.y = Math.max(p.y, p.size * 0.32);
    const u = p.age / p.life;
    p.alpha = Math.min(1, p.age / 0.25) * Math.pow(1 - u, 1.4) * p.a0;
    const dx = p.x - nozzle.x, dy = p.y - nozzle.y, dz = p.z - nozzle.z;
    const warm = eI * Math.min(1.6, 70 / (dx * dx + dy * dy + dz * dz + 20));
    const base = 0.16 * p.sh;
    p.r = base + 0.05 + warm * 1.0; p.g = base + 0.06 + warm * 0.5; p.b = base + 0.09 + warm * 0.2;
  });
  if (!render) return;

  /* camera */
  const c = shot(t, R);
  const shake = 0.22 * (1 - smooth(0, 1.3, t));
  S.camera.position.set(c.pos[0] + rnd(-shake, shake), c.pos[1] + rnd(-shake, shake), c.pos[2] + rnd(-shake, shake));
  S.camera.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
  S.camera.lookAt(c.look[0], c.look[1], c.look[2]);
  S.camera.fov = c.fov; S.camera.updateProjectionMatrix();
  S.renderer.render(S.scene, S.camera);

  /* hand-off: fly through the overlay into the page's own sky */
  if (t > T_FADE) {
    let u = clamp01((t - T_FADE) / (T_END - T_FADE)); u = u * u * (3 - 2 * u);
    ov.style.opacity = String(1 - u);
    ov.style.transform = `scale(${1 + u * 0.35})`;
  }
}

function frame(now) {
  if (!t0) t0 = now;
  const t = (now - t0) / 1000, dt = Math.min(0.033, (now - (last || now)) / 1000); last = now;
  simulate(t, dt, true);
  if (t >= T_END) { stop(); return; }
  raf = requestAnimationFrame(frame);
}

function rerise() {
  document.querySelectorAll('.nv-rise').forEach((el) => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
}
function reveal(delay) { root.style.setProperty('--rd', delay); rerise(); }
function stop() {
  window.__nvDone = true;
  cancelAnimationFrame(raf); running = false; ov.style.display = 'none';
  ov.style.opacity = ''; ov.style.transform = '';
  // free the intro's GPU memory for the rest of the visit (it's one-shot)
  if (S) { S.renderer.dispose(); S.renderer.forceContextLoss(); S = null; }
}
function start() {
  if (RM) { stop(); reveal('0s'); return; }
  // phones: no intro; reveal once the rest of this module has run, so the 3D hero logo is in place and lands first
  if (PHONE) { window.__nvDone = true; ov.style.display = 'none'; requestAnimationFrame(() => reveal('0s')); return; }
  try {
    if (!S) { S = buildIntro(); onWidthResize(() => S && S.size()); }
  } catch (e) { stop(); reveal('0s'); return; }
  S.size(); S.smoke.clear(); S.fire.clear();
  // pre-roll the burn so frame one is already mid-liftoff with a full ground cloud
  prevY = ROCK_Y;
  for (let t = -PREWARM; t < 0; t += 1 / 60) simulate(t, 1 / 60, false);
  ov.style.display = ''; ov.style.opacity = '1'; ov.style.transform = '';
  root.style.setProperty('--rd', '999s'); rerise();
  setTimeout(() => { if (running) reveal('0s'); }, (T_FADE + 0.05) * 1000);
  t0 = 0; last = 0; running = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
}

window.nvIntro = start;
start();

/* =====================================================================
   Hero logo as a real extruded 3D mesh (the SVG stack stays as fallback)
   ===================================================================== */
function wordmarkShapes() {
  // parse the wordmark path (absolute M/L/H/V/A/Z only) into polygons; arcs are sampled
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.style.cssText = 'position:absolute;width:0;height:0'; document.body.appendChild(svg);
  const tok = NV_WM.match(/[MLHVAZ]|-?\d*\.?\d+/g);
  const polys = []; let cur = null, x = 0, y = 0, i = 0;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { x = num(); y = num(); cur = [[x, y]]; polys.push(cur); }
    else if (c === 'L') { x = num(); y = num(); cur.push([x, y]); }
    else if (c === 'H') { x = num(); cur.push([x, y]); }
    else if (c === 'V') { y = num(); cur.push([x, y]); }
    else if (c === 'A') {
      const a = [num(), num(), num(), num(), num(), num(), num()];
      const p = document.createElementNS(ns, 'path'); p.setAttribute('d', `M${x} ${y}A${a.join(' ')}`); svg.appendChild(p);
      const L = p.getTotalLength();
      for (let k = 1; k <= 10; k++) { const q = p.getPointAtLength((L * k) / 10); cur.push([q.x, q.y]); }
      x = a[5]; y = a[6];
    }
  }
  svg.remove();
  const inside = (pt, poly) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xi, yi] = poly[a], [xj, yj] = poly[b];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const toV = (poly) => poly.map(([px, py]) => new THREE.Vector2(px, -py));
  const shapes = [];
  polys.forEach((poly, k) => {
    if (polys.some((o, j) => j !== k && inside(poly[0], o))) return; // a hole, attached below
    const sh = new THREE.Shape(toV(poly));
    polys.forEach((h, j) => { if (j !== k && inside(h[0], poly)) sh.holes.push(new THREE.Path(toV(h))); });
    shapes.push(sh);
  });
  return shapes;
}

function startLogo3D() {
  if (RM) return;
  const bob = [...document.querySelectorAll('.lg-bob')].find((x) => !x.closest('x-dc'));
  if (!bob) { requestAnimationFrame(startLogo3D); return; }
  let renderer;
  try {
    const cv = document.createElement('canvas'); cv.className = 'lg-3d'; cv.setAttribute('aria-hidden', 'true');
    bob.appendChild(cv);
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(DPR, PHONE ? 1 : 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(20, 1, 10, 20000);

    const geo = new THREE.ExtrudeGeometry(wordmarkShapes(), { depth: 70, curveSegments: 6, bevelEnabled: true, bevelThickness: 7, bevelSize: 5, bevelSegments: 3 });
    geo.computeBoundingBox(); const bb = geo.boundingBox; const c = new THREE.Vector3(); bb.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
    const W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y;

    const neb = new THREE.TextureLoader().load('./assets/logo-nebula.jpg'); neb.colorSpace = THREE.SRGBColorSpace; neb.wrapS = neb.wrapT = THREE.MirroredRepeatWrapping;
    const capU = { map: { value: neb }, uT: { value: 0 }, uSize: { value: new THREE.Vector2(W, H) } };
    const caps = new THREE.ShaderMaterial({
      uniforms: capU, transparent: true,
      vertexShader: `uniform vec2 uSize; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = position.xy / uSize + .5; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalMatrix*normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        vec3 hue(vec3 c, float a){ const vec3 k = vec3(.57735); float ca = cos(a); return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.-ca); }
        void main(){
          vec2 uv = vUv*vec2(1., .33) + vec2(uT*.012, .33 + sin(uT*.07)*.04);
          vec3 a = texture2D(map, uv).rgb, b = texture2D(map, uv*1.7 + vec2(-uT*.02, uT*.008)).rgb;
          vec3 col = hue(1. - (1.-a)*(1.-b*.8), sin(uT*.15)*.35) * .95;
          float glare = smoothstep(.06, 0., abs(vUv.x - fract(uT*.08)*1.6 + .3 - vUv.y*.35));
          col += vec3(.75,.9,1.) * glare * .22;
          float fr = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.);
          col = col * 1.35 + fr*vec3(.3,.6,.8)*.35;
          gl_FragColor = vec4(pow(max(col, 0.), vec3(1./2.2)), .92); // shader skips three's output encode, so do it here
        }`,
    });
    const sides = new THREE.MeshStandardMaterial({ color: 0x8ea4c4, metalness: 0.7, roughness: 0.28, emissive: 0x0c1626 });
    const mesh = new THREE.Mesh(geo, [caps, sides]);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.85 }));
    const logo = new THREE.Group(); logo.add(mesh, edges); scene.add(logo);

    scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x0a0a14, 0.9));
    const key = new THREE.DirectionalLight(0xbfe9ff, 3.2); key.position.set(-600, 900, 1200); scene.add(key);
    const warm = new THREE.DirectionalLight(0xff9a5c, 1.4); warm.position.set(1200, -300, 400); scene.add(warm);
    const sweep = new THREE.PointLight(0x7fe8ff, 4, 0, 0); scene.add(sweep);

    const size = () => {
      const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      // fit the wordmark to ~84% of the canvas width
      const dist = (W / 0.84 / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.aspect;
      camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);
    };
    size(); onWidthResize(size);
    const mt = new THREE.Vector2(), ms = new THREE.Vector2();
    let fr = 0;
    addEventListener('pointermove', (e) => mt.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));
    const t0 = performance.now();
    bob.classList.add('lg-has3d');
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (bob.getBoundingClientRect().bottom < 0) return;
      if (PHONE && (fr++ & 1)) return; // 30fps is plenty for a slow sway
      const t = (now - t0) / 1000; ms.lerp(mt, 0.05);
      logo.rotation.y = Math.sin(t * 0.45) * 0.34 + ms.x * 0.35;
      logo.rotation.x = Math.sin(t * 0.31) * 0.1 + ms.y * 0.22;
      logo.rotation.z = Math.sin(t * 0.23) * 0.02;
      sweep.position.set(Math.sin(t * 0.6) * W * 0.7, Math.cos(t * 0.4) * H * 0.8, 500);
      capU.uT.value = t;
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
  } catch (e) { bob.classList.remove('lg-has3d'); }
}
startLogo3D();

/* =====================================================================
   About: shader glitch-in (tear bands, block corruption, RGB split,
   scanlines, dithered flicker) resolving into the real image
   ===================================================================== */
const GLITCH_FRAG = /* glsl */`
uniform sampler2D map; uniform float uT; uniform float uSeed; uniform vec2 uRes; uniform float uPad;
varying vec2 vUv;
float h1(float n){ return fract(sin(n * 91.345 + uSeed) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
vec4 tap(vec2 uv){ uv = (uv - vec2(uPad, 0.)) / vec2(1. - 2. * uPad, 1.);
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) return vec4(0.); return texture2D(map, uv); }
void main(){
  float k = 1. - smoothstep(.05, 1., uT);              // glitch amount, 1 -> 0
  float tq = floor(uT * 30.);                          // jumps at 30fps
  vec2 uv = vUv;
  float rows = mix(10., 46., h1(tq));
  float band = floor(uv.y * rows);
  float tear = step(1. - .6 * k, h1(band * 1.7 + tq * 3.1)) * (h1(band + tq * 7.) - .5) * .22 * k;
  uv.x += tear;
  vec2 blk = floor(uv * vec2(18., 34.));
  if (h2(blk + tq) > 1. - .16 * k) uv += (vec2(h2(blk + 1.3), h2(blk + 7.1)) - .5) * vec2(.1, .03) * k;
  float ca = (.014 + .01 * h1(tq * 2.3)) * k;
  vec4 cr = tap(uv + vec2(ca, 0.)), cg = tap(uv), cb = tap(uv - vec2(ca, ca * .3));
  float a = max(cg.a, max(cr.a, cb.a) * k);
  vec3 col = vec3(cr.r * cr.a, cg.g * cg.a, cb.b * cb.a);
  col *= mix(1., .82 + .18 * sin(vUv.y * uRes.y * 1.6), k);           // scanlines
  col += (h2(floor(vUv * uRes / 2.) + tq) - .5) * .35 * k * a;          // noise
  float appear = smoothstep(0., .3, uT);
  float dith = step(h2(floor(vUv * uRes / 3.) + tq * 1.3), appear * 1.2);
  float flick = step(.35 * k, h1(tq * 1.9 + 4.));
  a *= mix(1., dith * flick, k);
  gl_FragColor = vec4(col * mix(1., dith * flick, k), a);
}`;

function glitchIn(el, source, delay, dur, cssFilter) {
  return new Promise((resolve) => setTimeout(() => {
    const stage = el.closest('.ab-stage');
    const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const PAD = 0.14, w = r.width / (1 - 2 * PAD), h = r.height;
    const cv = document.createElement('canvas');
    cv.style.cssText = `position:absolute;left:${r.left - sr.left - r.width * PAD / (1 - 2 * PAD)}px;top:${r.top - sr.top}px;width:${w}px;height:${h}px;z-index:4;pointer-events:none;filter:${cssFilter || 'none'}`;
    stage.appendChild(cv);
    let rd;
    try {
      rd = new THREE.WebGLRenderer({ canvas: cv, alpha: true, premultipliedAlpha: false, antialias: false });
      rd.setPixelRatio(Math.min(DPR, PHONE ? 1 : 2)); rd.setSize(w, h, false);
    } catch (e) { cv.remove(); el.classList.add('ab-show'); resolve(); return; }
    // upload via a 2D canvas: some decoders (AVIF here) don't reach WebGL straight from an <img>
    const cc = document.createElement('canvas'); cc.width = source.naturalWidth || source.width; cc.height = source.naturalHeight || source.height;
    cc.getContext('2d').drawImage(source, 0, 0, cc.width, cc.height);
    const tex = new THREE.Texture(cc); tex.needsUpdate = true; // raw sRGB in, raw sRGB out (no conversion) keeps the orange orange
    const u = { map: { value: tex }, uT: { value: 0 }, uSeed: { value: Math.random() * 100 }, uRes: { value: new THREE.Vector2(w, h) }, uPad: { value: PAD } };
    const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: u, transparent: true,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: GLITCH_FRAG })));
    const t0 = performance.now();
    const loop = (now) => {
      const t = (now - t0) / 1000 / dur; u.uT.value = Math.min(1, t); rd.render(sc, cam);
      if (t < 1) { requestAnimationFrame(loop); return; }
      el.classList.add('ab-show');
      requestAnimationFrame(() => { cv.remove(); rd.dispose(); rd.forceContextLoss(); tex.dispose(); resolve(); });
    };
    requestAnimationFrame(loop);
  }, delay));
}

function startAboutGlitch() {
  const stage = [...document.querySelectorAll('.ab-stage')].find((x) => !x.closest('x-dc'));
  if (!stage) { requestAnimationFrame(startAboutGlitch); return; }
  const word = stage.querySelector('.ab-word'), cut = stage.querySelector('.ab-cut');
  // the runtime keeps a hidden template copy with the same gradient id; give the live one its own id so its animation runs
  const lg = word.querySelector('linearGradient');
  if (lg) { lg.id = 'abGradLive'; word.style.fill = 'url(#abGradLive)'; }
  cut.loading = 'eager'; // small AVIF; fetch now so he glitches in with the wordmark, not after
  if (RM) { word.classList.add('ab-show'); cut.classList.add('ab-show'); return; }
  let done = false;
  new IntersectionObserver((es, io) => es.forEach((e) => {
    if (done || !e.isIntersecting || e.intersectionRatio < 0.3) return;
    done = true; io.disconnect();
    const r = word.getBoundingClientRect();
    const svgImg = new Image();
    svgImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="510 480 1540 505" width="${Math.round(r.width * 2)}" height="${Math.round(r.height * 2)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B3CFF"/><stop offset=".52" stop-color="#9B4DFF"/><stop offset="1" stop-color="#D65BFF"/></linearGradient></defs><path fill="url(#g)" fill-rule="evenodd" d="${NV_WM}"/></svg>`);
    const ready = (img) => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; }));
    Promise.all([ready(svgImg), ready(cut)]).then(() => {
      glitchIn(word, svgImg, 0, 1.1);
      glitchIn(cut, cut, 0, 1.15, getComputedStyle(cut).filter);
    });
  }), { threshold: [0, 0.3] }).observe(stage);
}
startAboutGlitch();
