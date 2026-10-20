// Original actor states: 42ae87/42b208/42c2c0 (sheep), 402cd1/405306 (dog), 430897/431e09 (shepherd).
const DIRECTIONS = ['ne', 'nw', 'sw', 'se'];
const DELTAS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const OPPOSITE = [2, 3, 0, 1];
const POINTS = [0, 1, 3, 5, 15, 1];
// 42d7ff/42ea6b: exact per-level registration lists, split by facing in 42cd53.
const INTERACTIONS = [[2,8],[2,3,8],[2,3,5,8],[2,3,6,5,8],[2,3,6,4,5,8],[3,6,7,4,5,8],[2,6,7,4,5,9],[3,6,12,4,8,9],[3,7,12,5,9,11],[6,7,14,5,9,11],[2,12,14,8,9,13],[3,6,14,4,11,13],[3,7,12,5,9,13],[3,7,14,5,9,11],[2,6,14,4,11,13],[3,6,12,5,8,9],[2,7,12,9,11,13],[3,7,14,5,8,9],[2,6,12,8,9,11],[3,12,14,5,11,13]];
// Frame/dwell pairs recovered from CImageSeq tables 495c58, 494c88, 494ad0 and 494b88.
const expand = pairs => pairs.flatMap(([frame, ticks]) => Array(ticks).fill(frame));
const INVITE = expand([[0,4],[1,1],[2,1],[3,1],[4,2],[5,1],[6,1],[7,1],[8,1],[9,2],[10,1],[11,1],[12,1],[13,2],[14,1],[15,1],[0,2]]);
const ACCEPT = expand([[0,4],[1,1],[2,4],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[7,1],[6,1],[5,1],[4,1],[5,1],[6,1],[7,1],[8,1],[7,1],[6,1],[5,1],[4,1],[5,1],[6,1],[7,1],[8,1],[7,1],[6,1],[5,1],[4,2],[9,1],[10,1],[0,4],[11,1]]);
const DEMON = expand([[0,4],[1,1],[2,1],[3,5],[4,4],[5,1],[6,1],[7,1],[8,2],[9,4],[10,1],[11,1],[12,1],[13,2],[14,6],[15,1],[16,1],[17,1],[18,6]]);
const RECOVER = expand([[18,3],[8,3],[7,3],[6,3],[5,3],[4,3],[3,3],[2,3],[1,2],[0,1],[0,1]]);
const SHOCK = expand([[18,1],[19,2],[20,2],[21,3],[22,3],[21,1],[20,1],[19,1],[18,1]]);
const ELECTRO_TAIL = expand([[3,1],[4,1],[5,1],[6,9],[7,1],[8,6]]);
const plan = actor => actor.pose === 'SvenInvite' || actor.pose === 'AlienInvite' ? INVITE : actor.pose === 'SheepAccept' ? ACCEPT : actor.state === 'transform' ? DEMON : actor.state === 'shock' ? SHOCK : actor.state === 'recover' && actor.pose === 'Demon' ? RECOVER : null;
const integer = (game, n) => Math.floor(game.random() * 32768) % n; // Original MSVCRT rand()%n.
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const poseEntry = (game, actor) => actor.poseOverride ?? game.library?.poses?.actors?.[actor.pose]?.[DIRECTIONS[actor.dir]] ?? game.library?.poses?.single?.[actor.pose];
const frameCount = (game, actor) => game.library?.images?.[poseEntry(game, actor)?.key ?? actor.pose]?.frames ?? 1;
const rate = (game, actor) => poseEntry(game, actor)?.rate ?? 1;
const duration = (game, actor) => plan(actor)?.length ?? Math.max(1, Math.ceil(frameCount(game, actor) / rate(game, actor)));
function state(actor, name, pose, ticks = 0, originalState) {
  actor.state = name; actor.pose = pose; actor.stateTime = 0; actor.frame = 0;
  actor.duration = ticks; actor.poseOverride = null; actor.originalState = originalState;
}
function animate(game, actor, start = 0, end = frameCount(game, actor), speed = rate(game, actor)) {
  const frames = plan(actor);
  // The acceptance table ends with frame11 although its bitmap has frames0..10.
  if (frames) { actor.frame = Math.min(frameCount(game, actor) - 1, frames[Math.min(actor.stateTime, frames.length - 1)]); return; }
  actor.frame = start + Math.floor(actor.stateTime * speed) % Math.max(1, end - start);
}
function idle(game, actor) {
  // 42c2c0 state1: stationary first walk frame for 100..299 ticks.
  state(actor, 'idle', 'Sheep_walk', actor.satisfied ? Infinity : 100 + integer(game, 200), 1);
}
function rawHappiness(sheep) { return sheep.happiness > 0 ? sheep.happiness : (sheep.happinessDebt ?? 0); }
function setHappiness(sheep, value) {
  sheep.happiness = Math.min(3000, Math.max(0, value));
  sheep.happinessDebt = Math.min(0, value);
}
function mood(sheep) {
  const h = rawHappiness(sheep);
  return h > 0 ? Math.trunc(h * 10 / 3000) + 1 : Math.trunc(h * 10 / 3000);
}
function symbols(game, sheep) {
  if (sheep.hidden || sheep.satisfied) { sheep.symbolFrame = null; return; }
  // 42d08e maps happiness bands to the original Symbols frame ranges.
  const band = sheep.pregnancy >= 3 ? sheep.pregnancy + 10 : mood(sheep);
  const ranges = band < 0 ? [12, 14] : band < 2 ? [11, 13] : band < 4 ? [9, 11] : band < 7 ? [6, 9]
    : band === 7 ? [5, 6] : band === 8 ? [4, 5] : band === 9 ? [3, 4]
      : band < 13 ? [0, 3] : band === 13 ? [14, 20] : band < 17 ? [18, 20] : null;
  if (sheep.symbolBand !== band) { sheep.symbolBand = band; sheep.symbolTime = 0; }
  else sheep.symbolTime++;
  const speed = band >= 13 ? .25 : band === 2 ? .2 : band >= 7 && band <= 9 ? 1 : .1;
  sheep.symbolFrame = ranges ? ranges[0] + Math.floor(sheep.symbolTime * speed) % (ranges[1] - ranges[0]) : null;
  if ((band === 0 || band === 1) && sheep.symbolTime === 0) sheep.symbolFrame = 13;
}
export function initializeActors(game) {
  const count = game.sheep.length;
  const lower = count < 30 ? Math.trunc((600 * (30 - count) + 2400 * count) / 30) : 2400; // 42ad59.
  for (const sheep of game.sheep) {
    sheep.dir ??= ({e: 0, n: 1, w: 2, s: 3}[sheep.variant?.toLowerCase()] ?? 0);
    sheep.special = !!sheep.special;
    sheep.happiness ??= lower + integer(game, 3000 - lower);
    sheep.happinessDebt = 0; sheep.pregnancy = 0; sheep.pregnancyTime = -1;
    sheep.hidden = false; sheep.removed = false; sheep.satisfied = false;
    sheep.previousMood = mood(sheep); idle(game, sheep); symbols(game, sheep);
  }
  for (const enemy of game.enemies) {
    enemy.hidden = false; enemy.alert = false; enemy.lastBark = -4000;
    enemy.previousCell = null;
    enemy.spawnX ??= enemy.x; enemy.spawnY ??= enemy.y; enemy.spawnDir ??= enemy.dir;
    enemy.stepsRemaining = 0;
    if (enemy.kind === 'dog') state(enemy, 'rest', 'Doglaydown', 60, 0x32);
    else state(enemy, 'idle', 'Guy_stand', 100 + integer(game, 70), 0x3f);
  }
}
export function resetEnemiesAfterCapture(game) {
  // 424cb8 event2a ->405c45/43217a: restore both enemies, not the sheep or score.
  for (const enemy of game.enemies) {
    enemy.x = enemy.spawnX; enemy.y = enemy.spawnY; enemy.dir = enemy.spawnDir;
    enemy.move = null; enemy.hidden = false; enemy.alert = false; enemy.pendingCall = false;
    enemy.waitingForRespawn = false; enemy.aiStepPending = false; enemy.stepsRemaining = 0;
    enemy.previousCell = null; enemy.interactionCount = 0; enemy.requestState = null;
    state(enemy, enemy.kind === 'dog' ? 'rest' : 'idle', enemy.kind === 'dog' ? 'Doglaydown' : 'Guy_stand', enemy.kind === 'dog' ? 60 : 100 + integer(game, 70), enemy.kind === 'dog' ? 0x32 : 0x3f);
  }
}
function canMove(game, actor, dir, api) {
  const [dx, dy] = DELTAS[dir];
  return api.canEnter(game, actor, actor.x + dx, actor.y + dy);
}
function move(game, actor, dir, ticks, pose, api) {
  if (!api.startMove(game, actor, dir, ticks)) return false;
  actor.pose = pose; actor.poseOverride = null; actor.frame = 0; return true;
}
function toward(actor, target) {
  const dx = target.x - actor.x, dy = target.y - actor.y;
  const a = dy > 0 ? 0 : 2, b = dx < 0 ? 1 : 3;
  return Math.abs(dx) < Math.abs(dy) ? [a, b, OPPOSITE[b], OPPOSITE[a]] : [b, a, OPPOSITE[a], OPPOSITE[b]];
}
function pursue(game, actor, target, ticks, pose, api) {
  // 431636/404381: primary axis, secondary axis, then their opposites; avoid immediate backtracking.
  const directions = toward(actor, target).filter(dir => canMove(game, actor, dir, api));
  const dir = directions.find(d => { const [dx,dy] = DELTAS[d]; return !actor.previousCell || actor.x + dx !== actor.previousCell.x || actor.y + dy !== actor.previousCell.y; }) ?? directions[0];
  if (dir == null) return false;
  actor.previousCell = {x: actor.x, y: actor.y};
  return move(game, actor, dir, ticks, pose, api);
}
function wander(game, actor, ticks, pose, shepherd, api) {
  // 403f0f/431193 retain ordered choices and the original 95/5, 45/45/10, and four-way weights.
  const d = actor.dir;
  const choices = (shepherd ? [d, (d + 3) % 4, (d + 1) % 4, OPPOSITE[d]] : [(d + 1) % 4, (d + 3) % 4, d, OPPOSITE[d]])
    .filter(dir => canMove(game, actor, dir, api));
  if (!choices.length) return false;
  const roll = integer(game, 100);
  const weights = choices.length === 2 ? [95, 100] : choices.length === 3 ? [45, 90, 100] : shepherd ? [75, 85, 95, 100] : [40, 80, 95, 100];
  const index = choices.length === 1 ? 0 : weights.findIndex(n => roll < n);
  return move(game, actor, choices[index], ticks, pose, api);
}
function explode(game, sheep, api) {
  if (game.interaction?.target === sheep.id) cancelInteraction(game);
  state(sheep, 'exploding', 'Sheep_exploding', 0, 0xb);
  sheep.duration = duration(game, sheep);
  api.addScore(game, 10); api.emit(game, 'sound', {key: 'ExplodingSheep'});
  for (const enemy of game.enemies) if (enemy.kind === 'dog') enemy.requestState = 'howl'; // 42b208 ->405ec7.
}
function updateSheep(game, sheep, api) {
  if (sheep.removed || sheep.hidden || sheep._abducted) return;
  if (!sheep.move && sheep.state === 'idle' && sheep.originalState === 0xe) sheep.state = 'demon';
  if (!sheep.satisfied && sheep.state !== 'interacting') setHappiness(sheep, rawHappiness(sheep) - 1); // 42ae87.
  if (sheep.pregnancyTime > 0 && --sheep.pregnancyTime === 0) {
    sheep.pregnancy++;
    if (sheep.pregnancy < 7) sheep.pregnancyTime = 20;
    else { explode(game, sheep, api); return; }
  }
  if (sheep.requestState) {
    const request = sheep.requestState; sheep.requestState = null;
    if (request === 'explode') { explode(game, sheep, api); return; }
    if (request === 'satisfied') { sheep.satisfied = true; setHappiness(sheep, 3000); idle(game, sheep); }
    if (request === 'abduct') { state(sheep, 'abducted', 'SheepFlying', duration(game, {...sheep, pose: 'SheepFlying'}), 0x13); }
    if (request === 'demon') { state(sheep, 'transform', 'Demon', DEMON.length, 0xd); api.emit(game, 'sound', {key: 'Devil'}); }
  }
  if (sheep.state === 'exploding' || sheep.state === 'abducted') {
    animate(game, sheep);
    if (sheep.stateTime >= sheep.duration) { sheep.hidden = sheep.removed = true; api.emit(game, 'sheep-removed', {id: sheep.id, reason: sheep.state}); }
  } else if (sheep.state === 'transform') {
    animate(game, sheep, 0, 20);
    if (sheep.stateTime >= sheep.duration) state(sheep, 'demon', 'DemonRun', 5, 0xe);
  } else if (sheep.state === 'demon') {
    animate(game, sheep);
    if (!sheep.move && distance(sheep, game.player) === 1) {
      const p = game.player;
      if (!p._abducted && p.mode !== 4 && !(p.invulnerableUntil > game.now) && !p.move && ['idle','electro'].includes(p.state)) {
        cancelInteraction(game); p.move = null; p.hidden = false; p.state = 'electro'; p.stateTime = 0;
        p.pose = 'Sven_electro'; p.poseOverride = null; p.frame = 0; p.originalState = 0x2b;
        p.electro = {target: sheep.id, phase: 'wait', elapsed: 0};
        state(sheep, 'shock', 'Demon', SHOCK.length, 0xf);
      } else { state(sheep, 'recover', 'Demon', RECOVER.length, 0x11); setHappiness(sheep, 1200 + integer(game, 300)); }
    } else if (!sheep.move) pursue(game, sheep, game.player, 8, 'DemonRun', api);
  } else if (sheep.state === 'shock') {
    animate(game, sheep);
    if (sheep.stateTime >= sheep.duration) {
      const p = game.player;
      if (p.state === 'electro') {
        api.addScore(game, p.originalState === 0x2b ? -50 : -20); // 434a6a: electro costs score, never a life.
        p.originalState = 0x2c; p.electro = {target: sheep.id, phase: 'loop', elapsed: 0};
      }
      state(sheep, 'recover', 'Demon', RECOVER.length, 0x10);
      setHappiness(sheep, 1200 + integer(game, 300)); api.emit(game, 'sound', {key: 'Lightning'});
    }
  } else if (sheep.state === 'interacting' || sheep.state === 'accept') {
    animate(game, sheep);
  } else if (sheep.state === 'recover') {
    animate(game, sheep);
    if (sheep.stateTime >= sheep.duration) {
      if (game.player.state === 'electro' && game.player.electro?.target === sheep.id) {
        game.player.originalState = 0x2d; game.player.electro.phase = 'recover'; game.player.electro.elapsed = 0;
      }
      idle(game, sheep);
    }
  } else if (sheep.move) {
    animate(game, sheep);
  } else if (sheep.state === 'walk' || (sheep.originalState === 2 && sheep.stateTime === 0)) {
    idle(game, sheep);
  } else if (sheep.state === 'graze') {
    // 42b208: three chewing cycles [0,12), then rise through [12,20).
    sheep.frame = sheep.stateTime < 72 ? Math.floor(sheep.stateTime * .5) % 12 : 12 + Math.min(7, sheep.stateTime - 72);
    if (sheep.stateTime >= 80) idle(game, sheep);
  } else if (!sheep.satisfied) {
    sheep.frame = 0;
    const band = mood(sheep);
    if (band !== sheep.previousMood && band === 0) setHappiness(sheep, -(299 - integer(game, 100))); // 42d08e case3.
    if (band !== sheep.previousMood && (band === 1 || band === 2) && game.now - (game.lastSheepMee ?? -4000) > 3000) {
      api.emit(game, 'sound', {key: 'Mee' + (1 + integer(game, 3))}); game.lastSheepMee = game.now;
    }
    if (band !== sheep.previousMood && band >= 11 && band <= 12 && band > sheep.previousMood) api.emit(game, 'sound', {key: 'Happy' + (1 + integer(game, 3))});
    if (band <= -3 || (band === -1 && band !== sheep.previousMood)) {
      // 42d08e case2: two-symbol cycle / .1 rate, one or two cycles until -600.
      setHappiness(sheep, band <= -3 ? 0 : -600 + (1 + integer(game, 2)) * 20);
      state(sheep, 'transform', 'Demon', DEMON.length, 0xd); api.emit(game, 'sound', {key: 'Devil'});
    } else if (band !== sheep.previousMood && (band === 1 || band === 2) && canMove(game, sheep, sheep.dir, api)) {
      sheep.previousMood = band;
      if (move(game, sheep, sheep.dir, 30, 'Sheep_walk', api)) { sheep.state = 'walk'; sheep.originalState = 2; }
    } else if (sheep.stateTime >= sheep.duration) {
      if (integer(game, 3) === 0 && sheep.dir >= 2) state(sheep, 'graze', 'Sheep_graze', 80, 3);
      else { if (integer(game, 3) !== 0) sheep.dir = integer(game, 4); idle(game, sheep); }
    }
    sheep.previousMood = band;
  }
  symbols(game, sheep);
}
function interactionPose(game, sheep) {
  if (sheep.kind === 'dog') return game.library?.poses?.actors?.[game.player.mode === 4 ? 'Alien_dogshag' : 'Dogshag']?.[DIRECTIONS[sheep.dir]];
  if (game.player.mode === 4) return game.library?.poses?.actors?.Alien_shag?.[DIRECTIONS[sheep.dir]];
  if (sheep.special && sheep.dir >= 2) return game.library?.poses?.interactions?.shag10?.[DIRECTIONS[sheep.dir]];
  const tables = game.library?.poses?.interactions ?? {};
  const candidates = INTERACTIONS[Math.min(19, game.levelIndex)].map(n => 'shag' + String(n).padStart(2, '0'))
    .map(key => tables[key]?.[DIRECTIONS[sheep.dir]]).filter(Boolean);
  if (!candidates.length) return null;
  if (sheep.interactionIndex == null || sheep.interactionIndex >= candidates.length) sheep.interactionIndex = integer(game, candidates.length);
  return candidates[sheep.interactionIndex];
}
function award(game, sheep, api) {
  const mode = game.player.mode ?? 1;
  api.addScore(game, POINTS[mode] ?? 0); // 42ecf3/42eb56.
  if (sheep.pregnancy === 0) {
    let h = rawHappiness(sheep);
    if (mode === 1 || mode === 5) h += 600;
    else if (mode === 2) h += 1200;
    else if (mode === 3) h = mood(sheep) < 1 ? 600 : 3000;
    else if (mode === 4) h = 3000;
    setHappiness(sheep, h);
    if (mood(sheep) > 9) sheep.pregnancy = mode === 4 ? 3 : 1;
  } else if (sheep.pregnancy === 1) sheep.pregnancy = mode === 2 || mode === 3 ? 3 : 2;
  else if (sheep.pregnancy === 2) sheep.pregnancy = 3;
  if (sheep.pregnancy >= 3 && sheep.pregnancyTime < 0) sheep.pregnancyTime = 20;
  api.emit(game, 'interaction-score', {id: sheep.id, points: POINTS[mode] ?? 0});
}
function beginCombined(game, sheep, api) {
  const pose = interactionPose(game, sheep);
  if (!pose) { cancelInteraction(game); return; }
  state(sheep, 'interacting', pose.key, 0, 6); sheep.poseOverride = pose;
  sheep.duration = duration(game, sheep);
  game.player.state = 'interacting'; game.player.originalState = 0x20; game.player.hidden = true;
  game.interaction.phase = 'combined'; game.interaction.elapsed = 0;
  if (sheep.kind !== 'dog') award(game, sheep, api);
  // 43217a/405c45: actors pursue when Sven enters combined interaction state0x20.
  for (const enemy of game.enemies) if (enemy !== sheep && enemy.state !== 'sleep') {
    if (!enemy.alert) enemy.stepsRemaining = 8 + Math.trunc((game.levelIndex + 1) * 9 / 20);
    enemy.alert = true;
  }
  api.emit(game, 'sound', {key: sheep.kind === 'dog' ? 'DogShag' : sheep.special && sheep.dir >= 2 && game.player.mode !== 4 ? 'ShagSpecial' : 'Shag' + String(1 + integer(game, 11)).padStart(2, '0')});
}
export function cancelInteraction(game) {
  const pair = game.interaction;
  if (!pair) return;
  const target = game.sheep.find(s => s.id === pair.target) ?? game.enemies.find(e => e.id === pair.target);
  if (target && (target.state === 'interacting' || target.state === 'accept')) {
    if (target.kind === 'dog') state(target, 'sleep', 'Dogsleep', Math.max(1, pair.totalTicks * 3), 0x3b);
    else idle(game, target);
  }
  game.player.hidden = false;
  if (game.player.state !== 'hurt' && game.player.state !== 'splash') {
    game.player.state = 'idle'; game.player.stateTime = 0;
    game.player.pose = game.player.mode === 4 ? 'Alien_stand' : 'Sven_stand';
  }
  game.interaction = null;
  for (const enemy of game.enemies) {
    if (enemy.kind === 'shepherd' && enemy.alert) enemy.pendingCall = true;
    if (enemy.kind !== 'dog' || enemy.state === 'sleep') enemy.alert = false;
  }
}
export function interact(game, api) {
  if (game.interaction) { game.interaction.repeat = true; return true; }
  const player = game.player;
  if (player.move || player.hidden || player.state === 'hurt' || player._specialInteraction) return false;
  const [dx,dy] = DELTAS[player.dir];
  const target = game.sheep.find(s => !s.removed && !s.hidden && !s.satisfied && !s.move && ['idle','graze'].includes(s.state) && s.duration - s.stateTime >= 2 && s.x === player.x + dx && s.y === player.y + dy)
    ?? game.enemies.find(e => e.kind === 'dog' && game.levelIndex >= 5 && !e.move && e.state === 'rest' && e.duration - e.stateTime >= 2 && e.dir === player.dir && e.x === player.x + dx && e.y === player.y + dy);
  if (target && target.dir === player.dir) {
    game.interaction = {target: target.id, phase: 'combined', elapsed: 0, repeat: false, totalTicks: 0};
    beginCombined(game, target, api); return true;
  }
  player.pose = player.mode === 4 ? 'AlienInvite' : 'SvenInvite'; player.stateTime = 0; player.state = 'invite';
  api.emit(game, 'sound', {key: 'Whistle'}); // 43707b state0x1f.
  if (!target) { player.duration = duration(game, player); return false; }
  game.interaction = {target: target.id, phase: 'invite', elapsed: 0, repeat: false, totalTicks: 0};
  return true;
}
function updateInteraction(game, api) {
  const pair = game.interaction;
  if (!pair) {
    if (game.player.state === 'invite') { animate(game, game.player); if (game.player.stateTime >= game.player.duration) { game.player.state = 'idle'; game.player.pose = game.player.mode === 4 ? 'Alien_stand' : 'Sven_stand'; } }
    return;
  }
  const sheep = game.sheep.find(s => s.id === pair.target) ?? game.enemies.find(e => e.id === pair.target);
  if (!sheep || sheep.removed || game.player.state === 'hurt' || game.phase !== 'playing') { cancelInteraction(game); return; }
  if (game.input?.direction != null || distance(game.player, sheep) !== 1 || game.player.move) { cancelInteraction(game); return; }
  pair.elapsed++; pair.totalTicks++;
  if (pair.phase === 'invite') {
    animate(game, game.player);
    if (pair.elapsed >= duration(game, game.player)) {
      if (sheep.move || !['idle','graze'].includes(sheep.state)) { cancelInteraction(game); return; }
      state(sheep, 'accept', 'SheepAccept', ACCEPT.length, 5); sheep.dir = game.player.dir;
      game.player.pose = game.player.mode === 4 ? 'Alien_stand' : 'Sven_stand';
      game.player.frame = 0; game.player.state = 'accept'; pair.phase = 'accept'; pair.elapsed = 0;
    }
  } else if (pair.phase === 'accept') {
    if (pair.elapsed >= sheep.duration) {
      if (game.input?.actionHeld || pair.repeat) beginCombined(game, sheep, api);
      else cancelInteraction(game);
    }
  } else if (pair.elapsed >= sheep.duration) {
    if (sheep.kind === 'dog') {
      api.addScore(game, 3); sheep.interactionCount = (sheep.interactionCount ?? 0) + 1; // 402cd1 state39 ->3a.
      const count = Math.max(2, 16 - Math.trunc((game.levelIndex + 1) * 14 / 20));
      if (sheep.interactionCount >= count + Math.trunc(count / 2)) { cancelInteraction(game); sheep.alert = true; return; }
    }
    if (game.input?.actionHeld || pair.repeat) { pair.repeat = false; beginCombined(game, sheep, api); }
    else cancelInteraction(game);
  }
}
function restEnemy(game, enemy, cooldown = false) {
  const level = game.levelIndex + 1, dog = enemy.kind === 'dog';
  const ticks = dog ? cooldown ? Math.max(20, (4 - Math.trunc(level * 3 / 20)) * 20) : Math.max(40, 100 - Math.trunc(level * 60 / 20)) : 100 + integer(game, 70);
  enemy.alert = false; enemy.stepsRemaining = 0;
  state(enemy, dog ? 'rest' : 'idle', dog ? 'Doglaydown' : 'Guy_stand', ticks, dog ? cooldown ? 0x38 : 0x32 : 0x3f);
}
function updateEnemy(game, enemy, api) {
  if (enemy._abducted || enemy.state === 'disabled') return;
  const dog = enemy.kind === 'dog', level = game.levelIndex + 1, player = game.player;
  if (enemy.waitingForRespawn) {
    if (player.state === 'hurt') { enemy.hidden = player.damagePhase !== 'fight'; return; }
    enemy.waitingForRespawn = false; enemy.hidden = false; enemy.move = null;
    enemy.x = enemy.spawnX; enemy.y = enemy.spawnY; enemy.dir = enemy.spawnDir;
    restEnemy(game, enemy); return;
  }
  if (enemy.hidden) return;
  if (enemy.state === 'interacting') { animate(game, enemy); return; }
  if (enemy.move) {
    const before = enemy.frame; animate(game, enemy);
    if (before !== enemy.frame && (enemy.frame === (dog ? 3 : 1) || enemy.frame === (dog ? 11 : 9))) api.emit(game, 'sound', {key: dog ? enemy.frame === 3 ? 'DogWalk1' : 'DogWalk2' : enemy.frame === 1 ? 'ShepherdWalk1' : 'ShepherdWalk2'});
    return;
  }
  const finishedMove = !!enemy.aiStepPending;
  enemy.aiStepPending = false;
  if (finishedMove && enemy.stepsRemaining > 0) enemy.stepsRemaining--;
  if (enemy.requestState === 'howl') {
    enemy.requestState = null; enemy.pendingCall = false; enemy.alert = false;
    enemy.dir = toward(enemy, player)[0]; state(enemy, 'howl', 'Doghowl', 0, 0x36);
    enemy.duration = duration(game, enemy) * 2; api.emit(game, 'sound', {key: 'DogBark'});
  }
  if (enemy.pendingCall) {
    enemy.pendingCall = false; enemy.dir = toward(enemy, player)[0];
    state(enemy, 'call', 'Guy_walk2', 0, 0x42); enemy.duration = duration(game, enemy);
    api.emit(game, 'sound', {key: 'ShepherdYell'});
  }
  if (enemy.state === 'sleep' || enemy.state === 'howl' || enemy.state === 'call') {
    animate(game, enemy, 0, frameCount(game, enemy), enemy.state === 'sleep' ? .15 : rate(game, enemy));
    if (enemy.stateTime >= enemy.duration) {
      if (enemy.state === 'howl') { state(enemy, 'chase', 'Dogrun', 0, 0x37); enemy.alert = true; enemy.stepsRemaining = 8 + Math.trunc(level * 17 / 20); }
      else restEnemy(game, enemy, enemy.state === 'sleep');
    }
    return;
  }
  const [frontX, frontY] = DELTAS[enemy.dir];
  const playerAhead = enemy.x + frontX === player.x && enemy.y + frontY === player.y;
  if (!player._abducted && player.state !== 'hurt' && (enemy.alert || (playerAhead && [0x33,0x40].includes(enemy.originalState))) && distance(enemy, player) === 1 && !(player.invulnerableUntil > game.now)) {
    if (api.damagePlayer(game, dog ? 'dog' : 'shepherd')) {
      enemy.pendingCall = false; enemy.alert = false; enemy.waitingForRespawn = true;
      state(enemy, 'catch', dog ? 'Dogrun' : 'Guy_walk2', 0, dog ? 0x3c : 0x43);
    }
    return;
  }
  if (enemy.alert) {
    if (!enemy.stepsRemaining && dog) { restEnemy(game, enemy, true); return; }
    enemy.state = 'chase'; enemy.originalState = dog ? 0x34 : 0x41;
    if (dog && game.now - enemy.lastBark > 4000 && (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2 < 21) { api.emit(game, 'sound', {key: 'DogBark'}); enemy.lastBark = game.now; }
    // 406050/43209b: cell duration is fixed; 4175dc AI timers count completed cells.
    if (pursue(game, enemy, player, dog ? 10 : 16, dog ? 'Dogrun' : 'Guy_walk', api)) enemy.aiStepPending = true;
    else restEnemy(game, enemy, true);
    return;
  }
  if (finishedMove && enemy.stepsRemaining <= 0) { restEnemy(game, enemy); return; }
  if (finishedMove || enemy.stateTime >= enemy.duration) {
    if (!enemy.stepsRemaining) enemy.stepsRemaining = dog ? 10 : Math.trunc((140 + Math.trunc(level * 140 / 40)) / 16);
    if (wander(game, enemy, dog ? 14 : 16, dog ? 'Dogwalk' : 'Guy_walk', !dog, api)) {
      enemy.state = 'walk'; enemy.originalState = dog ? 0x33 : 0x40; enemy.aiStepPending = true;
    } else restEnemy(game, enemy);
  } else enemy.frame = 0;
}
export function updateActors(game, api) {
  updateInteraction(game, api);
  for (const sheep of game.sheep) updateSheep(game, sheep, api);
  for (const enemy of game.enemies) updateEnemy(game, enemy, api);
  const p = game.player, electro = p.electro;
  if (electro && p.state !== 'electro') p.electro = null;
  else if (electro) {
    p.frame = electro.phase === 'wait' ? 0 : electro.phase === 'loop' ? [1,1,2,2][electro.elapsed % 4] : ELECTRO_TAIL[Math.min(electro.elapsed, ELECTRO_TAIL.length - 1)];
    if (++electro.elapsed >= ELECTRO_TAIL.length && electro.phase === 'recover') {
      p.electro = null; p.state = 'idle'; p.stateTime = 0; p.pose = 'Sven_stand'; p.frame = 0;
    }
  }
}
