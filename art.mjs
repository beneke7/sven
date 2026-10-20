const DIRECTIONS = ['ne', 'nw', 'sw', 'se'];

// The original animation reader (0x407cfe) advances down a column first.
export function atlasFrame(atlas, frame = 0) {
  const count = atlas.frames, f = ((Math.floor(frame) % count) + count) % count;
  const width = atlas.size[0] / atlas.columns, height = atlas.size[1] / atlas.rows;
  return { x: Math.floor(f / atlas.rows) * width, y: (f % atlas.rows) * height, width, height };
}

export function project(campaign, x, y) {
  return { x: campaign.origin[0] + campaign.column_axis[0] * y + campaign.row_axis[0] * x,
    y: campaign.origin[1] + campaign.column_axis[1] * y + campaign.row_axis[1] * x };
}

export function renderCell(actor) {
  if (!actor.move) return { x: actor.x, y: actor.y };
  const move = actor.move, part = Math.max(0, Math.min(1, move.elapsed / move.duration));
  return { x: move.fromX + (move.toX - move.fromX) * part,
    y: move.fromY + (move.toY - move.fromY) * part };
}

export class ClassicArt {
  constructor(canvas, library) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.library = library;
    this.images = {};
    this.missing = new Set();
    this.sprites = 0;
  }

  async load(onProgress = () => {}) {
    let loaded = 0;
    const entries = Object.entries({ ...this.library.images, ...this.library.rawBitmaps });
    await Promise.all(entries.map(async ([key, atlas]) => {
      const image = new Image(); image.src = new URL(atlas.path, import.meta.url).href;
      await image.decode();
      if (image.naturalWidth !== atlas.size[0] || image.naturalHeight !== atlas.size[1]) throw new Error(`Ungültige Grafik: ${key}`);
      this.images[key] = image;
      onProgress(++loaded, entries.length);
    }));
  }

  image(key, frame, x, y, flip = false, options = {}) {
    const atlas = this.library.images[key] || this.library.rawBitmaps?.[key], image = this.images[key];
    if (!atlas || !image) { this.missing.add(key); return false; }
    const f = atlasFrame(atlas, frame);
    const c = this.ctx; c.save();
    c.translate(Math.round(x) + (flip ? f.width : 0), Math.round(y));
    if (flip) c.scale(-1, 1);
    if (options.scaleY != null) c.scale(1, options.scaleY);
    if (options.opacity != null) c.globalAlpha = options.opacity;
    c.drawImage(image, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
    c.restore(); this.sprites++;
    return true;
  }

  centered(key, x, y, frame = 0) {
    const atlas = this.library.images[key] || this.library.rawBitmaps?.[key]; if (!atlas) return false;
    const f = atlasFrame(atlas, frame);
    return this.image(key, frame, x - f.width / 2, y - f.height / 2);
  }

  text(text, x, y, size = 20, color = '#ad0d27', align = 'left') {
    const c = this.ctx;
    c.fillStyle = color; c.font = `bold ${size}px "Comic Sans MS", "Chalkboard SE", cursive`;
    c.textAlign = align; c.textBaseline = 'middle'; c.fillText(String(text), x, y);
  }

  background(key, fill = '#82d2ff') {
    this.sprites = 0; this.ctx.fillStyle = fill; this.ctx.fillRect(0, 0, 640, 480);
    this.image(key, 0, 0, 0);
  }

  resolvePose(actor) {
    if (actor.poseOverride) return actor.poseOverride;
    const group = this.library.poses.actors[actor.pose];
    if (group) return group[DIRECTIONS[actor.dir]] || Object.values(group)[0];
    if (this.library.poses.single?.[actor.pose]) return this.library.poses.single[actor.pose];
    if (this.library.images[actor.pose]) {
      const atlas = this.library.images[actor.pose], f = atlasFrame(atlas);
      return { key: actor.pose, x: -f.width / 2, bottom: 8, flip: actor.flip || false };
    }
    this.missing.add(actor.pose);
    return this.library.poses.actors[actor.kind === 'sven' ? 'Sven_stand' : actor.kind === 'sheep' ? 'Sheep_walk' : actor.kind === 'dog' ? 'Dogwalk' : 'Guy_stand']?.[DIRECTIONS[actor.dir]];
  }

  refractiveUfo(actor) {
    const pose = actor.poseOverride, mask = this.images[actor.maskKey];
    if (!mask || !this.backgroundCanvas) return;
    if (!this.hullCanvas) {
      this.hullCanvas = document.createElement('canvas');
      this.hullCanvas.width = mask.naturalWidth; this.hullCanvas.height = mask.naturalHeight;
    }
    const left = Math.round(actor.screenX + pose.x), top = Math.round(actor.screenY + pose.bottom - mask.naturalHeight);
    const c = this.hullCanvas.getContext('2d');
    c.clearRect(0, 0, mask.naturalWidth, mask.naturalHeight);
    c.drawImage(this.backgroundCanvas, -left - 2, -top + 3);
    c.globalAlpha = .22;
    c.drawImage(this.images.CloudsShaded, 0, 0, mask.naturalWidth, mask.naturalHeight);
    c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = 'source-over'; this.ctx.drawImage(this.hullCanvas, left, top); this.sprites++;
  }

  actor(actor, campaign, now = 0) {
    if (actor.hidden || actor.removed || actor.state === 'removed') return;
    if (actor.renderKind === 'refractive-ufo') { this.refractiveUfo(actor); return; }
    const pose = this.resolvePose(actor); if (!pose) return;
    const atlas = this.library.images[pose.key]; if (!atlas) { this.missing.add(pose.key); return; }
    const cell = renderCell(actor), at = actor.screenX != null ? {x:actor.screenX,y:actor.screenY} : project(campaign, cell.x, cell.y), f = atlasFrame(atlas, actor.frame || 0);
    const left = at.x + (pose.flip ? -pose.x - f.width : pose.x);
    this.image(pose.key, actor.frame || 0, left, at.y + pose.bottom - f.height, pose.flip);
    if (actor.symbolFrame != null) {
      const symbol = this.library.poses.actors[actor.kind === 'dog' ? 'DogSymbols' : 'SheepSymbols']?.[DIRECTIONS[actor.dir]];
      this.image('Symbols', actor.symbolFrame, at.x + (symbol?.x ?? -12), at.y + (symbol?.bottom ?? -47) - 32);
    }
    if (actor.kind === 'sven' && actor.invulnerableUntil > now) {
      const halo = this.library.poses.actors[actor.move ? 'SaintDisc_walk' : 'SaintDisc_stand']?.[DIRECTIONS[actor.dir]];
      if (halo) this.image(halo.key, 0, at.x + halo.x, at.y + halo.bottom - 18, halo.flip);
    }
  }

  game(game) {
    const c = this.ctx;
    this.background('GameBkgnd', this.library.metadata?.scenery?.waterColor || '#82d2ff');
    for (let y = 0; y < game.campaign.rows; y++) for (let x = 0; x < game.campaign.columns; x++) {
      if (game.campaign.terrain[y][x] !== 'p') continue;
      const at = project(game.campaign, y, x);
      this.centered(`Puddle${String((x + y) % 7 + 1).padStart(2, '0')}`, at.x, at.y);
    }
    if (game.specialActors?.some(a => a.renderKind === 'refractive-ufo' && !a.hidden)) {
      this.backgroundCanvas ||= document.createElement('canvas');
      if (this.backgroundCanvas.width !== 640) { this.backgroundCanvas.width = 640; this.backgroundCanvas.height = 480; }
      this.backgroundCanvas.getContext('2d').drawImage(this.canvas, 0, 0);
    }
    for (const pickup of game.pickups) {
      if (pickup.hidden || pickup.removed) continue;
      this.actor(pickup, game.campaign, game.now);
    }
    const actors = [game.player, ...game.sheep, ...game.enemies, ...game.specialActors || []].filter(Boolean);
    actors.sort((a, b) => {
      const ac = renderCell(a), bc = renderCell(b);
      return (a.overlay ? 10000 : a.screenY ?? project(game.campaign, ac.x, ac.y).y) - (b.overlay ? 10000 : b.screenY ?? project(game.campaign, bc.x, bc.y).y);
    });
    for (const actor of actors) this.actor(actor, game.campaign, game.now);
    for (const effect of game.effects) {
      const key = effect.poseOverride?.key || effect.key || effect.pose;
      if (!key) continue;
      const at = effect.screen ? { x: effect.x, y: effect.y } : project(game.campaign, effect.x, effect.y);
      const atlas = this.library.images[key] || this.library.rawBitmaps?.[key];
      if (!atlas) { this.missing.add(key); continue; }
      const f = atlasFrame(atlas);
      const p = effect.poseOverride;
      const left = p ? at.x + (p.flip ? -p.x - f.width : p.x) : at.x - f.width / 2;
      const top = p ? at.y + p.bottom - f.height : at.y - f.height / 2;
      this.image(key, effect.frame || 0, left, top, p?.flip ?? effect.flip ?? false,
        {scaleY:effect.scaleY ?? 1,opacity:effect.opacity ?? (key === 'LightBeam2' ? .5 : 1)});
    }
    for (const patch of this.library.metadata?.scenery?.foreground || []) this.image(patch.key, 0, patch.x, patch.y);
    this.image('clock', 0, 18, 5);
    const seconds = Math.max(0, Math.ceil(game.timeLeft / 1000));
    this.text(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, 52, 44, 20, '#ad0d27', 'center');
    this.image('score_table', 0, 497, 11);
    this.text(game.score, 608, 34, 20, '#ad0d27', 'right');
    for (let i = 0; i < Math.max(0, game.lives - 1); i++) this.image('SvenIcon', 0, 7 + 37 * i, 445);
    this.text(`Level: ${game.levelIndex + 1}`, 634, 466, 20, '#ad0d27', 'right');
    if (game.player.mode > 1) {
      const keys = { 2: 'Mushroom', 3: 'Mushroom3', 4: 'Alien_stand01', 5: 'Mushroom2' };
      const key = keys[game.player.mode];
      if (key) this.centered(key, 602, 432);
    }
    if (game.flash > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(.8, game.flash)})`; c.fillRect(0, 0, 640, 480); }
  }
}

export class ClassicAudio {
  constructor(library) { this.library = library; this.enabled = true; this.context = null; this.buffers = new Map(); this.musicSource = null; this.musicKey = null; this.musicPending = null; this.musicGeneration = 0; this.voices = new Set(); }
  async unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    this.context ||= new Audio();
    if (this.context.state === 'suspended') await this.context.resume();
  }
  async buffer(key) {
    const path = this.library.sounds[key]; if (!path || !this.context) return null;
    if (!this.buffers.has(key)) this.buffers.set(key, (async () => {
      const response = await fetch(new URL(path, import.meta.url));
      if (!response.ok) throw new Error(`Sound ${key}: ${response.status}`);
      return this.context.decodeAudioData(await response.arrayBuffer());
    })());
    return this.buffers.get(key);
  }
  async play(key, { loop = false, gain = .6 } = {}) {
    if (!this.enabled || !this.context || this.voices.size > 12) return null;
    try {
      const buffer = await this.buffer(key); if (!buffer || !this.enabled) return null;
      const source = this.context.createBufferSource(), volume = this.context.createGain();
      source.buffer = buffer; source.loop = loop; volume.gain.value = gain;
      source.connect(volume); volume.connect(this.context.destination); this.voices.add(source);
      source.onended = () => { this.voices.delete(source); volume.disconnect(); source.disconnect(); };
      source.start(); return source;
    } catch (error) { console.warn(error.message); return null; }
  }
  async music(key) {
    if (key === this.musicKey && (this.musicSource || this.musicPending)) return this.musicPending;
    const generation = ++this.musicGeneration;
    if (this.musicSource) this.musicSource.stop(); this.musicSource = null; this.musicKey = key;
    this.musicPending = null;
    if (key) {
      this.musicPending = this.play(key, { loop: true, gain: .22 }).then(source => {
        if (generation === this.musicGeneration && this.enabled) this.musicSource = source;
        else source?.stop();
      }).finally(() => { if (generation === this.musicGeneration) this.musicPending = null; });
      return this.musicPending;
    }
  }
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) { this.musicGeneration++; this.musicPending = null; for (const source of this.voices) source.stop(); this.musicSource = null; }
    return this.enabled;
  }
}
