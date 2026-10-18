const $ = (id) => document.getElementById(id);
const canvas = $('result');
const ctx = canvas.getContext('2d');
const boxes = [ [60,160], [620,160], [60,800], [620,800] ].map(([x,y]) => ({x,y,w:520,h:610}));
const photos = Array(4).fill(null);
const customPoses = Array(4).fill(null);
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
function editable(){return $('edit-layer').value==='character'&&character==='custom'&&mode==='together'?customPoses[selected]:photos[selected];}
function drawCustomPose(pose,b,c=ctx){
  const scale=Math.min(b.w*.48/pose.image.naturalWidth,b.h*.93/pose.image.naturalHeight)*pose.zoom;
  const w=pose.image.naturalWidth*scale,h=pose.image.naturalHeight*scale;
  c.save();c.beginPath();c.rect(b.x,b.y,b.w,b.h);c.clip();
  c.translate(b.x+b.w*.76+pose.x,b.y+b.h-h/2+pose.y);c.scale(pose.mirror?-1:1,1);
  c.drawImage(pose.image,-w/2,-h/2,w,h);c.restore();
}
function updateCharacterUI(){
  const custom=character==='custom';
  $('custom-character').setAttribute('aria-pressed',String(custom));
  $('custom-panel').hidden=!custom;
  $('edit-layer-label').hidden=!custom||mode!=='together';
  if(!custom||mode!=='together')$('edit-layer').value='photo';
  [...$('characters').children].forEach((b,j)=>{b.classList.toggle('active',j===character);b.setAttribute('aria-pressed',String(j===character));});
  $('custom-progress').textContent=`캐릭터 ${customPoses.filter(Boolean).length} / 4칸 · 선택한 칸 ${selected+1}`;
  $('repeat-character').disabled=!customPoses[selected];
}
// Keep original artwork untouched. Isolate the existing bright corner ornaments
// from the earlier decorated source once, excluding its regenerated title/background.
let pinkOrnaments;
function drawPinkDecorations(){
  const source=assets.get(config?.decoration_sources?.pink);
  if(source&&!pinkOrnaments){
    pinkOrnaments=document.createElement('canvas');
    pinkOrnaments.width=source.naturalWidth;pinkOrnaments.height=source.naturalHeight;
    const c=pinkOrnaments.getContext('2d');c.drawImage(source,0,0);
    const pixels=c.getImageData(0,0,pinkOrnaments.width,pinkOrnaments.height);
    for(let y=0;y<pinkOrnaments.height;y++)for(let x=0;x<pinkOrnaments.width;x++){
      const i=(y*pinkOrnaments.width+x)*4;
      const nx=x/pinkOrnaments.width,ny=y/pinkOrnaments.height;
      const corner=(ny<0.135&&(nx<0.17||nx>0.86))||(ny>0.875&&(nx<0.20||nx>0.80));
      const bright=pixels.data[i]>195&&pixels.data[i+1]>70&&pixels.data[i+2]>125;
      if(!corner||!bright)pixels.data[i+3]=0;
    }
    c.putImageData(pixels,0,0);
  }
  // Muted wallpaper is a separate layer, below photos and outside the title band.
  ctx.save();ctx.beginPath();ctx.rect(0,160,1200,1250);ctx.clip();
  ctx.fillStyle='#b76b91';ctx.globalAlpha=0.14;
  const bat=new Path2D('M-100 12 Q-85-35-110-55 Q-48-54-15-8 L-7-26 0-16 7-26 15-8 Q48-54 110-55 Q85-35 100 12 Q65-4 47 25 Q20 9 0 50 Q-20 9-47 25 Q-65-4-100 12Z');
  for(const [x,y,scale,angle] of [[80,285,1.5,-.3],[1090,430,1.5,.25],[535,720,1.4,-.2],[55,1010,1.4,.1],[1110,1180,1.5,-.2]]){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.fill(bat);ctx.restore();
  }
  const cross=new Path2D('M-12-90 L0-106 12-90 12-28 48-28 64-12 48 4 12 4 12 100 0 117-12 100-12 4-48 4-64-12-48-28-12-28Z');
  for(const [x,y,angle] of [[470,360,0],[1070,740,.25],[710,1040,.2],[190,1260,-.2]]){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fill(cross);ctx.restore();
  }
  ctx.restore();
  if(pinkOrnaments)ctx.drawImage(pinkOrnaments,0,0,1200,1560);
}
function draw() {
  ctx.fillStyle=frame==='halloween'?'#392342':'#f6eee3';ctx.fillRect(0,0,1200,1560);
  const theme=document.documentElement.dataset.theme||'lime';
  const backgroundPath=frame==='halloween'?config?.backgrounds?.halloween?.[theme]:config?.backgrounds?.[frame];
  const background=assets.get(backgroundPath);if(background){
    ctx.drawImage(background,0,0,1200,1560);
    const assetName=backgroundPath?.split('?')[0];
    const adjusted=['assets/background-01.png','assets/background-02.png'].includes(assetName);
    if(frame==='halloween'&&adjusted){
      // Map the entire decorative edge strip into each 60px gutter, with 4px inset.
      // Source art is wider than the gutter; scaling keeps complete objects visible.
      const iw=background.naturalWidth,ih=background.naturalHeight;
      if(assetName==='assets/background-01.png'){
        for(const x of [10,1015])ctx.drawImage(background,x/1100*iw,750/1430*ih,75/1100*iw,1,x/1100*1200,665/1430*1560,75/1100*1200,85/1430*1560);
      }
      const sy=160/1560*ih,sh=1250/1560*ih,sw=90/1100*iw;
      for(const [sx,dx] of [[0,4],[iw-sw,1144]]){
        const cleanX=(sx===0?100:1000)/1100*iw;
        ctx.drawImage(background,cleanX,sy,1,sh,dx-4,160,60,1250);
        ctx.save();ctx.beginPath();ctx.rect(dx,160,52,1250);ctx.clip();
        ctx.drawImage(background,sx,sy,sw,sh,dx,160,52,1250);
        if(assetName==='assets/background-01.png'){
          // Remove the skulls at their generated height before placing them at Y≈800.
          ctx.drawImage(background,sx,750/1430*ih,sw,1,dx,665/1430*1560,52,85/1430*1560);
        }
        ctx.restore();
      }
      if(assetName==='assets/background-01.png'){
        ctx.drawImage(background,10/1100*iw,665/1430*ih,75/1100*iw,85/1430*ih,6,765,46,45);
        ctx.drawImage(background,1015/1100*iw,665/1430*ih,75/1100*iw,85/1430*ih,1148,765,46,45);
      }
    }
  }
  if(frame==='halloween'&&theme==='pink')drawPinkDecorations();
  ctx.textAlign='center';ctx.fillStyle=frame==='halloween'?'#f7bf83':'#3e2e44';ctx.font='bold 32px sans-serif';if(frame!=='halloween')ctx.fillText('HONGOK FILM',600,84);
  boxes.forEach((b,i) => {
    ctx.fillStyle=frame==='halloween'?'#e5d4c7':'#ddd6df';ctx.fillRect(b.x,b.y,b.w,b.h);
    if(photos[i]) drawPhoto(photos[i],b);
    else {ctx.fillStyle='#84758b';ctx.font='26px sans-serif';ctx.fillText(`＋ ${i+1}번째 사진`,b.x+b.w/2,b.y+b.h/2);}
    if(mode==='together') {
      const pose = character==='custom'?null:assets.get(config?.characters[character]?.poses[i]);
      if(character==='custom'){
        if(customPoses[i])drawCustomPose(customPoses[i],b);
        else {ctx.fillStyle='#766782';ctx.font='18px sans-serif';ctx.fillText('내 캐릭터를 올려주세요',b.x+b.w*.73,b.y+b.h-30);}
      } else
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
  ctx.fillStyle=frame==='halloween'?(config?.footer_colors?.halloween?.[theme]??'#f4d5b3'):'#68576d';ctx.font='24px sans-serif';
  ctx.fillText($('caption').value.trim() || '네 장에 담는, 우리만의 이야기.',600,1470,1080);
  ctx.font='16px sans-serif';ctx.fillText('HONGOK FILM  ·  '+new Date().toLocaleDateString('ko-KR'),600,1515);
  const count=photos.filter(Boolean).length;$('progress').textContent=`${count} / 4`;$('download').disabled=count!==4||busy;$('share').disabled=count!==4||busy;
  renderCameraCharacter();
}
function select(index) {
  selected=index;updateCharacterUI();
  document.querySelectorAll('.slot').forEach((el,i)=>{el.classList.toggle('active',i===index);el.setAttribute('aria-pressed',String(i===index));});
  const item=editable(), isCharacter=$('edit-layer').value==='character';
  $('selected-label').textContent=`${index+1}번째 ${isCharacter?'캐릭터':'사진'}`;
  $('remove').textContent=isCharacter?'이 캐릭터 지우기':'이 사진 지우기';
  $('zoom').min=isCharacter?'0.3':'1';$('zoom').disabled=!item;$('zoom').value=item?.zoom??1;
  $('zoom-value').textContent=Math.round(Number($('zoom').value)*100)+'%';
  $('mirror').checked=item?.mirror??false;$('mirror').disabled=!item;$('remove').disabled=!item;updateCameraLabel();
}

boxes.forEach((b,i)=>{
  const el=document.createElement('button');el.className='slot';el.style.cssText=`left:${b.x/12}%;top:${b.y/15.6}%;width:${b.w/12}%;height:${b.h/15.6}%`;el.setAttribute('aria-label',`${i+1}번째 사진 선택 및 위치 조정`);el.textContent=`${i+1}번째 사진`;el.onclick=()=>select(i);$('slots').append(el);
  let drag;
  el.onpointerdown=(e)=>{select(i);if(!editable())return;el.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:editable().x,py:editable().y};};
  el.onpointermove=(e)=>{if(!drag||drag.id!==e.pointerId||!editable())return;const scale=1200/canvas.getBoundingClientRect().width;editable().x=drag.px+(e.clientX-drag.x)*scale;editable().y=drag.py+(e.clientY-drag.y)*scale;draw();};
  el.onpointerup=el.onpointercancel=()=>{drag=null;};
  el.onkeydown=(e)=>{if(!editable()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();editable().x+=e.key==='ArrowLeft'?-15:e.key==='ArrowRight'?15:0;editable().y+=e.key==='ArrowUp'?-15:e.key==='ArrowDown'?15:0;draw();};
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
  busy=false;$('edit-layer').value='photo';select(selected);draw();e.target.value='';
  status(`${loaded}장의 사진을 추가했어요.${failed?' 읽을 수 없는 사진은 JPG·PNG·WebP로 변환해 다시 올려주세요.':''}${files.length>targets.length?' 빈 칸보다 많은 사진은 제외했어요.':''}`);
};
$('zoom').oninput=()=>{if(editable())editable().zoom=Number($('zoom').value);$('zoom-value').textContent=Math.round(Number($('zoom').value)*100)+'%';draw();};
$('mirror').onchange=()=>{if(editable())editable().mirror=$('mirror').checked;draw();};
$('center').onclick=()=>{if(editable())Object.assign(editable(),{x:0,y:0,zoom:1,mirror:false});select(selected);draw();};
$('remove').onclick=()=>{if($('edit-layer').value==='character')customPoses[selected]=null;else photos[selected]=null;select(selected);draw();status('선택한 이미지를 지웠어요.');};
$('reset').onclick=()=>{if((photos.some(Boolean)||customPoses.some(Boolean))&&!window.confirm('추가한 사진·내 캐릭터·문구를 모두 지울까요?'))return;photos.fill(null);customPoses.fill(null);$('caption').value='';select(0);draw();status('새로운 추억을 시작해요.');};
$('caption').oninput=draw;
document.querySelectorAll('.mode').forEach(el=>el.onclick=()=>{mode=el.dataset.mode;document.querySelectorAll('.mode').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el));});$('character-section').hidden=mode!=='together';$('camera-guide').hidden=mode!=='together';updateCharacterUI();select(selected);draw();updateCameraLabel();});
document.querySelectorAll('.frame').forEach(el=>el.onclick=()=>{frame=el.dataset.frame;document.querySelectorAll('.frame').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el));});draw();updateCameraLabel();});
function exportFormat(){const jpg=$('format').value==='jpg';return {extension:jpg?'jpg':'png',type:jpg?'image/jpeg':'image/png'};}
const blob=(type)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('이미지를 만들지 못했어요.')),type,0.95));
$('download').onclick=async()=>{try{const format=exportFormat();const image=await blob(format.type);const url=URL.createObjectURL(image);const a=document.createElement('a');a.href=url;a.download=`plot-${frame}-${mode}-${Date.now()}.${format.extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status(`${format.extension.toUpperCase()} 이미지 저장을 요청했어요. 모바일에서 저장이 어렵다면 이미지 공유를 이용해주세요.`);}catch{status('이미지 저장에 실패했어요. 다시 시도해주세요.');}};
function updateShare(){const format=exportFormat();$('share').hidden=!(navigator.canShare&&navigator.canShare({files:[new File([''],`photo.${format.extension}`,{type:format.type})]}));}
$('format').onchange=updateShare;updateShare();
$('share').onclick=async()=>{try{const format=exportFormat();const image=await blob(format.type);await navigator.share({files:[new File([image],`plot-photo.${format.extension}`,{type:format.type})]});}catch(e){if(e.name!=='AbortError')status('공유에 실패했어요. 이미지 저장을 이용해주세요.');}};
function renderCameraCharacter(){
  const preview=$('camera-character'), c=preview.getContext('2d');c.clearRect(0,0,520,610);
  const custom=mode==='together'&&character==='custom'&&customPoses[selected];
  preview.hidden=!custom;
  $('camera-guide').hidden=mode!=='together'||Boolean(custom);
  if(custom)drawCustomPose(custom,{x:0,y:0,w:520,h:610},c);
}
function updateCameraLabel(){
  $('camera-label').textContent=`${selected+1}번째 사진 촬영 · ${mode==='together'?(character==='custom'?'내 캐릭터':(config?.characters[character]?.name??''))+'와 함께':'혼자 찍기'}`;
  renderCameraCharacter();
}
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
$('open-camera').onclick=()=>{updateCameraLabel();$('camera-dialog').showModal();renderCameraCharacter();startCamera();};
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
    const image=await imageFrom(shot.toDataURL('image/png'));if(version!==captureVersion)return;setPhoto(image,target);$('edit-layer').value='photo';
    const next=photos.findIndex((p,i)=>i>target&&!p);select(next>=0?next:photos.findIndex(p=>!p)>=0?photos.findIndex(p=>!p):target);draw();
    if(photos.every(Boolean)){$('camera-dialog').close();status('네 컷이 모두 준비됐어요! 사진을 조정하고 저장해주세요.');}
    else $('camera-status').textContent='촬영했어요! 다음 사진도 찍어주세요.';
  }catch{$('camera-status').textContent='촬영하지 못했어요. 카메라가 준비되면 다시 시도해주세요.';}
  finally{$('switch-camera').disabled=false;if(stream)$('capture').disabled=false;}
};
window.addEventListener('pagehide',closeCamera);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&$('camera-dialog').open)$('camera-dialog').close();});
$('custom-character').onclick=()=>{character='custom';$('edit-layer').value='character';updateCharacterUI();select(selected);draw();};
$('edit-layer').onchange=()=>select(selected);
async function uploadCharacter(event,singleSlot){
  const files=[...event.target.files];if(!files.length)return;
  busy=true;draw();let failed=0,loaded=0;
  for(let i=0;i<Math.min(files.length,singleSlot?1:4);i++){
    const url=URL.createObjectURL(files[i]);
    try{
      const image=await imageFrom(url);const pose={image,x:0,y:0,zoom:1,mirror:false};
      if(!singleSlot&&files.length===1)for(let j=0;j<4;j++)customPoses[j]={...pose};
      else customPoses[singleSlot?selected:i]=pose;
      loaded++;
    }catch{failed++;}finally{URL.revokeObjectURL(url);}
  }
  busy=false;event.target.value='';character='custom';$('edit-layer').value='character';select(selected);draw();
  status(`${loaded}개의 캐릭터 이미지를 불러왔어요.${failed?' 읽을 수 없는 파일은 JPG·PNG로 변환해주세요.':''}${files.length>4?' 5번째 이후 이미지는 제외했어요.':''} 칸을 선택하고 드래그·확대로 위치를 맞춰주세요.`);
}
$('character-upload').onchange=e=>uploadCharacter(e,false);
$('pose-upload').onchange=e=>uploadCharacter(e,true);
$('repeat-character').onclick=()=>{
  if(!customPoses[selected])return;
  if(!window.confirm('선택한 캐릭터의 포즈·위치를 네 칸 모두에 적용할까요?'))return;
  const pose=customPoses[selected];for(let i=0;i<4;i++)customPoses[i]={...pose};select(selected);draw();status('선택한 캐릭터를 네 칸에 적용했어요.');
};
async function init(){
  try{
    const response=await fetch('./assets/frames.json?v=20261019.18');if(!response.ok)throw new Error('config');config=await response.json();
    const paths=[...config.characters.flatMap(c=>c.poses),...Object.values(config.overlays),...Object.values(config.decoration_sources??{}),...Object.values(config.backgrounds??{}).flatMap(value=>value&&typeof value==='object'?Object.values(value):[value])].filter(Boolean);
    await Promise.all([...new Set(paths)].map(async path=>{try{assets.set(path,await imageFrom(new URL(path,document.baseURI).href));}catch{status('일부 프레임을 불러오지 못해 임시 디자인을 표시해요.');}}));
    config.characters.forEach((c,i)=>{const button=document.createElement('button');button.textContent=c.name;button.classList.toggle('active',i===character);button.setAttribute('aria-pressed',String(i===character));button.onclick=()=>{character=i;updateCharacterUI();select(selected);draw();updateCameraLabel();};$('characters').append(button);});
  }catch{status('캐릭터 설정을 불러오지 못했어요. 페이지를 새로고침해주세요.');}
  select(0);draw();
}
init();

function setTheme(theme){
  if(!['lime','pumpkin','pink'].includes(theme))theme='lime';
  document.documentElement.dataset.theme=theme;
  document.querySelectorAll('.theme-picker button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.theme===theme)));
  document.querySelector('meta[name="theme-color"]').content={lime:'#1b1622',pumpkin:'#1d0d0a',pink:'#191919'}[theme];
  try{localStorage.setItem('hongok-theme',theme);}catch{}
  draw();
}
document.querySelectorAll('.theme-picker button').forEach(button=>button.onclick=()=>setTheme(button.dataset.theme));
try{setTheme(localStorage.getItem('hongok-theme')||'lime');}catch{setTheme('lime');}
