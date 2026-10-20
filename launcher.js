/* Browser wrapper only; Sven.exe still owns the original game and its menus. */
Config.urlParams='app=sven&p=Sven.exe&resolution=640x480&auto=false&disableHideCursor=true&bpp=16';
Config.locateRootBaseUrl=new URL('runtime/',document.baseURI).href;
Config.locateAppBaseUrl=new URL('game/',document.baseURI).href;
Config.persist_d_drive=false;
ROOT='/sven-original-v1';
// The upstream URL parser keeps literal quotes around environment values.
getEnvProp=()=>'WINEDLLOVERRIDES=ddraw=n,b';
const threaded=window.crossOriginIsolated&&typeof SharedArrayBuffer!=='undefined';
const runtimeDirectory='runtime/'+(threaded?'mt/':'');
Module.locateFile=path=>new URL(runtimeDirectory+path,document.baseURI).href;
Module.mainScriptUrlOrBlob=new URL(runtimeDirectory+'boxedwine.js',document.baseURI).href;

const gameCanvas=document.getElementById('canvas');
const gameStatus=document.getElementById('status');
const playButton=document.getElementById('startbtn');
const loadingSpinner=document.getElementById('spinner');
let fatalError=null,persistent=true;
function loadingFailed(message){
  fatalError=message;
  document.body.classList.remove('running');
  gameStatus.textContent=message;loadingSpinner.hidden=true;playButton.hidden=true;
}
Module.onAbort=()=>loadingFailed('The game could not start. Reload the page to try again.');
Module.onExit=()=>{gameStatus.textContent='Game closed. Reload this page to play again.';document.body.classList.remove('running');loadingSpinner.hidden=true;playButton.hidden=true;};
Module.printErr=text=>console.error(text);
const runtimePrint=Module.print;
Module.print=text=>{
  runtimePrint(text);
  if(/loader_init Importing dlls.*failed|Unhandled exception/i.test(text))loadingFailed('The original game could not start. Reload to try again.');
};
initBrowserFilesystem=callback=>{
  FS.mkdir(ROOT);FS.mkdir(Config.d_drive);
  const fallback=()=>{
    persistent=false;
    try{FS.unmount(ROOT);}catch{/* A rejected mount may not exist. */}
    console.warn('Site storage is unavailable; scores last for this tab only.');callback();
  };
  try{
    FS.mount(IDBFS,{autoPersist:true},ROOT);
    FS.syncfs(true,error=>error?fallback():callback());
  }catch{fallback();}
};

// Use the upstream loader entry point, with progress and a visible failure state.
loadFile=function(prefix,filename,callback){
  (async()=>{
    const response=await fetch(prefix+filename,{signal:AbortSignal.timeout(180000)});
    if(!response.ok)throw new Error('Download failed ('+response.status+'). Reload to retry.');
    const total=Number(response.headers.get('content-length'))||0,parts=[];
    const reader=response.body.getReader();let length=0;
    gameStatus.textContent='Loading the original game…';loadingSpinner.hidden=false;
    const bar=document.getElementById('progress');
    if(total){bar.max=total;bar.value=0;}else bar.removeAttribute('value');
    while(true){
      const {done,value}=await reader.read();if(done)break;
      parts.push(value);length+=value.length;if(total)bar.value=length;
    }
    const data=new Uint8Array(length);let offset=0;
    for(const part of parts){data.set(part,offset);offset+=part.length;}
    callback(data);
    if(filename===Config.rootZipFile){
      gameStatus.textContent='Ready. Click Play to begin.';
      document.getElementById('sound-checkbox').hidden=false;
    }
  })().catch(error=>loadingFailed(error.message||'Loading failed. Reload to retry.'));
};
playButton.addEventListener('click',()=>{
  Config.isSoundEnabled=document.getElementById('soundToggle').checked;
  playButton.hidden=true;document.getElementById('sound-checkbox').hidden=true;
  gameStatus.textContent='Starting the original game…';loadingSpinner.hidden=false;loadingSpinner.style.display='';
  gameCanvas.focus();
  try{start();}catch(error){loadingFailed(error.message||'The game could not start. Reload to retry.');return;}
  const preview=document.createElement('canvas');preview.width=16;preview.height=12;
  const context=preview.getContext('2d');
  const presented=setInterval(()=>{
    if(fatalError){clearInterval(presented);return;}
    context.drawImage(gameCanvas,0,0,16,12);
    const pixels=context.getImageData(0,0,16,12).data,colors=new Set();
    for(let i=0;i<pixels.length;i+=4)colors.add((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]);
    if(colors.size>12){document.body.classList.add('running');clearInterval(presented);}
  },250);
});
document.getElementById('fullscreen').addEventListener('click',()=>{
  gameCanvas.requestFullscreen().catch(()=>{});gameCanvas.focus();
});
gameCanvas.addEventListener('contextmenu',event=>event.preventDefault());
gameCanvas.addEventListener('pointerdown',()=>gameCanvas.focus());
window.addEventListener('keydown',event=>{
  if(document.body.classList.contains('running')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();
});
window.svenWebDiagnostics=()=>({runtime:threaded?'multi-threaded':'single-threaded',persistent,running:isRunning,error:fatalError,width:gameCanvas.width,height:gameCanvas.height});
function loadRuntime(){
  const script=document.createElement('script');script.src=Module.mainScriptUrlOrBlob;
  script.onerror=()=>loadingFailed('The game download failed. Reload to retry.');document.body.append(script);
}
// Let GitHub Pages' isolation worker take control before downloading the emulator.
if(!threaded&&navigator.serviceWorker&&window.isSecureContext)setTimeout(loadRuntime,1200);
else loadRuntime();
