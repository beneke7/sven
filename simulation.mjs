import { initializeActors, updateActors, interact, cancelInteraction, resetEnemiesAfterCapture } from './actors.mjs';
import { initializeSpecials, updateSpecials, interactSpecial } from './specials.mjs';

// Original game scene 0x41f643 requests 20 ticks/sec through 0x41c9f8/0x410b02.
export const TICK_MS = 50;
export const DIRECTIONS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
export const OPPOSITE = [2, 3, 0, 1];
const zone = { _: 1, '.': 2, a: 3 };
const pickupPoses = ['', 'Mushroom', 'Mushroom2', 'Mushroom4', 'Mushroom3', 'Mushroom5', 'Flower', 'Saint-Disc', 'Lightning', 'clock', 'EasterEgg'];

export function emit(game, type, data = {}) { game.events.push({ type, ...data }); }
export function terrainAt(game, x, y) { return game.campaign.terrain[x]?.[y] ?? '#'; }
const actors = game => [game.player, ...game.sheep, ...game.enemies].filter(Boolean);
const active = actor => !actor.removed && !actor._abducted;

export function canEnter(game, actor, x, y) {
  const terrain = terrainAt(game, x, y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || '#&'.includes(terrain)) return false;
  if (actor.kind !== 'sven' && 'cp'.includes(terrain)) return false;
  // 0x43694c: equal nonzero terrain zones cannot be crossed consecutively.
  const currentZone = zone[terrainAt(game, actor.x, actor.y)] ?? 0;
  if (currentZone && currentZone === zone[terrain]) return false;
  return ![...actors(game), ...(game.specialActors ?? []).filter(a => a.kind === 'mermaid' && !a.hidden)].some(other => other !== actor && active(other) &&
    ((other.x === x && other.y === y) || (other.move?.toX === x && other.move?.toY === y) ||
     (other.move?.fromX === x && other.move?.fromY === y)));
}

export function startMove(game, actor, dir, durationTicks = 8) {
  if (!DIRECTIONS[dir] || actor.move || !active(actor)) return false;
  const [dx, dy] = DIRECTIONS[dir], x = actor.x + dx, y = actor.y + dy;
  actor.dir = dir;
  if (!canEnter(game, actor, x, y)) return false;
  actor.move = { fromX: actor.x, fromY: actor.y, toX: x, toY: y, elapsed: 1, duration: Math.max(2, durationTicks) };
  updateLogicalCell(actor);
  actor.state = 'walking'; actor.stateTime = 0; actor.frame = 0;
  actor.pose = actor.kind === 'sven' ? (actor.mode === 4 ? 'Alien_walk' : 'Sven_walk') :
    actor.kind === 'sheep' ? 'Sheep_walk' : actor.kind === 'dog' ? 'Dogwalk' : 'Guy_walk';
  return true;
}

export function addScore(game, delta) {
  if (!Number.isFinite(delta)) throw new TypeError('Score delta must be finite');
  const previous = game.score;
  game.score = Math.max(0, game.score + Math.trunc(delta));
  if (delta > 0 && Math.floor(previous / 10) < Math.floor(game.score / 10)) emit(game, 'sound', { key: 'Points' });
  // 0x42a2cb crosses 50 once per call, queues a reward; it does not grant a life.
  if (delta > 0 && Math.floor(previous / 50) < Math.floor(game.score / 50)) game.pendingRewards++;
  return game.score;
}

function actor(kind, x, y, variant = '') {
  return { id: `${kind}-${x}-${y}`, kind, x, y, dir: 2, variant, state: 'idle', stateTime: 0, frame: 0,
    pose: kind === 'sven' ? 'Sven_stand' : kind === 'sheep' ? 'Sheep_graze' : kind === 'dog' ? 'Dogstand' : 'Guy_stand', hidden: false, move: null };
}

export function createGame(campaign, options = {}) {
  if (!campaign?.levels?.length || !Array.isArray(campaign.terrain)) throw new TypeError('An original campaign is required');
  let seed = (options.seed ?? 1) >>> 0;
  const game = { campaign, library: options.library ?? {}, metadata: options.metadata ?? {}, phase: 'playing',
    levelIndex: 0, score: 0, lives: 3, now: 0, tick: 0, timeLeft: 90000, accumulator: 0,
    player: null, sheep: [], enemies: [], pickups: [], effects: [], events: [], pendingRewards: 0,
    input: {}, random: () => { seed = (Math.imul(seed, 214013) + 2531011) >>> 0; return ((seed >>> 16) & 32767) / 32768; } };
  return loadLevel(game, options.levelIndex ?? 0, { fresh: true });
}

export function loadLevel(game, index, { fresh = false } = {}) {
  const level = game.campaign.levels[index];
  if (!level) throw new RangeError('Level index is outside this campaign');
  if (fresh) { game.score = 0; game.lives = 3; }
  game.levelIndex = index; game.phase = 'playing'; game.levelClearReady = false; game.timeLeft = 90000; game.accumulator = 0;
  game.sheep = []; game.enemies = []; game.pickups = []; game.effects = []; game.player = null;
  game.interaction = null; game.pendingRewards = 2; game.moodBonusAwarded = false; game.input = {}; game.actionPending = false;
  for (let x = 0; x < level.grid.length; x++) for (let y = 0; y < level.grid[x].length; y++) {
    const c = level.grid[x][y];
    if (c === 'f') game.player = { ...actor('sven', x, y, c), mode: 1, modeUntil: -1, invulnerableUntil: -1, spawnX: x, spawnY: y };
    else if ('enwsENWS'.includes(c)) game.sheep.push({ ...actor('sheep', x, y, c), dir: 'enws'.indexOf(c.toLowerCase()), sheepType: 'enws'.indexOf(c.toLowerCase()) + 1, special: c !== c.toLowerCase() && index >= 11 });
    else if (c === 'd' || c === 'm') game.enemies.push(actor(c === 'd' ? 'dog' : 'shepherd', x, y, c));
  }
  if (!game.player) throw new TypeError('Level has no original Sven spawn');
  initializeActors(game); initializeSpecials(game);
  emit(game, 'level-start', { level: index + 1 }); emit(game, 'sound', { key: 'StartSound' });
  return game;
}

export function nextLevel(game) {
  if (game.phase !== 'level-clear') return false;
  if (game.levelIndex + 1 >= game.campaign.levels.length) { game.phase = 'won'; return false; }
  loadLevel(game, game.levelIndex + 1); return true;
}

function idlePlayer(game) {
  const p = game.player;
  p.state = 'idle'; p.stateTime = 0; p.frame = 0; p.poseOverride = null; p.hidden = false;
  p.pose = p.mode === 4 ? 'Alien_stand' : 'Sven_stand';
  delete p.screenX; delete p.screenY;
}

function loseLife(game, reason) {
  game.lives = Math.max(0, game.lives - 1);
  emit(game, 'life-lost', { reason });
}
function finishDamage(game) {
  const p = game.player;
  if (!game.lives) {
    game.phase = 'game-over'; emit(game, 'sound', { key: 'GameOverSfx' });
  } else {
    if (p.damageReason !== 'timeout') resetEnemiesAfterCapture(game);
    respawnPlayer(game); p.mode = 1; p.modeUntil = -1; p.invulnerableUntil = -1;
    idlePlayer(game); game.timeLeft = 90000;
  }
  p.damagePhase = null;
}
export function damagePlayer(game, reason = 'caught') {
  const p = game.player;
  if (game.phase !== 'playing' || (reason !== 'timeout' && game.now < p.invulnerableUntil) || p.state === 'hurt') return false;
  cancelInteraction(game);
  p.move = null; p.hidden = false; p.state = 'hurt'; p.stateTime = 0;
  p.damageReason = reason;
  if (reason === 'timeout') {
    // 0x423cee decrements immediately, then 0x43707b state31 explodes at half rate.
    loseLife(game, reason); p.damagePhase = 'explode'; p.originalState = 0x31;
    p.pose = p.mode === 4 ? 'AlienExplode' : 'SvenExplode';
    p.damageRemaining = (game.library.images?.[p.pose]?.frames ?? 14) * 2;
    p.recoverTicks = p.damageRemaining; emit(game, 'sound', {key: 'Alarm'});
  } else {
    // 0x43707b: one Fight loop, 0x434a6a event29, eleven loops, then one recovery tick.
    p.pose = 'Fight'; p.damagePhase = 'fight'; p.originalState = 0x27;
    p.damageRemaining = game.library.images?.Fight?.frames ?? 5;
    p.recoverTicks = p.damageRemaining * 12 + 1;
    emit(game, 'sound', { key: 'SvenFight' });
  }
  p.poseOverride = game.library.poses?.single?.[p.pose] ?? null;
  return true;
}
function updateDamage(game) {
  const p = game.player;
  if (--p.damageRemaining > 0) return;
  if (p.damagePhase === 'fight') {
    loseLife(game, p.damageReason); p.damagePhase = 'aftermath'; p.originalState = 0x29;
    p.damageRemaining = (game.library.images?.Fight?.frames ?? 5) * 11; p.stateTime = 0;
  } else if (p.damagePhase === 'aftermath') {
    p.damagePhase = 'recover'; p.originalState = 0x2a; p.hidden = true; p.damageRemaining = 1;
  } else finishDamage(game);
}

function freeCells(game, actorToPlace, plainOnly = true) {
  const result = [];
  for (let x = 0; x < game.campaign.rows; x++) for (let y = 0; y < game.campaign.columns; y++) {
    if ((!plainOnly || terrainAt(game, x, y) === ' ') && canEnter(game, actorToPlace, x, y) && !game.pickups.some(p => !p.removed && p.x === x && p.y === y)) result.push([x, y]);
  }
  return result;
}

function respawnPlayer(game) {
  const p = game.player;
  let x = p.spawnX, y = p.spawnY;
  // 0x414e7d searches an expanding NE/NW/SW/SE spiral from the saved spawn.
  if (canEnter(game, p, x, y)) { p.x = x; p.y = y; return; }
  for (let length = 1; length <= 2 * Math.max(game.campaign.rows, game.campaign.columns); length++) {
    for (const dir of length % 2 ? [0, 1] : [2, 3]) {
      const [dx, dy] = DIRECTIONS[dir];
      for (let step = 0; step < length; step++) {
        x += dx; y += dy;
        if (terrainAt(game, x, y) === ' ' && canEnter(game, p, x, y)) { p.x = x; p.y = y; return; }
      }
    }
  }
}

function teleport(game) {
  const p = game.player, cells = freeCells(game, p);
  if (cells.length) [p.x, p.y] = cells[Math.floor(game.random() * cells.length)];
  p.move = null; idlePlayer(game);
  emit(game, 'teleport');
}

export function applyPickup(game, type) {
  const p = game.player;
  if ([1, 2, 5].includes(type) && p.mode !== 4) {
    p.mode = { 1: 2, 2: 3, 5: 5 }[type]; p.modeUntil = game.now + { 1: 10000, 2: 13000, 5: 5000 }[type];
  }
  if (type === 3) for (const sheep of game.sheep) if (!sheep.removed && sheep.happiness > 600) sheep.happiness = 600 + Math.floor(game.random() * 300);
  if (type === 6) for (const sheep of game.sheep) if (!sheep.removed && sheep.happiness <= 2700) sheep.happiness = sheep.happiness <= 0 ? 600 : Math.min(3000, sheep.happiness + 600);
  if (type === 7) { if (game.levelIndex >= 3) p.invulnerableUntil = game.now + 10000; else addScore(game, 10); }
  if (type === 8) { if (game.lives < 15) game.lives++; else if (game.levelIndex >= 3) p.invulnerableUntil = game.now + 10000; else addScore(game, 10); }
  if (type === 9) game.timeLeft += 20000;
  if (type === 10) addScore(game, 2);
  emit(game, 'pickup', { pickupType: type });
  emit(game, 'sound', { key: type === 1 ? 'MushMode' : [3, 5].includes(type) ? 'BadFlower' : type === 7 ? 'SvenSaint' : type === 8 ? 'Lightning' : 'GoodFlower' });
}

function enteredCell(game, p) {
  const pickup = game.pickups.find(v => !v.removed && v.x === p.x && v.y === p.y);
  if (pickup) { pickup.removed = true; applyPickup(game, pickup.type); }
  const terrain = terrainAt(game, p.x, p.y);
  // 0x43837e maps c->state1e (splash,-2), p->state2e (splash,teleport).
  if (terrain === 'c' || terrain === 'p') {
    p.state = 'splash'; p.stateTime = 0; p.pose = 'splash'; p.splashTicks = game.library.images?.splash?.frames ?? 14;
    if (terrain === 'c') addScore(game, -2);
    emit(game, 'sound', { key: 'Splash' });
  }
}

function updateLogicalCell(actor) {
  const m = actor.move;
  if (!m) return;
  const arrived = m.elapsed >= Math.trunc(m.duration / 2);
  actor.x = arrived ? m.toX : m.fromX; actor.y = arrived ? m.toY : m.fromY;
}

function advanceMove(game, a) {
  if (!a.move) return;
  // 0x41a0ba transfers logical occupancy halfway; rendering still interpolates the reserved endpoints.
  a.move.elapsed++; updateLogicalCell(a);
  if (a.move.elapsed >= a.move.duration) {
    a.x = a.move.toX; a.y = a.move.toY; a.move = null; a.state = 'idle'; a.stateTime = 0;
    if (a === game.player) { idlePlayer(game); enteredCell(game, a); }
  }
}

function spawnRewards(game) {
  while (game.pendingRewards > 0 && game.pickups.filter(p => !p.removed).length < 7) {
    game.pendingRewards--;
    const cells = freeCells(game, game.player);
    if (!cells.length) return;
    const [x, y] = cells[Math.floor(game.random() * cells.length)];
    const type = [1, 1, 2, 2, 3, 4, 4, 5, 6, 6][Math.floor(game.random() * 10)];
    game.pickups.push({ poseOverride: {key: pickupPoses[type], x: type === 1 ? -5 : type === 6 ? -7 : -12, bottom: type === 1 ? -2 : -3, flip: false, rate: 1}, id: `pickup-${game.tick}-${game.pickups.length}`, kind: 'pickup', x, y, type, pose: pickupPoses[type], frame: 0, hidden: false, age: 0 });
  }
}

function projectCell(game, x, y) {
  return {x: game.campaign.origin[0] + game.campaign.column_axis[0] * y + game.campaign.row_axis[0] * x,
    y: game.campaign.origin[1] + game.campaign.column_axis[1] * y + game.campaign.row_axis[1] * x};
}

export function spawnLambs(game) {
  // 0x416028 considers the first sheep seen from each end of every row/column.
  const sheep = game.sheep.filter(active), selected = new Map(), exits = [];
  const include = candidate => {
    if (candidate && (candidate.pregnancy >= 3 || candidate.happiness >= 2400)) selected.set(candidate.id, candidate);
  };
  for (let x = 0; x < game.campaign.rows; x++) {
    const row = sheep.filter(s => s.x === x).sort((a, b) => a.y - b.y);
    include(row[0]); include(row.at(-1));
    for (let y = 0; y < game.campaign.columns; y++) if (terrainAt(game, x, y) === '&') exits.push({x, y});
  }
  for (let y = 0; y < game.campaign.columns; y++) {
    const column = sheep.filter(s => s.y === y).sort((a, b) => a.x - b.x);
    include(column[0]); include(column.at(-1));
  }
  if (!exits.length) return 0;
  for (const sheep of selected.values()) {
    const exit = exits.reduce((best, cell) =>
      (cell.x - sheep.x) ** 2 + (cell.y - sheep.y) ** 2 < (best.x - sheep.x) ** 2 + (best.y - sheep.y) ** 2 ? cell : best);
    const from = projectCell(game, sheep.x, sheep.y), to = projectCell(game, exit.x, exit.y);
    from.y--;
    const right = from.x < to.x, down = from.y < to.y;
    const key = down ? 'Lamb01' : 'Lamb02';
    const offset = right ? (down ? [-12, -20] : [-16, -30]) : (down ? [-27, -20] : [-22, -30]);
    const targetX = to.x + Math.floor(game.random() * 40) - 20;
    const targetY = to.y + Math.floor(game.random() * 30) - 15;
    const duration = 15 + Math.floor(game.random() * 5);
    game.effects.push({kind: 'lamb', key, screen: true, x: from.x, y: from.y, fromX: from.x, fromY: from.y,
      targetX, targetY, age: 0, duration, frame: 0, sourceSheep: sheep.id,
      poseOverride: {key, x: offset[0], bottom: offset[1], flip: right === down, rate: 1}});
  }
  emit(game, 'lambs-spawned', {count: selected.size});
  return selected.size;
}

function updateEffects(game) {
  for (const effect of game.effects) {
    effect.age = (effect.age ?? 0) + 1;
    if (effect.kind === 'lamb') {
      const part = Math.min(1, effect.age / effect.duration);
      effect.x = Math.trunc(effect.fromX * (1 - part) + effect.targetX * part);
      effect.y = Math.trunc(effect.fromY * (1 - part) + effect.targetY * part);
      effect.frame = effect.age % (game.library.images?.[effect.key]?.frames ?? 15);
    }
  }
  // 0x424b7f removes each finished CTween; it never changes the level deadline.
  game.effects = game.effects.filter(e => e.duration == null || e.age < e.duration);
}

const api = { random: game => game.random(), canEnter, startMove, addScore, damagePlayer, emit };
function tickGame(game) {
  game.now += TICK_MS; game.tick++; game.timeLeft = Math.max(0, game.timeLeft - TICK_MS);
  for (const a of actors(game)) { a.stateTime++; advanceMove(game, a); }
  const p = game.player;
  if (p.move && game.input.direction === OPPOSITE[p.dir]) {
    const m = p.move; [m.fromX, m.toX] = [m.toX, m.fromX]; [m.fromY, m.toY] = [m.toY, m.fromY];
    m.elapsed = m.duration - m.elapsed; p.dir = game.input.direction; updateLogicalCell(p);
  }
  if (!p.move && p.modeUntil > 0 && p.modeUntil < game.now) { p.mode = 1; p.modeUntil = -1; }
  if (p.state === 'hurt') {
    updateDamage(game);
  } else if (p.state === 'splash') {
    if (p.stateTime >= p.splashTicks) teleport(game);
  } else if (p.state === 'electro') {
    // 0x434a6a states2b/2c: actors own the score-loss shock sequence.
  } else {
    if (game.actionPending && !p.move) { if (!interact(game, api)) interactSpecial(game, api); game.actionPending = false; }
    if (game.input.direction != null && p.state !== 'interacting' && !p.move) startMove(game, p, game.input.direction, [2, 4].includes(p.mode) ? 3 : p.mode === 5 ? 12 : 8);
  }
  updateActors(game, api);
  updateSpecials(game, api);
  if (p.state === 'walking') {
    const walkKey = (p.mode === 4 ? 'Alien_walk' : 'Sven_walk') + (p.dir === 0 || p.dir === 1 ? '02' : '01');
    const frames = game.library.images?.[walkKey]?.frames ?? 14;
    const rate = ([2, 4].includes(p.mode) ? 2 : p.mode === 5 ? 0.5 : 1) / 0.75;
    p.frame = Math.floor(p.stateTime * rate) % frames;
  } else if (p.state === 'splash') p.frame = p.stateTime;
  else if (p.state === 'hurt') p.frame = Math.floor(p.stateTime * (p.damagePhase === 'explode' ? 0.5 : 1)) % (game.library.images?.[p.pose]?.frames ?? 5);
  spawnRewards(game);
  for (const pickup of game.pickups) pickup.age++;
  game.pickups = game.pickups.filter(p => !p.removed);
  updateEffects(game);
  const total = game.sheep.reduce((sum, s) => sum + Math.max(0, s.happiness), 0);
  if (!game.moodBonusAwarded && game.sheep.length && Math.trunc(total * 100 / (game.sheep.length * 3000)) > 90) {
    game.moodBonusAwarded = true; addScore(game, 30); spawnLambs(game); emit(game, 'mood-bonus');
  }
  if (game.phase === 'playing' && game.sheep.length && game.sheep.every(s => s.satisfied || s.removed)) {
    addScore(game, (game.levelIndex + 1) * 5); addScore(game, Math.floor(game.timeLeft / 1000));
    game.phase = game.levelIndex === game.campaign.levels.length - 1 ? 'won' : 'level-clear';
    game.levelClearReady = true;
    emit(game, 'level-clear', { level: game.levelIndex + 1 });
  } else if (game.phase === 'playing' && !game.timeLeft) damagePlayer(game, 'timeout');
}

export function stepGame(game, input = {}, dtMs = 0) {
  if (!Number.isFinite(dtMs) || dtMs < 0) throw new RangeError('Time delta must be a nonnegative finite number');
  game.input = { direction: null, actionHeld: false, ...input };
  game.actionPending ||= Boolean(input.actionPressed);
  if (game.phase !== 'playing' || game.paused) return game;
  game.accumulator += dtMs;
  while (game.accumulator + 1e-7 >= TICK_MS && game.phase === 'playing') { game.accumulator -= TICK_MS; tickGame(game); }
  return game;
}
