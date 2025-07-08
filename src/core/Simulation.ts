// Simulation.ts
import * as PIXI from 'pixi.js';
import { Stickman } from './Stickman';
import { StickmanSprite } from '../graphics/StickmanSprite';
import { Camera } from './Camera';
import { Fish } from './Fish';
import { FishSprite } from '@/graphics/FishSprite';
import { State } from './Stickman';

enum GroupPhase { Forming, Holding, Disbanding};
type GroupState = Crowd['state'];

interface Crowd {
  id: number;
  members: Stickman[];
  state:'SeekQuiet'|'Roam'|'Chase'|'Flee'|'Disband';
  timer: number;
 duration: number;
  target?: PIXI.Point;
  memberTargets?: PIXI.Point[];    // ← per-stickman destinations
  hasRoamTargets?: boolean;        // ← flag so we only assign once
  hasQuietTargets?: boolean;
}

const STATE_DUR: Record<Crowd['state'], number> = {
  SeekQuiet: 800,
  Roam:      1000,
  Chase:     600,
  Flee:      800,
  Disband:    60,
};

export class Simulation {
  app: PIXI.Application;
  stickmen: Stickman[] = [];
  sprites: StickmanSprite[] = [];
  fishes: Fish[] = [];
  fishSprites: FishSprite[] = [];
  camera: Camera;
  worldContainer: PIXI.Container;
  private homes: PIXI.Point[] = [];

  // store the current mouse position in world‐space
  private mouseWorld = { x: 0, y: 0 };
  private mouthDebug: PIXI.Graphics;

  private groupPhase: GroupPhase = GroupPhase.Forming;
  private groupTimer = 0;
  private readonly FORMING_DURATION  = 1000;  // frames
  private readonly HOLDING_DURATION  = 6000;
  private readonly DISBAND_DURATION  =  1000;
  private nextGroupId = 1;  // incrementing cluster id
  private groupTargets: Record<number, PIXI.Point> = {}; // rally points
  private crowds: Crowd[] = [];                        // holding-phase FSMs

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application();
    this.camera = new Camera();
    this.worldContainer = new PIXI.Container();
    this.mouthDebug = new PIXI.Graphics();
    this.worldContainer.addChild(this.mouthDebug);

    this.init(canvas);
  }

  async init(canvas: HTMLCanvasElement) {
    await this.app.init({
      canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0xffffff,
      antialias: true,
    });

    this.app.stage.addChild(this.worldContainer);

    // initial mouse pos at center
    const center = this.camera.screenToWorld(
      window.innerWidth / 2,
      window.innerHeight / 2
    );
    this.mouseWorld.x = center.x;
    this.mouseWorld.y = center.y;

    // Create initial stickmen
    for (let i = 0; i < 5; i++) {
      this.spawnStickman(
        Math.random() * 400 + 200,
        Math.random() * 300 + 200
      );
    }

    const computeCentroid = (pts: { x: number; y: number }[]) => {
      const n = pts.length;
      if (n === 0) return new PIXI.Point(0, 0);
      const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      return new PIXI.Point(sum.x / n, sum.y / n);
    };

    this.homes.push(computeCentroid(this.stickmen.map(s => ({ x: s.x, y: s.y }))));

    // Create our fish
    /*
    const fish = new Fish(window.innerWidth / 2, window.innerHeight / 2);
    const fishSprite = new FishSprite(fish);
    this.fishes.push(fish);
    this.fishSprites.push(fishSprite);
    this.worldContainer.addChild(fishSprite);
    */

    this.setupInputHandlers();
    this.startGameLoop();
  }

  spawnStickman(x: number, y: number) {
    const stickman = new Stickman(x, y);
    const sprite = new StickmanSprite(stickman);
    this.stickmen.push(stickman);
    this.sprites.push(sprite);
    this.worldContainer.addChild(sprite);
    console.log(`Spawned stickman at (${x.toFixed(1)}, ${y.toFixed(1)})`);
  }

  setupInputHandlers() {
  const canvas = this.app.view as HTMLCanvasElement;

  //–– EXISTING POINTER HANDLERS (spawn + mouse‐drag + wheel zoom) ––

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) {
        const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
        this.spawnStickman(worldPos.x, worldPos.y);
      } else if (e.button === 2) {
        this.camera.startDrag(e.clientX, e.clientY);
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      this.camera.updateDrag(e.clientX, e.clientY);
      const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
      this.mouseWorld.x = worldPos.x;
      this.mouseWorld.y = worldPos.y;
    }
  });

  canvas.addEventListener('pointerup', () => {
    this.camera.stopDrag();
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    this.camera.setZoom(this.camera.targetZoom * zoomFactor);
  });

  // prevent right‐click menu
  canvas.addEventListener('contextmenu', e => e.preventDefault());


  //–– TOUCH: add tap detection ––
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  function getTouchDist(t0: Touch, t1: Touch) {
    const dx = t1.clientX - t0.clientX;
    const dy = t1.clientY - t0.clientY;
    return Math.hypot(dx, dy);
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    // record first finger for tap detection
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
      // ALSO start pan
      this.camera.startDrag(t.clientX, t.clientY);
    }
    else if (e.touches.length === 2) {
      // pinch start
      pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
      pinchStartZoom = this.camera.targetZoom;
      this.camera.stopDrag();
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      // pan
      const t = e.touches[0];
      this.camera.updateDrag(t.clientX, t.clientY);
      const world = this.camera.screenToWorld(t.clientX, t.clientY);
      this.mouseWorld.x = world.x;
      this.mouseWorld.y = world.y;
    }
    else if (e.touches.length === 2) {
      // pinch‐to‐zoom
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const scale = dist / pinchStartDist;
      this.camera.setZoom(pinchStartZoom * scale);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    // if it was a quick, almost‐stationary tap → spawn
    const dt = Date.now() - touchStartTime;
    if (e.touches.length === 0 && dt < 200) {
      const dx = (e.changedTouches[0].clientX - touchStartX);
      const dy = (e.changedTouches[0].clientY - touchStartY);
      if (dx*dx + dy*dy < 25*25) {  // moved less than ~25px
        const world = this.camera.screenToWorld(
          e.changedTouches[0].clientX,
          e.changedTouches[0].clientY
        );
        this.spawnStickman(world.x, world.y);
      }
    }
    // always stop any lingering pan
    if (e.touches.length === 0) {
      this.camera.stopDrag();
    }
  }, { passive: false });


  //–– window‐resize stays the same ––

  window.addEventListener('resize', () => {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  });
}


  startGameLoop() {
    this.app.ticker.add(() => {
      this.update();
      this.render();
    });
  }

  update() {
    
    this.groupTimer++;
    const eps = 80;
    if (this.groupPhase===GroupPhase.Holding && this.groupTimer===1) {
      // build crowds[]
      this.crowds = [];
      for (let cid=1; cid<this.nextGroupId; cid++) {
        const members = this.stickmen.filter(s=>s.groupId===cid);
        this.crowds.push({
          id: cid,
          members,
          state: 'Roam',    // first thing is always roam
          timer: 0,
          duration: STATE_DUR.Roam,
        });
      }
    }

    const GROUP_DETECTION_RADIUS = eps * 10;
    const BUFFER = 8; 
    const STEP_FACTOR = 0.0025;  // or whatever you had
    switch (this.groupPhase) {
      case GroupPhase.Forming:
        if (this.groupTimer === 1) this.formGroups(); 
          this.stickmen.forEach(s => {
          if (s.groupId != null) {
            const pt = this.groupTargets[s.groupId]!;
            s.dx = Math.cos(Math.atan2(pt.y - s.y, pt.x - s.x)) * s.walkSpeed;
            s.dy = Math.sin(Math.atan2(pt.y - s.y, pt.x - s.x)) * s.walkSpeed;
            s.x += s.dx; s.y += s.dy;
            // (you can still call updateSkeleton if you want them animated)
            return; // skip their solo FSM
          }
        });
        if (this.groupTimer > this.FORMING_DURATION) this.advancePhase();
        break;
      case GroupPhase.Holding:
       
       this.crowds.forEach(c => {
        c.timer++;

        const cx = c.members.reduce((sum, s) => sum + s.x, 0) / c.members.length;
        const cy = c.members.reduce((sum, s) => sum + s.y, 0) / c.members.length;
        
        const seesFish = this.fishes.some(f => {
          const dx = f.head.x - cx, dy = f.head.y - cy;
          return dx*dx + dy*dy < GROUP_DETECTION_RADIUS*GROUP_DETECTION_RADIUS;
        });
        if (seesFish && c.state !== 'Flee') {
          c.state    = 'Flee';
          c.duration = STATE_DUR.Flee;
          c.timer    = 0;
          c.target   = undefined;  // you’ll run away from the fish centroid below
          console.log(`Crowd ${c.id} spotted a fish, switching to Flee!`);
        }

        if (c.state !== 'SeekQuiet') {
          c.hasQuietTargets = false;
        }

        if (c.state !== 'Roam') {
          c.hasRoamTargets = false;
        }

        if (c.state !== 'Chase') {
          c.target = undefined;
        }

        if (c.timer > c.duration) {
        c.state    = pickGroupNextState(c);
        c.duration = STATE_DUR[c.state];
        c.timer = 0;

      // inside your per‐frame update, after you know c.state === 'Roam

      console.log(`Crowd ${c.id} → ${c.state}`);
    }
    const myRally = this.groupTargets[c.id]!;
    // now instruct each member according to c.state:
    c.members.forEach(s => {
      switch(c.state) {
        
        case 'Chase': {
    // ← one‐time initialization on state‐enter
    if (!c.target) {
      // find the nearest other crowd’s rally‐point
      const others = this.crowds.filter(c2 => c2.id !== c.id && this.groupTargets[c2.id]);
      if (others.length) {
        const closest = others.reduce((best, c2) => {
          const theirR = this.groupTargets[c2.id]!;
          const myR     = myRally; // you already computed myRally = this.groupTargets[c.id]
          const d2      = (theirR.x - myR.x)**2 + (theirR.y - myR.y)**2;
          return d2 < best.d2 ? { crowd: c2, d2 } : best;
        }, { crowd: others[0], d2: Infinity });
        c.target = this.groupTargets[closest.crowd.id];
      }
    }

    // if we have a valid target, move toward it
    if (c.target) {
      const dx = c.target.x - s.x;
      const dy = c.target.y - s.y;
      const mag = Math.hypot(dx, dy) || 1;
      s.dx = (dx / mag) * s.walkSpeed;
      s.dy = (dy / mag) * s.walkSpeed;
      s.x += s.dx;
      s.y += s.dy;
    }
    break;
  }

  case 'Flee': {
    // compute centroid of all fish heads
    const avg = this.fishes.reduce((acc, f) => {
      acc.x += f.head.x; acc.y += f.head.y;
      return acc;
    }, { x: 0, y: 0 });
    avg.x /= this.fishes.length; avg.y /= this.fishes.length;
    // run directly away from that point
    const dx = s.x - avg.x, dy = s.y - avg.y;
    const mag = Math.hypot(dx, dy) || 1;
    s.dx = (dx / mag) * s.walkSpeed * 1.5;   // a bit faster
    s.dy = (dy / mag) * s.walkSpeed * 1.5;
    s.x += s.dx; s.y += s.dy;
    break;
  }

   case 'Roam': {
  // step‐factor & buffer are in your outer scope
  const circleR       = eps * 7;     // scatter radius
  const centerOffsetR = eps * 12;    // how far the roam‐center sits from the crowd

  // helper to pick a new roam‐center + personal targets
  const pickNewRoam = () => {
    // 1) crowd centroid
    const cx = c.members.reduce((sum, s) => sum + s.x, 0) / c.members.length;
    const cy = c.members.reduce((sum, s) => sum + s.y, 0) / c.members.length;
    const crowdCenter = new PIXI.Point(cx, cy);

    // 2) roam‐center some distance away
    const a0   = Math.random() * Math.PI * 2;
    const r0   = centerOffsetR + Math.random() * centerOffsetR;
    const roamCenter = new PIXI.Point(
      crowdCenter.x + Math.cos(a0) * r0,
      crowdCenter.y + Math.sin(a0) * r0
    );

    // 3) scatter per‐member targets around that roam‐center
    c.memberTargets = c.members.map(() => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * circleR;
      return new PIXI.Point(
        roamCenter.x + Math.cos(a) * r,
        roamCenter.y + Math.sin(a) * r
      );
    });
  };

  // initialize on state‐enter
  if (!c.hasRoamTargets) {
    c.hasRoamTargets = true;
    pickNewRoam();
  }

  // move each frame; when someone “arrives” we re‐pick an entirely new roam‐center + targets
  c.members.forEach((s, idx) => {
    const dest  = c.memberTargets![idx];
    const dx    = dest.x - s.x;
    const dy    = dest.y - s.y;
    const dist2 = dx*dx + dy*dy;

    if (dist2 < BUFFER*BUFFER) {
      // arrived → new roam‐center + fresh targets
      pickNewRoam();
      return;
    }

    // otherwise step toward personal target
    const mag = Math.sqrt(dist2) || 1;
    s.dx = (dx / mag) * s.walkSpeed;
    s.dy = (dy / mag) * s.walkSpeed;
    s.x  += s.dx * STEP_FACTOR;
    s.y  += s.dy * STEP_FACTOR;
  });

  break;
}


case 'SeekQuiet': {
  // ← one-time initialization on state-enter
  if (!c.hasQuietTargets) {
    c.hasQuietTargets = true;

    // 1) find the crowd’s “quiet center” by sampling nearby points
    let best = { x: 0, y: 0, density: Infinity };
    const sampleRadius = eps * 0.5;
    // crowd’s current centroid
    const baseX = c.members.reduce((sum, s) => sum + s.x, 0) / c.members.length;
    const baseY = c.members.reduce((sum, s) => sum + s.y, 0) / c.members.length;

    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * sampleRadius;
      const cx = baseX + Math.cos(angle) * radius;
      const cy = baseY + Math.sin(angle) * radius;

      // count how “crowded” that point is
      const density = c.members.filter(s =>
        (s.x - cx) ** 2 + (s.y - cy) ** 2 < (sampleRadius * sampleRadius)
      ).length;

      if (density < best.density) {
        best = { x: cx, y: cy, density };
      }
    }

    // store the chosen quiet‐center
    c.target = new PIXI.Point(best.x, best.y);

    // 2) scatter each member **inside** a small circle around that quiet‐center
    const scatterR = eps * 0.8;
    c.memberTargets = c.members.map(() => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * scatterR;
      return new PIXI.Point(
        c.target!.x + Math.cos(a) * r,
        c.target!.y + Math.sin(a) * r
      );
    });
  }

  // ← every frame: move each member toward its personal scatter‐target,
  // and re‐pick when “close enough”
  const scatterR = eps * 0.8;
  c.members.forEach((s, idx) => {
    // guard: we must have both target and memberTargets
    if (!c.target || !c.memberTargets) return;

    const dest = c.memberTargets[idx];
    const dx   = dest.x - s.x;
    const dy   = dest.y - s.y;
    const distSq = dx*dx + dy*dy;

    // arrived? pick a new point around the same quiet center
    if (distSq < BUFFER * BUFFER) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * scatterR;
      c.memberTargets[idx].set(
        c.target.x + Math.cos(a) * r,
        c.target.y + Math.sin(a) * r
      );
      return;
    }

    // otherwise step toward it
    const dist = Math.sqrt(distSq) || 1;
    s.dx = (dx / dist) * s.walkSpeed;
    s.dy = (dy / dist) * s.walkSpeed;
    s.x += s.dx * STEP_FACTOR;
    s.y += s.dy * STEP_FACTOR;
  });

  break;
}




      }
    });
  });

  if (this.groupTimer > this.HOLDING_DURATION) this.advancePhase();
  break;
      case GroupPhase.Disbanding:
        if (this.groupTimer === 1) this.disbandGroups();               // on enter
        if (this.groupTimer > this.DISBAND_DURATION) this.advancePhase();
        break;
    }

    // camera first
    this.camera.update();

    const computeCentroid = (pts: { x: number; y: number }[]) => {
      const n = pts.length;
      if (n === 0) return new PIXI.Point(0, 0);
      const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      return new PIXI.Point(sum.x / n, sum.y / n);
    };

const MAX_FISH = 20;                // never more than this many fish
const MIN_STICKMEN_FOR_FISH = 10;   // need at least this many stickmen before spawning
const SPAWN_CHANCE = 0.0002;        // ~0.02% per frame
const HOME_JITTER = 100; 
if (this.stickmen.length >= MIN_STICKMEN_FOR_FISH && Math.random() < SPAWN_CHANCE) {  // ~0.2% chance per frame
  console.log("Yay! new fish spawned!")
  const pt = this.pickOffscreenPoint();
  const f = new Fish(pt.x, pt.y);
  const fs = new FishSprite(f);
  this.fishes.push(f);
  this.fishSprites.push(fs);
  this.worldContainer.addChild(fs);

  const crowdCenter = computeCentroid(this.stickmen.map(s => ({ x: s.x, y: s.y })));
  const homeX = crowdCenter.x + (Math.random()*2 - 1) * HOME_JITTER;
  const homeY = crowdCenter.y + (Math.random()*2 - 1) * HOME_JITTER;
  this.homes.push(new PIXI.Point(homeX, homeY));
}

    // 1) resolve each fish towards the mouse position
    for (const f of this.fishes) {
      f.updateBehavior(this.fishes, this.homes);
    }

    

  this.mouthDebug.clear();

for (const fish of this.fishes) {
  // grab the real head position:
  const head = fish.head;
  const hx   = head.x;
  const hy   = head.y;
  const mr2  = fish.mouthRadius * fish.mouthRadius;


  for (let i = this.stickmen.length - 1; i >= 0; i--) {
    const s  = this.stickmen[i];
    const dx = s.x - hx, dy = s.y - hy;
    if (dx*dx + dy*dy < mr2) {
      // eaten!
      const sprite = this.sprites[i];
      this.worldContainer.removeChild(sprite);
      sprite.destroy();
      this.sprites.splice(i, 1);
      this.stickmen.splice(i, 1);
    }
  }
}

  

    // 3) update stickmen as before
    this.stickmen.forEach(s => {
  // if we're in the Holding phase AND this stickman belongs to a crowd
  if (this.groupPhase === GroupPhase.Holding && s.groupId != null) {
  // try to look up its crowd FSM
  const crowd = this.crowds.find(c => c.id === s.groupId);
  if (crowd) {
    s.tick++; 
    s.stepCycle += 0.5;
    s.currentEvent = null;  
    // only now is it safe to switch on crowd.state
    switch (crowd.state) {
      case 'Chase':
        s.state     = State.Chase;
        s.isWalking = true;
        break;
      case 'Flee':
        s.state     = State.RunAway;
        s.isWalking = true;
        break;
      case 'Roam':
        s.state     = State.Wander;
        s.isWalking = true;
        break;
      case 'SeekQuiet':
        s.state     = State.SeekQuiet;
        s.isWalking = true;
        break;
      default:
        s.state     = State.Idle;
        s.isWalking = false;
    }
    // now only update skeleton, skip their solo FSM
    s.updateSkeleton();
    return;
  }
}

  // otherwise they're on their own
  const others = this.stickmen.filter(o => o !== s);
  s.update(others, this.fishes);
});

    // 2) redraw each fish sprite with that same mouse pos
    for (const fs of this.fishSprites) {
      fs.update();
      this.worldContainer.setChildIndex(fs, this.worldContainer.children.length - 1);
    }

  }

    private advancePhase() {
    this.groupTimer = 0;
    this.groupPhase = (this.groupPhase + 1) % 3;
    console.log('➡️ Advanced to phase', GroupPhase[this.groupPhase]);
    console.log(this.crowds)
    }

    private disbandGroups() {
      this.stickmen.forEach(s => s.groupId = null);
      this.nextGroupId = 1;
    }

      private formGroups() {
    const eps = 160;      // tweak to control clustering radius
    const minPts = 3;    // minimum members to form a cluster

    // helper: distance²
    const sq = (a:number, b:number) => {
      const dx = a - b;
      return dx*dx;
    };

    // build an index
    const points = this.stickmen.map((s, i) => ({ s, x: s.x, y: s.y, idx: i }));
    const visited = new Array(points.length).fill(false);
    const assigned = new Array(points.length).fill(false);

    const neighbors = (pi: typeof points[0]) =>
      points
        .filter(q =>
          sq(q.x, pi.x) + sq(q.y, pi.y) <= eps*eps
        )
        .map(q => q.idx);

    for (let i = 0; i < points.length; i++) {
      if (visited[i]) continue;
      visited[i] = true;
      const nbrs = neighbors(points[i]);
      if (nbrs.length < minPts) {
        // noise → leave groupId = null
        continue;
      }
      // start a new cluster
      const cid = this.nextGroupId++;
      const queue = [...nbrs];
      assigned[i] = true;
      points[i].s.groupId = cid;

      while (queue.length) {
        const j = queue.shift()!;
        if (!visited[j]) {
          visited[j] = true;
          const jNbrs = neighbors(points[j]);
          if (jNbrs.length >= minPts) {
            queue.push(...jNbrs.filter(k => !queue.includes(k)));
          }
        }
        if (!assigned[j]) {
          assigned[j] = true;
          points[j].s.groupId = cid;
        }
      }
    } 

    for (let cid = 1; cid < this.nextGroupId; cid++) {
      const members = this.stickmen.filter(s => s.groupId === cid);
      // compute centroid
      const cx = members.reduce((sum,s)=> sum+s.x, 0)/members.length;
      const cy = members.reduce((sum,s)=> sum+s.y, 0)/members.length;
      // pick a rally-point within eps/2 of centroid:
      const MIN_R  = eps * 10;      // at least one cluster-radius away
      const MAX_R  = eps * 15;  // at most two
      const angle  = Math.random()*Math.PI*2;
      const r      = MIN_R + Math.random()*(MAX_R - MIN_R);
      this.groupTargets[cid] = new PIXI.Point(
        cx + Math.cos(angle)*r,
        cy + Math.sin(angle)*r
      );
    }

    for (let a = 1; a < this.nextGroupId; a++) {
  for (let b = a+1; b < this.nextGroupId; b++) {
    const A = this.groupTargets[a];
    const B = this.groupTargets[b];
    const dx = B.x - A.x, dy = B.y - A.y;
    const d2 = dx*dx + dy*dy;
    const minD = eps*1.2;
    if (d2 < minD*minD) {
      const d = Math.sqrt(d2)||1;
      // push them half the overlap apart
      const overlap = (minD - d)/2;
      const ux = dx/d, uy = dy/d;
      A.x -= ux * overlap;
      A.y -= uy * overlap;
      B.x += ux * overlap;
      B.y += uy * overlap;
    }
  }
}
  }



  render() {
    // apply camera transform
    this.worldContainer.position.set(
      -this.camera.x * this.camera.zoom,
      -this.camera.y * this.camera.zoom
    );
    this.worldContainer.scale.set(this.camera.zoom);

    // redraw stickmen sprites
    this.sprites.forEach((sprite) => sprite.update());
  }

  private pickOffscreenPoint(): { x: number; y: number } {
  const { width, height } = this.app.renderer;
  // choose a random edge
  const edge = Math.floor(Math.random() * 4);
  let x: number, y: number;
  switch (edge) {
    case 0: // left
      x = -50;
      y = Math.random() * height;
      break;
    case 1: // right
      x = width + 50;
      y = Math.random() * height;
      break;
    case 2: // top
      x = Math.random() * width;
      y = -50;
      break;
    default: // bottom
      x = Math.random() * width;
      y = height + 50;
  }
  // convert screen→world
  const world = this.camera.screenToWorld(x, y);
  return world;
}
}

const groupMatrix: Record<GroupState, (c: Crowd) => [GroupState,number][]> = {
  Roam:      crowd => {
    const { hostile, curious, loner } = countPersonalities(crowd);
    const total = hostile + curious + loner;
    return [
      ['Roam',      0.5],
      ['Chase',     0.3 * (hostile/total)],
      ['SeekQuiet', 0.2 * (curious/total)],
      //['Flee',      0.1 * (loner/total)],
    ];
  },
  Chase:     _ => [['Roam', 1.0]],
  Flee:      _ => [['SeekQuiet', 1.0]],
  SeekQuiet: _ => [['Roam', 1.0]],
  Disband:   _ => [['Disband', 1.0]],
};

function countPersonalities(c: Crowd) {
  return c.members.reduce((acc, m) => {
    acc[m.personality]++;
    return acc;
  }, { hostile:0, curious:0, loner:0 });
}

function pickGroupNextState(c: Crowd): GroupState {
  const row = groupMatrix[c.state](c);
  let r = Math.random();
  for (const [s,w] of row) {
    if (r < w) return s;
    r -= w;
  }
  return row[row.length-1][0];
}