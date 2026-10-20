// Original controllers: mermaid 419295/419825; UFO 424029/43a943/43ae4a/43b01d.
const DIRS = ['ne', 'nw', 'sw', 'se'];
const DELTAS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const project = (game, x, y) => ({x: game.campaign.origin[0] + game.campaign.column_axis[0] * y + game.campaign.row_axis[0] * x,
  y: game.campaign.origin[1] + game.campaign.column_axis[1] * y + game.campaign.row_axis[1] * x});
const randomInt = (game, n) => Math.floor(game.random() * n);
const frameCount = (game, key) => game.library?.images?.[key]?.frames ?? 1;
const pose = (game, actor) => game.library?.poses?.actors?.[actor.pose]?.[DIRS[actor.dir]] ?? game.library?.poses?.single?.[actor.pose];
const count = (game, actor) => frameCount(game, pose(game, actor)?.key ?? actor.pose);
const sound = (game, api, key) => api.emit(game, 'sound', {key});
function state(actor, name, image, ticks) {
  actor.state = name; actor.pose = image; actor.stateTime = 0; actor.frame = 0; actor.duration = ticks;
}
function sequenceFrame(sequence, tick) {
  for (const entry of sequence) { if (tick < entry.ticks) return entry.frame; tick -= entry.ticks; }
  return sequence.at(-1)?.frame ?? 0;
}
const mermaidSequence = [{frame: 0, ticks: 3}, {frame: 1, ticks: 1}, {frame: 2, ticks: 2}, {frame: 3, ticks: 1}, {frame: 4, ticks: 1}];
const returnSequence = [{frame: 6, ticks: 1}, {frame: 7, ticks: 2}, {frame: 8, ticks: 2}, {frame: 9, ticks: 2},
  {frame: 10, ticks: 2}, {frame: 11, ticks: 2}, {frame: 12, ticks: 13}, {frame: 12, ticks: 1}];

function mermaidSpawn(game, mermaid) {
  // shortcut: wait for a vacant cliff tile; add original occupied-sheep displacement when its reservation release is recovered.
  const candidates = [], occupied = [game.player, ...game.sheep, ...game.enemies];
  for (let x = game.campaign.rows - 1; x > 0; x--) for (let y = game.campaign.columns - 1; y >= 0; y--) {
    if (game.campaign.terrain[x]?.[y] !== 'c' || game.campaign.terrain[x - 1]?.[y] !== ' ') continue;
    if (!occupied.some(a => !a.hidden && !a.removed && ((a.x === x - 1 && a.y === y) || (a.move?.toX === x - 1 && a.move?.toY === y)))) candidates.push([x - 1, y]);
  }
  if (!candidates.length) { mermaid.hidden = true; return false; }
  [mermaid.x, mermaid.y] = candidates[randomInt(game, candidates.length)];
  mermaid.hidden = false; mermaid.pregnancy = 0; mermaid.pregnancyTicks = -1;
  const n = game.sheep.length, lower = n < 30 ? Math.trunc((600 * (30 - n) + 2400 * n) / 30) : 2400;
  mermaid.happiness = lower + randomInt(game, 3000 - lower);
  state(mermaid, 'jump', 'mermaidJump', frameCount(game, 'mermaidJump'));
  return true;
}

export function initializeSpecials(game) {
  game.specialActors = []; game.mermaid = null; game.ufo = null;
  if (game.levelIndex >= 2) {
    game.mermaid = {id: 'mermaid', kind: 'mermaid', x: 0, y: 0, dir: 3, frame: 0, hidden: true, stateTime: 0};
    game.specialActors.push(game.mermaid); mermaidSpawn(game, game.mermaid);
  }
  if (game.levelIndex >= 4) {
    game.ufo = {id: 'ufo', kind: 'ufo', x: 0, y: 0, dir: 0, frame: 0, pose: 'UfoShadow', overlay: true,
      renderKind: 'refractive-ufo', maskKey: 'UfoHullMask',
      hidden: true, state: 'waiting', stateTime: 0, countdown: 520, screenX: 803, screenY: 100,
      poseOverride: {key: 'UfoShadow', x: -153, bottom: 80, flip: false}};
    game.specialActors.push(game.ufo);
  }
}

function releasePlayer(game) {
  const p = game.player;
  if (!p._specialInteraction) return;
  p._specialInteraction = null; p._abducted = false; p.hidden = false;
  if (p.state === 'hurt' || p.state === 'splash') return;
  p.state = 'idle'; p.stateTime = 0; p.frame = 0; p.pose = p.mode === 4 ? 'Alien_stand' : 'Sven_stand';
}
function mermaidAward(game, mermaid, api) {
  api.addScore(game, 5); // 419c12 overrides mode-dependent sheep points.
  const mode = game.player.mode;
  if (!mermaid.pregnancy) {
    mermaid.happiness = mode === 4 ? 3000 : mode === 3 ? (mermaid.happiness > 0 ? 3000 : 600)
      : Math.min(3000, mermaid.happiness + (mode === 2 ? 1200 : 600));
    if (mermaid.happiness > 2699) mermaid.pregnancy = mode === 4 ? 3 : 1;
  } else if (mermaid.pregnancy === 1) mermaid.pregnancy = [2, 3].includes(mode) ? 3 : 2;
  else if (mermaid.pregnancy === 2) mermaid.pregnancy = 3;
  if (mermaid.pregnancy >= 3 && mermaid.pregnancyTicks < 0) mermaid.pregnancyTicks = 20;
}
function mermaidCombined(game, mermaid, api) {
  state(mermaid, 'interacting', game.player.mode === 4 ? 'Alien_mermaidfuck' : 'mermaidFuck', 7);
  game.player.state = 'interacting'; game.player.move = null; game.player.hidden = true;
  game.player._specialInteraction = 'mermaid';
  sound(game, api, 'Shag' + String(1 + randomInt(game, 11)).padStart(2, '0'));
}
export function interactSpecial(game, api) {
  const p = game.player, m = game.mermaid;
  if (!m || m.hidden || p.move || p.hidden || !['idle', 'invite'].includes(p.state) || m.state !== 'idle') return false;
  const [dx, dy] = DELTAS[p.dir];
  if (m.x !== p.x + dx || m.y !== p.y + dy) return false;
  mermaidCombined(game, m, api); return true;
}
function updateMermaid(game, api) {
  const m = game.mermaid;
  if (!m) return;
  if (m.hidden) { if (++m.stateTime % 5 === 0) mermaidSpawn(game, m); return; }
  m.stateTime++;
  if (m.pregnancyTicks > 0 && --m.pregnancyTicks === 0) {
    if (++m.pregnancy < 7) m.pregnancyTicks = 20;
    else {
      releasePlayer(game); state(m, 'exploding', 'Sheep_exploding', frameCount(game, 'Sheep_exploding'));
      sound(game, api, 'ExplodingSheep');
    }
  }
  if (m.pregnancyTicks < 0 && m.lifeTicks > 0 && --m.lifeTicks === 0 && m.state !== 'exploding') {
    releasePlayer(game); state(m, 'vanishing', 'mermaidExplode', frameCount(game, 'mermaidExplode'));
  }
  if (m.state === 'interacting') {
    m.frame = sequenceFrame(mermaidSequence, m.stateTime);
    if (game.player.state !== 'interacting' || game.player._specialInteraction !== 'mermaid' || game.phase !== 'playing') {
      releasePlayer(game); state(m, 'idle', 'mermaidStand', Infinity);
    }
    else if (m.stateTime >= m.duration) {
      mermaidAward(game, m, api);
      if (game.input?.actionHeld && m.pregnancy < 3) mermaidCombined(game, m, api);
      else { releasePlayer(game); state(m, 'idle', 'mermaidStand', Infinity); }
    }
  } else if (m.state === 'jump') {
    m.frame = Math.min(count(game, m) - 1, m.stateTime);
    if (m.stateTime >= m.duration) { state(m, 'idle', 'mermaidStand', Infinity); m.lifeTicks = 120; }
  } else if (m.state === 'exploding' || m.state === 'vanishing') {
    m.frame = Math.min(count(game, m) - 1, m.stateTime);
    if (m.stateTime >= m.duration) {
      if (m.state === 'exploding') { api.addScore(game, 10); game.pendingRewards += 3; }
      m.hidden = true; m.stateTime = 0; m.lifeTicks = -1; m.pregnancyTicks = -1;
    }
  }
}

// shortcut: active interaction pairs finish before targeting; recover interruption semantics before exact UFO parity.
const eligibleSheep = s => !s.hidden && !s.removed && !s.satisfied && !s.move && !['exploding', 'interacting', 'accept', 'abducted'].includes(s.state);
function chooseTarget(game) {
  let x = 0, y = 0;
  for (let attempt = 0; attempt < 25; attempt++) {
    x = randomInt(game, game.campaign.rows); y = randomInt(game, game.campaign.columns);
    const found = game.sheep.find(s => eligibleSheep(s) && s.x === x && s.y === y);
    if (found) return found;
  }
  const start = x * game.campaign.columns + y, cells = game.campaign.rows * game.campaign.columns;
  for (let step = 1; step < cells; step++) {
    const at = (start + step) % cells;
    const found = game.sheep.find(s => eligibleSheep(s) && s.x === Math.floor(at / game.campaign.columns) && s.y === at % game.campaign.columns);
    if (found) return found;
  }
  return null;
}
function approach(game, ufo, target) {
  ufo.target = target; ufo.targetX = target.x; ufo.targetY = target.y;
  const destination = project(game, target.x, target.y);
  ufo.destination = destination; ufo.radius = Math.hypot(ufo.screenX - destination.x, ufo.screenY - destination.y);
  // shortcut: standard atan2 replaces the x86 trig wrappers; compare recordings before claiming pixel-exact flight.
  ufo.angle = Math.atan2(ufo.screenY - destination.y, ufo.screenX - destination.x);
  ufo.spin = (ufo.screenX - destination.x) * (ufo.screenY - destination.y) > 0 ? 1 : -1;
  ufo.hidden = false; state(ufo, 'approaching', 'UfoShadow', 20);
}
function beam(game, ufo) {
  game.effects.push({key: 'LightBeam2', screen: true, x: ufo.screenX, y: ufo.screenY - 211 + ufo.beamOffset,
    scaleY: 1, frame: 0, duration: 2, opacity: 1});
}
function flyingActor(game, source, key) {
  const actor = {id: `ufo-${source.id}`, kind: source.kind, x: source.x, y: source.y, dir: source.dir,
    pose: key, frame: 0, state: 'flying', stateTime: 0, hidden: false, overlay: true};
  game.specialActors.push(actor); return actor;
}
function updateUfo(game, api) {
  const u = game.ufo;
  if (!u) return;
  if (u.playerSprite && (game.player.state === 'hurt' || game.player.state === 'splash' || game.phase !== 'playing')) {
    u.playerSprite.hidden = true; u.playerSprite = null; releasePlayer(game);
    if (u.state === 'dropping' || u.state === 'returning') state(u, 'departing', 'UfoShadow', 0);
  }
  u.stateTime++;
  if (u.state === 'waiting') {
    if (--u.countdown === 0) {
      const target = chooseTarget(game);
      if (target) { approach(game, u, target); sound(game, api, 'UFO'); }
    }
    return;
  }
  if (u.state === 'approaching') {
    if (!eligibleSheep(u.target) || u.target.x !== u.targetX || u.target.y !== u.targetY) {
      const next = chooseTarget(game);
      if (next) approach(game, u, next);
      else state(u, 'departing', 'UfoShadow', 0);
      return;
    }
    u.radius = Math.max(0, u.radius - 2.5); u.angle += u.spin * Math.PI / 180;
    u.screenX = u.destination.x + Math.trunc(Math.cos(u.angle) * u.radius);
    u.screenY = u.destination.y + Math.trunc(Math.sin(u.angle) * u.radius);
    if (u.radius === 0) { state(u, 'beam-down', 'UfoShadow', 0); u.beamOffset = -u.screenY - 49; sound(game, api, 'Beam'); }
  } else if (u.state === 'beam-down') {
    u.beamOffset = Math.min(0, u.beamOffset + 11); beam(game, u);
    if (u.beamOffset === 0) {
      if (!eligibleSheep(u.target)) { const next = chooseTarget(game); if (next) approach(game, u, next); else state(u, 'departing', 'UfoShadow', 0); return; }
      u.target.hidden = u.target._abducted = true; u.target.move = null;
      u.sheepSprite = flyingActor(game, u.target, 'SheepFlying');
      u.lift = 0; state(u, 'lifting', 'UfoShadow', 0); sound(game, api, 'BeamLoop');
    }
  } else if (u.state === 'lifting') {
    const p = game.player;
    if (!u.playerSprite && p.x === u.targetX && p.y === u.targetY && !p.move && !p.hidden && p.state === 'idle') {
      p._abducted = p.hidden = true; p._specialInteraction = 'ufo'; p.state = 'interacting';
      u.playerSprite = flyingActor(game, p, 'SvenFlying'); api.addScore(game, -10);
    }
    u.lift -= 3; beam(game, u);
    for (const a of [u.sheepSprite, u.playerSprite].filter(Boolean)) {
      a.screenX = u.screenX; a.screenY = u.screenY + u.lift;
      a.frame = u.stateTime < 14 ? u.stateTime : 15 + Math.floor((u.stateTime - 14) * .15) % 7;
    }
    if (u.screenY + u.lift < 0) {
      u.sheepSprite.hidden = true; if (u.playerSprite) u.playerSprite.hidden = true;
      state(u, 'beam-up', 'UfoShadow', 0);
    }
  } else if (u.state === 'beam-up') {
    u.beamOffset -= 7; beam(game, u);
    if (u.beamOffset < -u.screenY - 49) {
      if (u.playerSprite) {
        const p = game.player; if (p.dir === 0) p.dir = 3; else if (p.dir === 1) p.dir = 2;
        u.playerSprite.dir = p.dir; u.playerSprite.pose = 'AlienFall'; u.playerSprite.hidden = false;
        u.drop = -u.screenY; u.velocity = 1; state(u, 'dropping', 'UfoShadow', 0);
      } else state(u, 'departing', 'UfoShadow', 0);
    }
  } else if (u.state === 'dropping') {
    u.drop = Math.min(0, u.drop + u.velocity);
    if (u.drop < 0) { u.velocity++; if (u.velocity % 3 === 0) u.velocity++; }
    u.playerSprite.screenX = u.screenX; u.playerSprite.screenY = u.screenY + u.drop;
    u.playerSprite.frame = 4 + Math.floor(u.stateTime * .3) % 3;
    if (u.drop === 0) {
      u.playerSprite.hidden = true; const p = game.player; p.hidden = false; p.pose = 'SvenReturn'; p.frame = 6; p._abducted = false;
      u.returnTicks = 30; state(u, 'returning', 'UfoShadow', 1); sound(game, api, 'AlienReturn');
    }
  } else if (u.state === 'returning') {
    game.player.frame = sequenceFrame(returnSequence, u.stateTime);
    if (--u.returnTicks === 0) {
      game.player.mode = 4; game.player.modeUntil = game.now + 15000; releasePlayer(game);
      state(u, 'departing', 'UfoShadow', 0);
    }
  } else if (u.state === 'departing') {
    if (!u.exit) {
      const dx = u.screenX + 600, dy = u.screenY - 100;
      u.exit = {radius: Math.hypot(dx, dy), angle: Math.atan2(dy, dx), spin: dx * dy > 0 ? 1 : -1};
    }
    u.exit.angle += u.exit.spin * Math.PI / 180;
    u.screenX = -600 + Math.trunc(Math.cos(u.exit.angle) * u.exit.radius);
    u.screenY = 100 + Math.trunc(Math.sin(u.exit.angle) * u.exit.radius);
    if (u.screenX < -144) {
      if (u.target?._abducted) { u.target.removed = true; u.target._abducted = false; api.emit(game, 'sheep-removed', {id: u.target.id, reason: 'ufo'}); }
      u.hidden = true; u.exit = null; state(u, 'waiting', 'UfoShadow', 0); u.countdown = 1000000;
    }
  }
}
export function updateSpecials(game, api) {
  updateMermaid(game, api); updateUfo(game, api);
}
