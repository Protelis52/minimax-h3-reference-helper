const $=s=>document.querySelector(s);
const drop=$("#drop"),file=$("#file"),video=$("#video"),canvas=$("#canvas"),ctx=canvas.getContext("2d",{alpha:false});
const workspace=$("#workspace"),first=$("#first"),last=$("#last"),samplesEl=$("#samples"),status=$("#status"),output=$("#output");
let objectUrl,firstPng,lastPng,meta,samples=[];

const once=(el,ev)=>new Promise((ok,bad)=>{
  const a=()=>{c();ok()}, b=()=>{c();bad(new Error("Video decode failed."))},
  c=()=>{el.removeEventListener(ev,a);el.removeEventListener("error",b)};
  el.addEventListener(ev,a,{once:true}); el.addEventListener("error",b,{once:true});
});

async function waitForReady(){
  if(video.readyState >= 2) return;
  await once(video,"loadeddata");
}

async function seek(t){
  const x=Math.max(0,Math.min(t,Math.max(0,video.duration-.001)));
  if(Math.abs(video.currentTime-x)>=.003){
    const done=once(video,"seeked");
    video.currentTime=x;
    await Promise.race([
      done,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error("Video seek timed out.")),5000))
    ]);
  }
  await new Promise(resolve=>setTimeout(resolve,80));
}

function shot(type="image/png",q=.9){
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  return canvas.toDataURL(type,q);
}

function nearestH3(s){
  const k=Math.max(0,Math.round((s*24-5)/17)), frames=17*k+5;
  return {frames,seconds:frames/24};
}

function toBlob(data){
  const parts=data.split(","), h=parts[0], b=parts[1], mime=h.match(/:(.*?);/)[1],
  raw=atob(b), arr=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
  return new Blob([arr],{type:mime});
}

function download(data,name){
  const u=URL.createObjectURL(toBlob(data)), a=document.createElement("a");
  a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),1000);
}

async function load(f){
  try{
    $("#build").disabled=true; output.value=""; status.textContent="";
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    objectUrl=URL.createObjectURL(f); video.src=objectUrl; video.load();
    await once(video,"loadedmetadata");
    workspace.classList.remove("hidden");
    status.textContent="Loading video frames…";
    await waitForReady();

    meta={
      duration:video.duration,
      width:video.videoWidth,
      height:video.videoHeight,
      recommendedH3:nearestH3(video.duration)
    };

    $("#duration").textContent=meta.duration.toFixed(2)+" s";
    $("#resolution").textContent=meta.width+" × "+meta.height;
    $("#h3").textContent=meta.recommendedH3.seconds.toFixed(3)+" s · "+meta.recommendedH3.frames+" frames";

    await seek(Math.min(0.08, Math.max(0.01, meta.duration * 0.01))); firstPng=shot(); first.src=firstPng;
    await seek(Math.max(0,meta.duration-.04)); lastPng=shot(); last.src=lastPng;

    samples=[]; samplesEl.innerHTML="";
    for(let i=1;i<=8;i++){
      const t=meta.duration*i/9; await seek(t); const dataUrl=shot("image/jpeg",.72); samples.push(t);
      const el=document.createElement("div"); el.className="sample";
      el.innerHTML='<img alt="Timeline sample"><span>'+t.toFixed(2)+'s</span>';
      el.querySelector("img").src=dataUrl; samplesEl.appendChild(el);
    }

    $("#sampleCount").textContent=samples.length+" samples";
    $("#build").disabled=false;
    status.textContent="";
    await seek(Math.min(0.08, Math.max(0.01, meta.duration * 0.01)));
  }catch(e){ status.textContent=e.message; }
}

drop.onclick=()=>file.click();
drop.onkeydown=e=>{if(e.key==="Enter"||e.key===" ")file.click()};
drop.ondragover=e=>{e.preventDefault();drop.classList.add("drag")};
drop.ondragleave=()=>drop.classList.remove("drag");
drop.ondrop=e=>{e.preventDefault();drop.classList.remove("drag");if(e.dataTransfer.files[0])load(e.dataTransfer.files[0])};
file.onchange=()=>file.files[0]&&load(file.files[0]);

$("#dlFirst").onclick=()=>firstPng&&download(firstPng,"first-frame.png");
$("#dlLast").onclick=()=>lastPng&&download(lastPng,"last-frame.png");

$("#build").onclick=()=>{
  const notes=$("#notes").value.trim();
  let text="Using what you know about my MiniMax H3 workflow, write a concise MiniMax H3 prompt in the same style we previously used.\n\n";
  text+="I am attaching:\n";
  text+="- Picture 1 = the first frame extracted from my reference video\n";
  text+="- Picture 2 = the last frame extracted from my reference video\n";
  text+="- Video 1 = the original reference video\n";
  text+="- Audio 1 = the audio from that same reference video\n\n";
  text+="Reference video duration: "+meta.duration.toFixed(2)+" seconds\n";
  text+="Reference resolution: "+meta.width+" x "+meta.height+"\n";
  text+="Closest valid H3 length: "+meta.recommendedH3.seconds.toFixed(3)+" seconds / "+meta.recommendedH3.frames+" frames at 24 fps\n\n";
  text+="Use this structure:\nsubject_definitions:\nsummary:\nretention_analysis:\ndetailed_description:\n\n";
  text+="Requirements:\n";
  text+="- <Subject 1> is defined by <Picture 1> and <Picture 2>\n";
  text+="- <Picture 1> defines the opening pose, framing, expression, and scene\n";
  text+="- <Picture 2> defines the final pose, framing, expression, and scene\n";
  text+="- <Video 1> defines the exact performance order, motion, timing, facial expressions, gaze, head/body movement, hand/arm gestures, camera behavior, and pacing\n";
  text+="- <Audio 1>: fully_copy — use it 1:1 as the complete synchronized soundtrack\n";
  text+="- Match <Video 1> chronologically as closely as possible\n";
  text+="- Do not invent, delay, or repeat gestures\n";
  text+="- Keep the prompt concise and practical for MiniMax H3\n";
  text+="- No morphing, extra fingers/limbs, sudden clothing changes, scene changes, or invented actions\n";
  if(notes) text+="\nAdditional instructions:\n"+notes+"\n";
  text+="\nAnalyze the attached video and images and output only the finished MiniMax H3 prompt.";
  output.value=text;
  $("#copy").disabled=false;
  status.textContent="Request package ready. Download both frames, then attach them with the reference video in ChatGPT.";
};

$("#copy").onclick=async()=>{
  await navigator.clipboard.writeText(output.value);
  const b=$("#copy"),old=b.textContent; b.textContent="Copied";
  setTimeout(()=>b.textContent=old,1000);
};