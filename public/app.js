// app.js - engineered version

const API_URL="/api/gateway.json";
const START_URL="/start";
const MAX_POLL=30;
const POLL_INTERVAL=5000;

const $=id=>document.getElementById(id);
const ui={
 statusIcon:$("statusIcon"),
 statusText:$("statusText"),
 actionButton:$("actionButton"),
 user:$("user"),
 password:$("password"),
 path:$("path"),
 countdown:$("countdown"),
 qrcode:$("qrcode"),
 timerLabel:document.querySelector(".timer span:first-child")
};

const state={
 gateway:null,
 timer:null,
 polling:false,
 pollTimer:null,
 attempts:0,
 expired:false,
 qrLink:null,
 qrPlaceholder:null
};

function statusMode(){
 if(state.gateway) return "ready";
 if(state.polling) return "waiting";
 return state.expired?"expired":"unavailable";
}

function updateUI(){
 const mode=statusMode();
 const d=state.gateway||{};
 const btn=ui.actionButton;

 const cfg={
  ready:["🟢","","Copy Config",copyConfig,false],
  waiting:["🟡",`Waiting... (${state.attempts}/${MAX_POLL})`,"Starting...",null,true],
  expired:["🔴","Expired","Connect",start,false],
  unavailable:["🔴","Unavailable","Connect",start,false]
 }[mode];

 ui.statusIcon.textContent=cfg[0];
 if(cfg[1]) ui.statusText.textContent=cfg[1];
 btn.textContent=cfg[2];
 btn.onclick=cfg[3];
 btn.disabled=cfg[4];

 ui.user.textContent=d.user||"-";
 ui.password.textContent=d.password||"-";
 ui.path.textContent=d.path||"-";

 const ready=mode==="ready";
 ui.timerLabel.textContent=ready?"Expires in:":"Status:";
 if(!ready){
   ui.countdown.textContent="--";
   ui.countdown.style.color="#94a3b8";
 }
 renderQR(ready?d.link:null);
}

function renderQR(link){
 if(state.qrLink===link) return;
 state.qrLink=link;
 const box=ui.qrcode;
 if(!link){
   if(state.qrPlaceholder){box.innerHTML=state.qrPlaceholder;return;}
   box.innerHTML="";
   new QRCode(box,{text:"unavailable",width:220,height:220});
   const el=box.querySelector("img,canvas");
   if(el){el.style.filter="blur(6px)";el.style.opacity=".7";}
   state.qrPlaceholder=box.innerHTML;
   return;
 }
 box.innerHTML="";
 new QRCode(box,{text:link,width:220,height:220});
}

async function loadGateway(){
 try{
  const r=await fetch(API_URL,{cache:"no-store"});
  if(!r.ok) throw 0;
  const d=await r.json();
  const exp=Number(d.expire_timestamp);
  if(!d.link||!Number.isFinite(exp)||exp*1000<=Date.now()) throw 0;
  state.gateway=d;
  state.expired=false;
  startTimer(exp);
  updateUI();
  return true;
 }catch{
  clearInterval(state.timer);
  state.timer=null;
  state.gateway=null;
  state.expired=false;
  updateUI();
  return false;
 }
}

function startTimer(exp){
 clearInterval(state.timer);
 const end=exp*1000;
 state.timer=setInterval(()=>{
   const remain=end-Date.now();
   if(remain<=0){
      clearInterval(state.timer);
      state.timer=null;
      state.gateway=null;
      state.expired=true;
      updateUI();
      ui.countdown.textContent="Expired";
      ui.countdown.style.color="#ef4444";
      ui.statusText.textContent="Expired";
      return;
   }
   const m=Math.floor(remain/60000),s=Math.floor(remain%60000/1000);
   const t=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
   ui.countdown.textContent=t;
   ui.statusText.textContent=t;
 },1000);
}

async function copyConfig(){
 if(!state.gateway) return;
 try{
  await navigator.clipboard.writeText(state.gateway.link);
  ui.statusText.textContent="✅ Copied!";
 }catch{
  ui.statusText.textContent="❌ Copy failed";
 }
 setTimeout(updateUI,2000);
}

async function start(){
 if(state.polling) return;
 state.gateway=null;
 state.expired=false;
 state.attempts=0;
 state.polling=true;
 updateUI();
 try{
   const r=await fetch(START_URL,{method:"POST"});
   if(!r.ok) throw 0;
   poll();
 }catch{
   state.polling=false;
   ui.statusText.textContent="❌ Start failed";
   setTimeout(updateUI,3000);
 }
}

async function poll(){
 state.attempts++;
 updateUI();
 if(state.attempts>MAX_POLL){
   state.polling=false;
   ui.statusText.textContent="❌ Timeout";
   setTimeout(updateUI,3000);
   return;
 }
 if(await loadGateway()){
   state.polling=false;
   updateUI();
   return;
 }
 state.pollTimer=setTimeout(poll,POLL_INTERVAL);
}

loadGateway();