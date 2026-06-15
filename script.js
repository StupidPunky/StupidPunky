const N=24;
const POINTER_DEG=270;
const SLICE_DEG=360/N;

function defaultState(){
  const a=[];
  for(let i=1;i<=N;i++) a.push({id:i,enabled:true,weight:1});
  return a;
}

function loadState(){
  try{
    const raw=localStorage.getItem('wheel_state_v2');
    if(!raw) return defaultState();
    const p=JSON.parse(raw);
    if(!Array.isArray(p)||p.length!==N) return defaultState();
    return p;
  }catch(e){return defaultState();}
}

function saveState(){ try{localStorage.setItem('wheel_state_v2',JSON.stringify(items));}catch(e){} }

let items=loadState();
let isSpinning=false;

const canvas=document.getElementById('wheelCanvas');
const ctx=canvas.getContext('2d');
const pointerWrap=document.getElementById('pointer-wrap');

function setCanvasSize(){
  const rect=canvas.parentElement.getBoundingClientRect();
  const s=Math.min(rect.width,rect.height)||560;
  canvas.width=s;
  canvas.height=s;
}
setCanvasSize();
window.addEventListener('resize',()=>{setCanvasSize();drawWheel(currentRotation);});

function sliceColor(i){
  const hue=(i*360/N)%360;
  return `hsl(${hue},58%,68%)`;
}

function drawWheel(rotRad=0){
  const w=canvas.width, h=canvas.height;
  const cx=w/2, cy=h/2, r=Math.min(w,h)/2-4;
  ctx.clearRect(0,0,w,h);

  const sliceAngle=(2*Math.PI)/N;
  for(let i=0;i<N;i++){
    const it=items[i];
    const start=rotRad+i*sliceAngle;
    const end=start+sliceAngle;

    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,end);
    ctx.closePath();
    ctx.fillStyle=it.enabled?sliceColor(i):'#c8c8c8';
    ctx.fill();
    ctx.strokeStyle='#fff';
    ctx.lineWidth=1.5;
    ctx.stroke();

    const mid=start+sliceAngle/2;
    const tx=cx+Math.cos(mid)*(r-54);
    const ty=cy+Math.sin(mid)*(r-54);
    ctx.save();
    ctx.translate(tx,ty);
    const angleToCenter=Math.atan2(cy-ty,cx-tx);
    ctx.rotate(angleToCenter+3*Math.PI/2);
    ctx.fillStyle=it.enabled?'#1a2a35':'#777';
    ctx.font='bold 17px system-ui,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(it.id.toString(),0,0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx,cy,18,0,2*Math.PI);
  ctx.fillStyle='#fff';
  ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.10)';
  ctx.lineWidth=1;
  ctx.stroke();
}

drawWheel(0);

// pointer physics
let currentRotation=0;
let prevTime=null;
let rafId=null;
let pAngle=0;
let pVel=0;
const SPRING_K=180;
const DAMPING=18;
const DRIVE=2.2;
const TICK_IMPULSE=0.38;
const MAX_IMPULSE=8;
let prevSliceIdx=null;

function applyPointerPhysics(dtSec, wheelAngVel){
  const pointerWheelAngle=(((POINTER_DEG*Math.PI/180-currentRotation)%(2*Math.PI))+(2*Math.PI))%(2*Math.PI);
  const sliceIdx=Math.floor(pointerWheelAngle/(SLICE_DEG*Math.PI/180))%N;
  if(prevSliceIdx!==null && sliceIdx!==prevSliceIdx){
    const impulse=Math.sign(wheelAngVel)*Math.min(Math.abs(wheelAngVel)*TICK_IMPULSE,MAX_IMPULSE);
    pVel+=impulse;
  }
  prevSliceIdx=sliceIdx;
  const accel=-SPRING_K*pAngle - DAMPING*pVel + DRIVE*wheelAngVel;
  pVel+=accel*dtSec;
  pAngle+=pVel*dtSec;
  updatePointerTransform();
}

function updatePointerTransform(){
  const deg=pAngle*(180/Math.PI);
  pointerWrap.style.transform=`translateX(-50%) rotate(${deg}deg)`;
}

function settlePointer(){
  if(rafId) cancelAnimationFrame(rafId);
  let last=performance.now();
  function step(now){
    const dt=Math.min((now-last)/1000,0.05);
    last=now;
    const accel=-SPRING_K*pAngle - DAMPING*pVel;
    pVel+=accel*dt;
    pAngle+=pVel*dt;
    updatePointerTransform();
    if(Math.abs(pVel)>0.001||Math.abs(pAngle)>0.0005){
      rafId=requestAnimationFrame(step);
    } else {
      pVel=0; pAngle=0;
      pointerWrap.style.transform='translateX(-50%) rotate(0deg)';
      rafId=null;
    }
  }
  rafId=requestAnimationFrame(step);
}

function weightedPick(){
  const pool=items.filter(it=>it.enabled&&it.weight>0);
  if(!pool.length) return null;
  const total=pool.reduce((s,p)=>s+p.weight,0);
  let r=Math.random()*total;
  for(const p of pool){ r-=p.weight; if(r<=0) return p; }
  return pool[pool.length-1];
}

document.getElementById('spinBtn').addEventListener('click',spin);
canvas.addEventListener('dblclick',()=>{ renderSettings(); document.getElementById('settingsModal').classList.add('open'); });

function spin(){
  if(isSpinning) return;
  const pick=weightedPick();
  if(!pick){ alert('No enabled items. Enable some in settings.'); return; }

  const sliceRad=(2*Math.PI)/N;
  const targetIdx=items.findIndex(it=>it.id===pick.id);
  const targetStart=targetIdx*sliceRad;
  const offset=Math.random()*sliceRad;
  const winAngle=targetStart+offset;

  const pointerRad=POINTER_DEG*Math.PI/180;
  const spins=(5+Math.floor(Math.random()*3))*(2*Math.PI);
  const targetRotation=spins+(pointerRad-winAngle);

  const startRotation=currentRotation;
  const delta=targetRotation-startRotation;
  const duration=4000+Math.random()*600;
  const startTime=performance.now();
  prevTime=startTime;
  prevSliceIdx=null;

  isSpinning=true;
  document.getElementById('spinBtn').disabled=true;
  document.getElementById('result').textContent='';
  if(rafId) cancelAnimationFrame(rafId);

  function easeOut(t){ return 1-Math.pow(1-t,3.5); }

  function frame(now){
    const elapsed=now-startTime;
    const t=Math.min(1,elapsed/duration);
    const eased=easeOut(t);
    const newRot=startRotation+delta*eased;
    const dt=Math.min((now-prevTime)/1000,0.05);
    const wheelAngVel=(newRot-currentRotation)/Math.max(dt,1e-4);
    currentRotation=newRot;
    drawWheel(currentRotation);
    applyPointerPhysics(dt, wheelAngVel);
    prevTime=now;
    if(t<1){
      rafId=requestAnimationFrame(frame);
    } else {
      isSpinning=false;
      document.getElementById('spinBtn').disabled=false;
      document.getElementById('result').textContent=`Selected: ${pick.id}`;
      settlePointer();
      rafId=null;
    }
  }
  rafId=requestAnimationFrame(frame);
}

const modal=document.getElementById('settingsModal');
document.getElementById('settingsBtn').addEventListener('click',()=>{ renderSettings(); modal.classList.add('open'); });
document.getElementById('closeSettings').addEventListener('click',()=>{ modal.classList.remove('open'); });
document.getElementById('saveSettings').addEventListener('click',()=>{ saveState(); modal.classList.remove('open'); drawWheel(currentRotation); });
document.getElementById('enableAll').addEventListener('click',()=>{ items.forEach(it=>it.enabled=true); renderSettings(); drawWheel(currentRotation); });
document.getElementById('disableAll').addEventListener('click',()=>{ items.forEach(it=>it.enabled=false); renderSettings(); drawWheel(currentRotation); });
document.getElementById('resetWeights').addEventListener('click',()=>{ items.forEach(it=>it.weight=1); renderSettings(); drawWheel(currentRotation); });
modal.addEventListener('click',e=>{ if(e.target===modal) modal.classList.remove('open'); });

function renderSettings(){
  const list=document.getElementById('itemsList');
  list.innerHTML='';
  items.forEach(it=>{
    const row=document.createElement('div');
    row.className='item-row'+(it.enabled?'':' disabled');
    const cb=document.createElement('input');
    cb.type='checkbox'; cb.checked=it.enabled;
    cb.addEventListener('change',e=>{
      it.enabled=e.target.checked;
      row.classList.toggle('disabled',!it.enabled);
      drawWheel(currentRotation);
    });
    const lbl=document.createElement('label');
    lbl.textContent=it.id;
    const num=document.createElement('input');
    num.type='number'; num.min=1; num.step=1; num.value=it.weight;
    num.addEventListener('input',e=>{
      let v=Math.max(1,Math.floor(Number(e.target.value)||1));
      it.weight=v; e.target.value=v;
      drawWheel(currentRotation);
    });
    row.append(lbl,cb,num);
    list.appendChild(row);
  });
}

renderSettings();
window.addEventListener('beforeunload',saveState);