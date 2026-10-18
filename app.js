const $ = (id) => document.getElementById(id);
const canvas = $('result');
const ctx = canvas.getContext('2d');
const boxes = [ [60,160], [620,160], [60,800], [620,800] ].map(([x,y]) => ({x,y,w:520,h:610}));
const photos = Array(4).fill(null);
let selected = 0, mode = 'together', frame = 'basic', character = 0, config, stream, facing = 'user', busy = false, cameraVersion = 0, captureVersion = 0;
const assets = new Map();
const status = (message) => { $('status').textContent = message; };
function imageFrom(url) { return new Promise((resolve,reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('이미지를 불러오지 못했어요.')); image.src = url; }); }
function cover(image,w,h) { return Math.max(w/image.naturalWidth,h/image.naturalHeight); }
function drawPhoto(photo,b) {
  const s = cover(photo.image,b.w,b.h)*photo.zoom;
  const iw=photo.image.naturalWidth*s, ih=photo.image.naturalHeight*s;
  photo.x=Math.max(-(iw-b.w)/2,Math.min((iw-b.w)/2,photo.x));
  photo.y=Math.max(-(ih-b.h)/2,Math.min((ih-b.h)/2,photo.y));
  ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
  ctx.translate(b.x+b.w/2+photo.x,b.y+b.h/2+photo.y);ctx.scale(photo.mirror?-1:1,1);ctx.drawImage(photo.image,-iw/2,-ih/2,iw,ih);ctx.restore();
}
function draw() {
  ctx.fillStyle=frame==='halloween'?'#392342':'#f6eee3';ctx.fillRect(0,0,1200,1560);
  ctx.textAlign='center';ctx.fillStyle=frame==='halloween'?'#f7bf83':'#3e2e44';ctx.font='bold 32px sans-serif';ctx.fillText(frame==='halloween'?'HALLOWEEN NIGHT':'HONGOK FILM',600,84);
  boxes.forEach((b,i) => {
    ctx.fillStyle=frame==='halloween'?'#e5d4c7':'#ddd6df';ctx.fillRect(b.x,b.y,b.w,b.h);
    if(photos[i]) drawPhoto(photos[i],b);
    else {ctx.fillStyle='#84758b';ctx.font='26px sans-serif';ctx.fillText(`＋ ${i+1}번째 사진`,b.x+b.w/2,b.y+b.h/2);}
    if(mode==='together') {
      const pose = assets.get(config?.characters[character].poses[i]);
      if(pose) {ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();ctx.drawImage(pose,b.x,b.y,b.w,b.h);ctx.restore();}
      else {
        ctx.save();ctx.beginPath();ctx.rect(b.x+b.w*.57,b.y,b.w*.43,b.h);ctx.clip();
        ctx.fillStyle='#bea9ca99';ctx.fillRect(b.x+b.w*.57,b.y,b.w*.43,b.h);
        ctx.fillStyle='#745b8655';ctx.beginPath();ctx.arc(b.x+b.w*.81,b.y+215,68,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(b.x+b.w*.81,b.y+480,125,180,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#55415e';ctx.font='bold 24px sans-serif';ctx.fillText(config?.characters[character].name??'',b.x+b.w*.79,b.y+b.h-70);ctx.font='16px sans-serif';ctx.fillText('캐릭터 준비 중',b.x+b.w*.79,b.y+b.h-38);ctx.restore();
      }
    }
    if(frame==='halloween') {ctx.fillStyle='#633b6c';ctx.font='26px sans-serif';ctx.fillText(['✦','☾','☾','✦'][i],b.x+b.w-24,b.y+35);}
  });
  const overlay=assets.get(config?.overlays[frame==='basic'?'together':frame]);if(overlay)ctx.drawImage(overlay,0,0,1200,1560);
  ctx.fillStyle=frame==='halloween'?'#f4d5b3':'#68576d';ctx.font='24px sans-serif';
  ctx.fillText($('caption').value.trim() || '네 장에 담는, 우리만의 이야기.',600,1470,1080);
  ctx.font='16px sans-serif';ctx.fillText('HONGOK FILM  ·  '+new Date().toLocaleDateString('ko-KR'),600,1515);
  const count=photos.filter(Boolean).length;$('progress').textContent=`${count} / 4`;$('download').disabled=count!==4||busy;$('share').disabled=count!==4||busy;
}
function select(index) {selected=index;document.querySelectorAll('.slot').forEach((el,i)=>{el.classList.toggle('active',i===index);el.setAttribute('aria-pressed',String(i===index));});$('selected-label').textContent=`${index+1}번째 사진`;$('zoom').disabled=!photos[index];$('zoom').value=photos[index]?.zoom??1;$('zoom-value').textContent=Math.round(Number($('zoom').value)*100)+'%';$('mirror').checked=photos[index]?.mirror??false;$('mirror').disabled=!photos[index];$('remove').disabled=!photos[index];updateCameraLabel();}
boxes.forEach((b,i)=>{
  const el=document.createElement('button');el.className='slot';el.style.cssText=`left:${b.x/12}%;top:${b.y/15.6}%;width:${b.w/12}%;height:${b.h/15.6}%`;el.setAttribute('aria-label',`${i+1}번째 사진 선택 및 위치 조정`);el.textContent=`${i+1}번째 사진`;el.onclick=()=>select(i);$('slots').append(el);
  let drag;
  el.onpointerdown=(e)=>{select(i);if(!photos[i])return;el.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:photos[i].x,py:photos[i].y};};
  el.onpointermove=(e)=>{if(!drag||drag.id!==e.pointerId||!photos[i])return;const scale=1200/canvas.getBoundingClientRect().width;photos[i].x=drag.px+(e.clientX-drag.x)*scale;photos[i].y=drag.py+(e.clientY-drag.y)*scale;draw();};
  el.onpointerup=el.onpointercancel=()=>{drag=null;};
  el.onkeydown=(e)=>{if(!photos[i]||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();photos[i].x+=e.key==='ArrowLeft'?-15:e.key==='ArrowRight'?15:0;photos[i].y+=e.key==='ArrowUp'?-15:e.key==='ArrowDown'?15:0;draw();};
});
function setPhoto(image,index){photos[index]={image,x:0,y:0,zoom:1,mirror:false};}
$('upload').onchange=async(e)=>{
  const files=[...e.target.files];if(!files.length)return;
  const targets=[selected,...[0,1,2,3].filter(i=>i!==selected&&!photos[i])];
  busy=true;draw();let loaded=0,failed=0;
  for(let j=0;j<Math.min(files.length,targets.length);j++){
    const url=URL.createObjectURL(files[j]);
    try{const image=await imageFrom(url);setPhoto(image,targets[j]);loaded++;}catch{failed++;}finally{URL.revokeObjectURL(url);}
  }
  busy=false;select(selected);draw();e.target.value='';
  status(`${loaded}장의 사진을 추가했어요.${failed?' 읽을 수 없는 사진은 JPG·PNG·WebP로 변환해 다시 올려주세요.':''}${files.length>targets.length?' 빈 칸보다 많은 사진은 제외했어요.':''}`);
};
$('zoom').oninput=()=>{if(photos[selected])photos[selected].zoom=Number($('zoom').value);$('zoom-value').textContent=Math.round(Number($('zoom').value)*100)+'%';draw();};
$('mirror').onchange=()=>{if(photos[selected])photos[selected].mirror=$('mirror').checked;draw();};
$('center').onclick=()=>{if(photos[selected])Object.assign(photos[selected],{x:0,y:0,zoom:1,mirror:false});select(selected);draw();};
$('remove').onclick=()=>{photos[selected]=null;select(selected);draw();status('선택한 사진을 지웠어요.');};
$('reset').onclick=()=>{if(photos.some(Boolean)&&!window.confirm('추가한 사진과 문구를 모두 지울까요?'))return;photos.fill(null);$('caption').value='';select(0);draw();status('새로운 추억을 시작해요.');};
$('caption').oninput=draw;
document.querySelectorAll('.mode').forEach(el=>el.onclick=()=>{mode=el.dataset.mode;document.querySelectorAll('.mode').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el));});$('character-section').hidden=mode!=='together';$('camera-guide').hidden=mode!=='together';draw();updateCameraLabel();});
document.querySelectorAll('.frame').forEach(el=>el.onclick=()=>{frame=el.dataset.frame;document.querySelectorAll('.frame').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el));});draw();updateCameraLabel();});
function exportFormat(){const jpg=$('format').value==='jpg';return {extension:jpg?'jpg':'png',type:jpg?'image/jpeg':'image/png'};}
const blob=(type)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('이미지를 만들지 못했어요.')),type,0.95));
$('download').onclick=async()=>{try{const format=exportFormat();const image=await blob(format.type);const url=URL.createObjectURL(image);const a=document.createElement('a');a.href=url;a.download=`plot-${frame}-${mode}-${Date.now()}.${format.extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status(`${format.extension.toUpperCase()} 이미지 저장을 요청했어요. 모바일에서 저장이 어렵다면 이미지 공유를 이용해주세요.`);}catch{status('이미지 저장에 실패했어요. 다시 시도해주세요.');}};
function updateShare(){const format=exportFormat();$('share').hidden=!(navigator.canShare&&navigator.canShare({files:[new File([''],`photo.${format.extension}`,{type:format.type})]}));}
$('format').onchange=updateShare;updateShare();
$('share').onclick=async()=>{try{const format=exportFormat();const image=await blob(format.type);await navigator.share({files:[new File([image],`plot-photo.${format.extension}`,{type:format.type})]});}catch(e){if(e.name!=='AbortError')status('공유에 실패했어요. 이미지 저장을 이용해주세요.');}};
function updateCameraLabel(){$('camera-label').textContent=`${selected+1}번째 사진 촬영 · ${mode==='together'?(config?.characters[character].name??'')+'와 함께':'혼자 찍기'}`;}
function stopStream(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;}
function closeCamera(){cameraVersion++;captureVersion++;stopStream();$('capture').disabled=true;$('countdown').textContent='';}
async function startCamera(){
  const version=++cameraVersion;stopStream();$('capture').disabled=true;$('camera-status').textContent='카메라를 연결하고 있어요…';
  if(!navigator.mediaDevices?.getUserMedia){$('camera-status').textContent='카메라는 HTTPS 또는 localhost에서 지원되는 브라우저가 필요해요. 사진 업로드도 사용할 수 있어요.';return;}
  try{
    const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:1440}},audio:false});
    if(version!==cameraVersion||!$('camera-dialog').open){next.getTracks().forEach(t=>t.stop());return;}
    stream=next;$('video').srcObject=stream;await $('video').play();if(version!==cameraVersion)return;
    $('capture').disabled=false;$('camera-status').textContent='준비됐어요. 촬영 버튼을 눌러주세요.';
  }catch(e){if(version!==cameraVersion)return;stopStream();$('camera-status').textContent=e.name==='NotAllowedError'?'카메라 권한이 필요해요. 브라우저 설정에서 허용하거나 사진을 업로드해주세요.':'카메라를 사용할 수 없어요. 다른 앱이 사용 중인지 확인하거나 사진을 업로드해주세요.';}
}
$('open-camera').onclick=()=>{updateCameraLabel();$('camera-guide').hidden=mode!=='together';$('camera-dialog').showModal();startCamera();};
$('close-camera').onclick=()=>$('camera-dialog').close();$('camera-dialog').addEventListener('close',closeCamera);$('camera-dialog').addEventListener('cancel',closeCamera);
$('switch-camera').onclick=()=>{captureVersion++;$('countdown').textContent='';facing=facing==='user'?'environment':'user';startCamera();};
$('camera-mirror').onchange=()=>{$('video').style.transform=$('camera-mirror').checked?'scaleX(-1)':'none';};$('camera-mirror').onchange();
$('capture').onclick=async()=>{
  if(!stream)return;const version=++captureVersion;const target=selected;$('capture').disabled=true;$('switch-camera').disabled=true;
  try{
    for(let n=Number($('timer').value);n>0;n--){if(version!==captureVersion)return;$('countdown').textContent=n;await new Promise(resolve=>setTimeout(resolve,1000));}
    if(version!==captureVersion||!stream)return;$('countdown').textContent='';
    const video=$('video');if(!video.videoWidth)throw new Error('not ready');
    const shot=document.createElement('canvas');shot.width=1040;shot.height=1220;const c=shot.getContext('2d');
    const scale=Math.max(shot.width/video.videoWidth,shot.height/video.videoHeight);const w=video.videoWidth*scale,h=video.videoHeight*scale;
    if($('camera-mirror').checked){c.translate(shot.width,0);c.scale(-1,1);}c.drawImage(video,(shot.width-w)/2,(shot.height-h)/2,w,h);
    const image=await imageFrom(shot.toDataURL('image/png'));if(version!==captureVersion)return;setPhoto(image,target);
    const next=photos.findIndex((p,i)=>i>target&&!p);select(next>=0?next:photos.findIndex(p=>!p)>=0?photos.findIndex(p=>!p):target);draw();
    if(photos.every(Boolean)){$('camera-dialog').close();status('네 컷이 모두 준비됐어요! 사진을 조정하고 저장해주세요.');}
    else $('camera-status').textContent='촬영했어요! 다음 사진도 찍어주세요.';
  }catch{$('camera-status').textContent='촬영하지 못했어요. 카메라가 준비되면 다시 시도해주세요.';}
  finally{$('switch-camera').disabled=false;if(stream)$('capture').disabled=false;}
};
window.addEventListener('pagehide',closeCamera);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&$('camera-dialog').open)$('camera-dialog').close();});
async function init(){
  try{
    const response=await fetch('./assets/frames.json');if(!response.ok)throw new Error('config');config=await response.json();
    const paths=[...config.characters.flatMap(c=>c.poses),...Object.values(config.overlays)].filter(Boolean);
    await Promise.all([...new Set(paths)].map(async path=>{try{assets.set(path,await imageFrom(new URL(path,document.baseURI).href));}catch{status('일부 프레임을 불러오지 못해 임시 디자인을 표시해요.');}}));
    config.characters.forEach((c,i)=>{const button=document.createElement('button');button.textContent=c.name;button.classList.toggle('active',i===character);button.setAttribute('aria-pressed',String(i===character));button.onclick=()=>{character=i;[...$('characters').children].forEach((b,j)=>{b.classList.toggle('active',j===i);b.setAttribute('aria-pressed',String(j===i));});draw();updateCameraLabel();};$('characters').append(button);});
  }catch{status('캐릭터 설정을 불러오지 못했어요. 페이지를 새로고침해주세요.');}
  select(0);draw();
}
init();
