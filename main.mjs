import { ClassicArt, ClassicAudio, atlasFrame } from './art.mjs';
import { createGame, stepGame, nextLevel } from './simulation.mjs';

const canvas = document.getElementById('game');
const loading = document.getElementById('loading'), status = document.getElementById('status');
const progress = document.getElementById('progress'), soundButton = document.getElementById('sound');
const STORAGE = 'sven-native-classic-v1';
const DEFAULT_KEYS = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space'];
const DEFAULT_SCORES = [{name:'Sören',score:500},{name:'Dörte',score:400},{name:'Ole',score:300},{name:'Ansgar',score:200},{name:'Leif',score:100}];
const RESERVED = new Set(['Escape', 'KeyB', 'KeyS', 'F4', 'F11', 'Tab']);

function readSave() {
  const saved = { version: 1, level: 0, sound: true, keys: [...DEFAULT_KEYS], scores: [...DEFAULT_SCORES] };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE));
    if (!data || data.version !== 1) return saved;
    if (Number.isInteger(data.level) && data.level >= 0 && data.level < 20) saved.level = data.level;
    if (typeof data.sound === 'boolean') saved.sound = data.sound;
    if (Array.isArray(data.keys) && data.keys.length === 5 && new Set(data.keys).size === 5 && data.keys.every(k => typeof k === 'string' && /^[A-Za-z0-9]+$/.test(k) && k.length < 40 && !RESERVED.has(k))) saved.keys = data.keys;
    if (Array.isArray(data.scores)) {
      const scores = data.scores.filter(s => typeof s.name === 'string' && s.name.length <= 17 && Number.isInteger(s.score) && s.score >= 0 && s.score <= 1e9).slice(0, 5);
      if (scores.length) saved.scores = scores.sort((a, b) => b.score - a.score);
    }
  } catch { /* Storage may be unavailable; the current session still works. */ }
  return saved;
}

const saved = readSave();
let library, campaign, art, audio, game;
let scene = 'loading', previousScene = 'menu', selection = 0, buttons = [], remapping = null;
let name = '', nameCursor = true, nameSubmitted = false, phaseStarted = 0, lastPhase = null;
let lastTime = performance.now(), clock = 0, frames = 0, frameWindow = lastTime, fps = 0;
let renderMilliseconds = 0, actionPressed = false, lastDirection = null;
const held = new Set();

function persist() { try { localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch { /* Do not interrupt play when storage is full or disabled. */ } }
function keysLabel(code) { return ({ ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→', Space:'Leertaste', Enter:'Enter' })[code] || code.replace(/^Key|^Digit/, ''); }
function setScene(next) {
  scene = next; selection = 0; remapping = null; held.clear(); actionPressed = false;
  canvas.focus();
  if (audio) audio.music(next === 'menu' ? 'MenuSound' : null);
}
function soundState() { soundButton.textContent = audio.enabled ? 'Ton an' : 'Ton aus'; soundButton.setAttribute('aria-pressed', String(audio.enabled)); }
function toggleSound() { audio.toggle(); saved.sound = audio.enabled; persist(); soundState(); if (audio.enabled && scene === 'menu') audio.music('MenuSound'); }
function menuStart() { if (saved.level > 0) setScene('reload'); else startGame(0); }
function startGame(level) {
  game = createGame(campaign, { library, levelIndex: level, seed: (Date.now() >>> 0) || 1 });
  saved.level = level; persist(); lastPhase = null; nameSubmitted = false;
  setScene('playing');
}
function finishRun() {
  if (game.score > (saved.scores.at(-1)?.score ?? -1) || saved.scores.length < 5) { name = ''; setScene('name'); }
  else setScene('scores');
}
function submitScore() {
  if (nameSubmitted) return;
  nameSubmitted = true;
  saved.scores = [...saved.scores, {name: name.trim() || 'Sven', score: game.score}].sort((a, b) => b.score - a.score).slice(0, 5);
  persist(); setScene('scores');
}

function button(key, x, y, action, options = {}) {
  const dimensions = key ? atlasFrame(library.images[key]) : { width: options.width || 150, height: options.height || 30 };
  const index = buttons.length;
  buttons.push({ x, y, width: dimensions.width, height: dimensions.height, action });
  if (key) art.image(key, index === selection ? 1 : 0, x, y);
  else art.text(options.text, x + dimensions.width / 2, y + dimensions.height / 2, options.size || 21, index === selection ? '#ad0d27' : '#252c13', 'center');
}

function drawMenu() {
  art.background('MenuBkgnd');
  // Original title is 245×129; the reference menu centers it in the same 640×480 field.
  art.image('Title', 0, 197, 149);
  const cycle = (clock / 1000 * 45) % 830;
  art.image('Main_whitesheep', clock / 1000 * 15, 690 - cycle, 30, true);
  art.image('Main_Sven', clock / 1000 * 15, 820 - cycle, 30, true);
  const actions = { BtnStart: menuStart, BtnHelp: () => setScene('help'), BtnTopScores: () => setScene('scores'), BtnExit: () => { phaseStarted = clock; setScene('bye'); audio.play('ByeBye'); }, BtnSetup: () => setScene('controls') };
  for (const entry of library.metadata?.ui?.buttons || [
    {key:'BtnStart',x:27,y:434},{key:'BtnHelp',x:165,y:434},{key:'BtnTopScores',x:313,y:434},{key:'BtnExit',x:540,y:434},{key:'BtnSetup',x:160,y:458}]) button(entry.key, entry.x, entry.y, actions[entry.key]);
}

function drawControls() {
  art.background('SetupBackground');
  // Original key labels at 0x494338 place NE on the upper-right oval.
  const spots = [[477,132],[182,132],[182,347],[477,347],[320,241]];
  const groups = ['Sven_walk', 'Sven_walk', 'Sven_walk', 'Sven_walk', 'SvenInvite'];
  for (let i = 0; i < 5; i++) {
    const [x, y] = spots[i], dir = i < 4 ? i : 3;
    const pose = library.poses.actors[groups[i]][['ne','nw','sw','se'][dir]];
    const frame = Math.floor(clock / 85) % library.images[pose.key].frames;
    art.image(pose.key, frame, x - atlasFrame(library.images[pose.key]).width / 2, y - 45, pose.flip);
    art.text(remapping === i && nameCursor ? '…' : keysLabel(saved.keys[i]), x, y + 35, 22, remapping === i ? '#d51b19' : '#ad0d27', 'center');
    buttons.push({x:x-100,y:y-55,width:200,height:110,action:()=>{remapping=i;selection=i;}});
  }
  button('BtnMainMenuHelp', 23, 446, () => setScene('menu'));
  button('BtnStandardKeys1', 50, 198, () => { saved.keys = [...DEFAULT_KEYS]; persist(); remapping = null; });
  button('BtnStandardKeys2', 514, 198, () => { saved.keys = ['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Space']; persist(); remapping = null; });
}

function drawScores() {
  art.background('TopBkgnd');
  art.ctx.fillStyle = '#d9d59f'; art.ctx.fillRect(383, 109, 220, 221);
  for (let i = 0; i < 5; i++) {
    const row = saved.scores[i]; if (!row) continue;
    art.text(`${i + 1}. ${row.name}`, 397, 135 + i * 39, 18, '#3a371c');
    art.text(row.score, 590, 135 + i * 39, 18, '#ad0d27', 'right');
  }
  button('BtnMainMenuTopScores', 17, 444, () => setScene('menu'));
}

function drawScene() {
  buttons = [];
  if (scene === 'menu') drawMenu();
  else if (scene === 'playing') {
    art.game(game);
    if (game.phase === 'level-clear') art.text('GESCHAFFT!', 320, 205, 34, '#ad0d27', 'center');
    else if (game.phase === 'game-over' || game.phase === 'won') {
      art.centered(game.phase === 'won' ? 'GameWon' : 'GameOver', 320, 240);
      button(null, 223, 385, finishRun, {text:'WEITER',width:194});
    }
  } else if (scene === 'paused') {
    art.background('EscBackground');
    art.text('Spiel wirklich beenden?', 320, 113, 27, '#252c13', 'center');
    button(null, 116, 355, () => setScene('playing'), {text:'ZURÜCK',width:170,height:45});
    button(null, 355, 355, () => { saved.level=game.levelIndex; persist(); setScene('menu'); }, {text:'JA',width:170,height:45});
  } else if (scene === 'help') {
    art.background('HelpBkgnd'); button('BtnMainMenuHelp', 17, 442, () => setScene('menu'));
  } else if (scene === 'controls') drawControls();
  else if (scene === 'scores' || scene === 'name') {
    drawScores();
    if (scene === 'name') {
      buttons = [];
      art.ctx.fillStyle = '#dfcf8b'; art.ctx.fillRect(378, 112, 228, 217);
      art.text('Dein Name', 492, 145, 25, '#3a371c', 'center');
      art.text(name + (nameCursor ? '_' : ''), 492, 210, 23, '#ad0d27', 'center');
      art.text(game.score, 492, 250, 23, '#3a371c', 'center');
      button(null, 417, 281, submitScore, {text:'OK',width:150});
    }
  } else if (scene === 'reload') {
    art.background('ReloadBackground'); art.text('Ein neues Spiel beginnen?', 320, 85, 26, '#252c13', 'center');
    button(null, 114, 367, () => startGame(0), {text:'NEUES SPIEL',width:190,height:40});
    button(null, 346, 367, () => startGame(saved.level), {text:'WEITERSPIELEN',width:190,height:40});
  } else if (scene === 'boss') art.background('BossScreeen');
  else if (scene === 'bye') {
    art.background('MenuBkgnd'); art.centered('SvenByeBkgnd', 320, 240);
    art.centered('SvenByeBye', 320, 253, Math.min(35, Math.floor((clock-phaseStarted)/80)));
    button(null, 201, 402, () => setScene('menu'), {text:'ZURÜCK ZUM SPIEL',width:238});
  }
}

function activeDirection() {
  if (lastDirection != null && held.has(saved.keys[lastDirection])) return lastDirection;
  return saved.keys.slice(0,4).findIndex(key => held.has(key));
}
function loop(time) {
  const dt = Math.min(100, Math.max(0, time - lastTime)); lastTime = time; clock += dt;
  nameCursor = Math.floor(clock / 400) % 2 === 0;
  const started = performance.now();
  if (scene === 'playing') {
    const direction = activeDirection();
    stepGame(game, { direction: direction < 0 ? null : direction, actionPressed, actionHeld: held.has(saved.keys[4]) }, dt);
    actionPressed = false;
    for (const event of game.events.splice(0)) if (event.type === 'sound') audio.play(event.key);
    if (game.phase !== lastPhase) {
      lastPhase = game.phase; phaseStarted = clock;
      if (game.levelIndex !== saved.level) { saved.level = game.levelIndex; persist(); }
    }
    if (game.phase === 'level-clear' && clock - phaseStarted >= 1200) nextLevel(game);
  }
  drawScene(); renderMilliseconds = performance.now() - started;
  frames++;
  if (time-frameWindow >= 1000) { fps = frames*1000/(time-frameWindow); frames=0; frameWindow=time; }
  requestAnimationFrame(loop);
}

canvas.addEventListener('pointermove', event => {
  const bounds = canvas.getBoundingClientRect(), x = (event.clientX-bounds.left)*640/bounds.width, y = (event.clientY-bounds.top)*480/bounds.height;
  const found = buttons.findIndex(b => x >= b.x && x < b.x+b.width && y >= b.y && y < b.y+b.height);
  canvas.style.cursor = found >= 0 ? 'pointer' : 'default';
  if (found >= 0) selection = found;
});
canvas.addEventListener('pointerdown', async event => {
  canvas.focus(); await audio?.unlock(); if (scene === 'menu') audio.music('MenuSound');
  const bounds = canvas.getBoundingClientRect(), x = (event.clientX-bounds.left)*640/bounds.width, y = (event.clientY-bounds.top)*480/bounds.height;
  buttons.find(b => x >= b.x && x < b.x+b.width && y >= b.y && y < b.y+b.height)?.action();
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('keydown', event => {
  if (!audio) return;
  audio.unlock();
  if (scene === 'loading' || event.metaKey || event.ctrlKey || event.altKey || event.code === 'Tab') return;
  if (scene === 'boss') { event.preventDefault(); setScene(previousScene); return; }
  if (scene === 'name') {
    event.preventDefault();
    if (event.code === 'Enter') submitScore();
    else if (event.code === 'Backspace') name = name.slice(0, -1);
    else if (event.code === 'Escape') { name = 'Sven'; submitScore(); }
    else if (event.key.length === 1 && name.length < 17) name += event.key;
    return;
  }
  if (remapping != null) {
    event.preventDefault();
    if (event.code === 'Escape') { remapping = null; return; }
    if (RESERVED.has(event.code)) return;
    const existing = saved.keys.indexOf(event.code), old = saved.keys[remapping];
    saved.keys[remapping] = event.code;
    if (existing >= 0 && existing !== remapping) saved.keys[existing] = old;
    remapping = null; persist(); return;
  }
  if (event.code === 'KeyS' || event.code === 'F4') { event.preventDefault(); if (!event.repeat) toggleSound(); return; }
  if (event.code === 'KeyB') { event.preventDefault(); previousScene = scene; setScene('boss'); return; }
  if (scene === 'playing' && game.phase === 'playing') {
    if (event.code === 'Escape') { event.preventDefault(); setScene('paused'); return; }
    if (saved.keys.includes(event.code)) {
      event.preventDefault(); held.add(event.code);
      const index = saved.keys.indexOf(event.code);
      if (index < 4) lastDirection = index; else actionPressed = true;
      return;
    }
  } else {
    if (event.code === 'Escape') { event.preventDefault(); setScene(scene === 'paused' ? 'playing' : 'menu'); return; }
    if (event.code === 'Enter' || event.code === 'Space') { event.preventDefault(); buttons[selection]?.action(); return; }
    if (event.code.startsWith('Arrow')) {
      event.preventDefault();
      if (scene === 'menu') {
        if (event.code === 'ArrowDown' && selection === 1) selection = 4;
        else if (event.code === 'ArrowUp' && selection === 4) selection = 1;
        else if (event.code === 'ArrowLeft' && selection !== 4) selection = (selection + 3) % 4;
        else if (event.code === 'ArrowRight' && selection !== 4) selection = (selection + 1) % 4;
      } else selection = (selection + (event.code === 'ArrowLeft' || event.code === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    }
  }
});
window.addEventListener('keyup', event => held.delete(event.code));
function pauseOnBlur() { held.clear(); actionPressed = false; if (scene === 'playing' && game?.phase === 'playing') setScene('paused'); }
window.addEventListener('blur', pauseOnBlur);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnBlur(); lastTime = performance.now(); });
document.getElementById('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.getElementById('game-frame').requestFullscreen(); } catch { /* The browser may deny fullscreen; resizing remains available. */ }
  canvas.focus();
});
soundButton.addEventListener('click', async () => { await audio?.unlock(); if (audio) toggleSound(); canvas.focus(); });
document.getElementById('retry').addEventListener('click', () => location.reload());

window.svenNativeDiagnostics = () => ({ engine:'native-js-canvas', scene, fps, frameMilliseconds:renderMilliseconds,
  missingFrames: art ? [...art.missing] : [], sprites: art?.sprites, level:game?.levelIndex,
  player: game ? {x:game.player.x,y:game.player.y,move:game.player.move,state:game.player.state,dir:game.player.dir,hidden:game.player.hidden,mode:game.player.mode} : null,
  score:game?.score,lives:game?.lives,timeLeft:game?.timeLeft,phase:game?.phase,sheep:game?.sheep.length,
  interaction:game?.interaction,
  actors:game ? game.sheep.map(s=>({id:s.id,x:s.x,y:s.y,dir:s.dir,state:s.state,frame:s.frame,happiness:s.happiness,hidden:s.hidden,removed:s.removed})) : [],
  loadMilliseconds:performance.getEntriesByType('measure').find(e=>e.name==='native-ready')?.duration });

async function boot() {
  performance.mark('native-start');
  const load = async path => { const r = await fetch(new URL(path, import.meta.url)); if (!r.ok) throw new Error(`Laden fehlgeschlagen: ${r.status}`); return r.json(); };
  [library, campaign] = await Promise.all([load('data/library.json'), load('data/campaign.json')]);
  art = new ClassicArt(canvas, library);
  await art.load((count,total) => { progress.max=total;progress.value=count;status.textContent=`Originalgrafiken laden… ${count}/${total}`; });
  audio = new ClassicAudio(library); audio.enabled = saved.sound; soundState();
  loading.hidden = true; setScene('menu'); performance.mark('native-loaded');performance.measure('native-ready','native-start','native-loaded');
  requestAnimationFrame(loop);
  // Retire only the previous emulator's worker at this project's own scope.
  if (navigator.serviceWorker) {
    const scope = new URL('.', import.meta.url).href;
    navigator.serviceWorker.getRegistrations().then(entries => Promise.all(entries.filter(r=>r.scope===scope).map(r=>r.unregister()))).catch(()=>{});
  }
}
boot().catch(error => { status.textContent=error.message;progress.hidden=true;document.getElementById('retry').hidden=false;console.error(error); });
