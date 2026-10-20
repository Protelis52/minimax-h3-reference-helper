const $=s=>document.querySelector(s);
const drop=$("#drop"),file=$("#file"),video=$("#video"),canvas=$("#canvas"),ctx=canvas.getContext("2d",{alpha:false});
const workspace=$("#workspace"),first=$("#first"),last=$("#last"),samplesEl=$("#samples"),status=$("#status"),output=$("#output");
let objectUrl,firstPng,lastPng,firstApi,lastApi,samples=[],meta;

const once=(el,ev)=>new Promise((ok,bad)=>{const a=()=>{c();ok()},b=()=>{c();bad(new Error("Video decode failed."))},c=()=>{el.removeEventListener(ev,a);el.removeEventListener("error",b)};el.addEventListener(ev,a,{once:true});el.addEventListener("error",b,{once:true})});
async function seek(t){const x=Math.max(0,Math.min(t,Math.max(0,video.duration-.001)));if(Math.abs(video.currentTime-x)<.003)return;video.currentTime=x;await once(video,"seeked")}
function shot(type="image/jpeg",q=.85){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0,canvas.width,canvas.height);return canvas.toDataURL(type,q)}
function nearestH3(s){const k=Math.max(0,Math.round((s*24-5)/17)),frames=17*k+5;return{frames,seconds:frames/24}}
function toBlob(data){const [h,b]=data.split(","),mime=h.match(/:(.*?);/)[1],raw=atob(b),arr=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return new Blob([arr],{type:mime})}
function download(data,name){const u=URL.createObjectURL(toBlob(data)),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}

async function load(f){
  try{
    $("#generate").disabled=true;output.value="";status.textContent="";
    if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(f);video.src=objectUrl;video.load();await once(video,"loadedmetadata");
    meta={duration:video.duration,width:video.videoWidth,height:video.videoHeight,recommendedH3:nearestH3(video.duration)};
    $("#duration").textContent=`${meta.duration.toFixed(2)} s`;$("#resolution").textContent=`${meta.width} × ${meta.height}`;$("#h3").textContent=`${meta.recommendedH3.seconds.toFixed(3)} s · ${meta.recommendedH3.frames} frames`;

    await seek(0);firstPng=shot("image/png");firstApi=shot("image/jpeg",.9);first.src=firstPng;
    await seek(Math.max(0,meta.duration-.04));lastPng=shot("image/png");lastApi=shot("image/jpeg",.9);last.src=lastPng;

    samples=[];samplesEl.innerHTML="";
    for(let i=1;i<=8;i++){
      const t=meta.duration*i/9;await seek(t);const dataUrl=shot("image/jpeg",.72);samples.push({time:t,dataUrl});
      const el=document.createElement("div");el.className="sample";el.innerHTML=`<img alt="Timeline sample"><span>${t.toFixed(2)}s</span>`;el.querySelector("img").src=dataUrl;samplesEl.appendChild(el);
    }
    $("#sampleCount").textContent=`${samples.length} samples`;workspace.classList.remove("hidden");$("#generate").disabled=false;await seek(0);
  }catch(e){status.textContent=e.message}
}

drop.onclick=()=>file.click();
drop.onkeydown=e=>{if(e.key==="Enter"||e.key===" ")file.click()};
drop.ondragover=e=>{e.preventDefault();drop.classList.add("drag")};
drop.ondragleave=()=>drop.classList.remove("drag");
drop.ondrop=e=>{e.preventDefault();drop.classList.remove("drag");if(e.dataTransfer.files[0])load(e.dataTransfer.files[0])};
file.onchange=()=>file.files[0]&&load(file.files[0]);
$("#dlFirst").onclick=()=>firstPng&&download(firstPng,"first-frame.png");
$("#dlLast").onclick=()=>lastPng&&download(lastPng,"last-frame.png");

$("#generate").onclick=async()=>{
  $("#generate").disabled=true;$("#copy").disabled=true;status.textContent="Generating with GPT‑5.6 Sol…";output.value="";
  try{
    const r=await fetch("/api/generate-prompt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...meta,firstFrame:firstApi,lastFrame:lastApi,samples,notes:$("#notes").value})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"Generation failed.");
    output.value=data.prompt||"";$("#copy").disabled=!output.value;status.textContent="Prompt generated.";
  }catch(e){status.textContent=e.message}finally{$("#generate").disabled=false}
};
$("#copy").onclick=async()=>{await navigator.clipboard.writeText(output.value);const b=$("#copy"),old=b.textContent;b.textContent="Copied";setTimeout(()=>b.textContent=old,1000)};