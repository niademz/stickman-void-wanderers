// core/Fish.ts
import { Point } from 'pixi.js';
import { Chain } from './Chain';
import * as PIXI from 'pixi.js';

export class Fish {
  private spine: Chain;
  private heading: number;        // current swimming direction
  private speed: number;          // units per tick
  private wanderJitter: number;   // max random turn per tick
  private lookAhead: number;      // how far ahead to point the head
  private home: Point;         // anchor
  private roamRadius: number;  // how far from home to go
  private homePull: number;    // strength of home pull force
   private radii: number[];
   public readonly mouthRadius: number;
   private boidRadius = 200;       // how far we look for neighbors
    private sepWeight   = 1.5;      // separation strength
    private aliWeight   = 1.0;      // alignment strength
    private cohWeight   = 1.0;      // cohesion strength

  constructor(
    public x: number,
    public y: number,
    radii: number[] = [68, 81, 84, 83, 77, 64, 51, 38, 32, 19],
    spacing = 64,
    angleConstraint = Math.PI / 8
  ) {
    this.radii = radii;
    this.mouthRadius = this.radii[0] * 1.2
    // matches PDE: 10 body + 2 tail = 12 joints
    this.spine = new Chain(new Point(x, y), radii.length + 2, spacing, angleConstraint);

    // **new** steering init
    this.heading      = Math.random() * Math.PI * 2;
    this.speed        = 2 + Math.random() * 1.5;    // tune to taste
    this.wanderJitter = Math.PI / 30;               // max ±3°/frame
    this.lookAhead    = 16;                         // 
    this.home        = new Point(x, y);
    this.roamRadius  = 1500;     // pixels before full pull
    this.homePull    = 0.02;    // how strongly to steer home

  }

  
  private wanderAngle = 0;

  wander(homes: PIXI.Point[]) {
  const head = this.spine.joints[0];

  // 1) Circle center in front of the fish
  const circleDist   = 20;
  const circleCenter = new Point(
    head.x + Math.cos(this.heading) * circleDist,
    head.y + Math.sin(this.heading) * circleDist
  );

  // 2) Nudge a point around that circle
  const jitterAmount = 0.3;
  this.wanderAngle  += (Math.random()*2 - 1) * jitterAmount;
  const circleRadius = 10;
  const targetOnCircle = new Point(
    circleCenter.x + Math.cos(this.wanderAngle) * circleRadius,
    circleCenter.y + Math.sin(this.wanderAngle) * circleRadius
  );

  // 3) Compute the desired heading toward that jittered point
  const desired = Math.atan2(
    targetOnCircle.y - head.y,
    targetOnCircle.x - head.x
  );

  // 4) Smoothly turn toward it
  this.heading = lerpAngle(this.heading, desired, 0.2);

  // 5) Step forward along that new heading
  let tx = head.x + Math.cos(this.heading) * this.lookAhead;
  let ty = head.y + Math.sin(this.heading) * this.lookAhead;

  // 6) Clamp tx/ty so we never leave the roam circle
  let inAny = false;
  for (const home of homes) {
    const dxh = tx - home.x, dyh = ty - home.y;
    if (dxh*dxh + dyh*dyh <= this.roamRadius * this.roamRadius) {
      inAny = true;
      break;
    }
  }
  if (!inAny && homes.length) {
    // find the home whose boundary we exceed the least
    let best = homes[0], bestExcess = Infinity;
    for (const home of homes) {
      const dxh = tx - home.x, dyh = ty - home.y;
      const d = Math.hypot(dxh, dyh);
      const excess = d - this.roamRadius;
      if (excess < bestExcess) {
        bestExcess = excess;
        best = home;
      }
    }
    // project back onto that home‐circle
    const dxh = tx - best.x, dyh = ty - best.y;
    const d   = Math.hypot(dxh, dyh) || 1;
    tx = best.x + (dxh / d) * this.roamRadius;
    ty = best.y + (dyh / d) * this.roamRadius;
    // re‐aim heading
    this.heading = Math.atan2(ty - head.y, tx - head.x);
  }
  // 7) resolve your spine
  this.spine.resolve(new Point(tx, ty));
}

/**
   * Run one flock‐update + wander
   * @param fishes  all fish in the simulation
   * @param homes   your existing homes array
   */
  updateBehavior(fishes: Fish[], homes: PIXI.Point[]) {
    // 1) Boid forces
    const sep = new Point(0, 0),
        ali = new Point(0, 0),
        coh = new Point(0, 0);
    let count = 0;

    const head = this.spine.joints[0];

    for (const other of fishes) {
      if (other === this) continue;
      const dx = other.head.x - head.x;
      const dy = other.head.y - head.y;
      const d2 = dx*dx + dy*dy;
      if (d2 > 0 && d2 < this.boidRadius*this.boidRadius) {
        count++;
        // Separation: vector away inversely proportional to distance
        sep.x -= dx / d2;
        sep.y -= dy / d2;
        // Alignment: sum other headings
        ali.x += Math.cos(other.heading);
        ali.y += Math.sin(other.heading);
        // Cohesion: sum other positions
        coh.x += other.head.x;
        coh.y += other.head.y;
      }
    }

    if (count > 0) {
      // finalize separation
      sep.x /= count;
      sep.y /= count;
      // finalize alignment
      ali.x /= count;
      ali.y /= count;
      // finalize cohesion (vector from me to center)
      coh.x = (coh.x/count) - head.x;
      coh.y = (coh.y/count) - head.y;

      // normalize & weight each
      normalize(sep);
      normalize(ali);
      normalize(coh);
      sep.x *= this.sepWeight; sep.y *= this.sepWeight;
      ali.x *= this.aliWeight; ali.y *= this.aliWeight;
      coh.x *= this.cohWeight; coh.y *= this.cohWeight;
    }

    // 2) Combine boid & wander desires into one “target” point
    //    We’ll compute a combined steering vector in world‐space
    const steerX = sep.x + ali.x + coh.x;
    const steerY = sep.y + ali.y + coh.y;
    let desiredHeading: number;

    if (steerX || steerY) {
      desiredHeading = Math.atan2(steerY, steerX);
    } else {
      // fallback to pure wander if zero boid steering
      // we can call your wander() helper here to advance heading
      this.wander(homes);
      return;
    }

    // 3) Smoothly turn toward that desiredHeading
    this.heading = lerpAngle(this.heading, desiredHeading, 0.05);

    // 4) Then do your normal wander‐in‐circle behavior, using
    //    the updated this.heading as the base
    this.wander(homes);
  }




  /** draw via PIXI.Graphics in FishSprite; expose for helpers */
  getJoints() {
    return this.spine.joints;
  }
  getAngles() {
    return this.spine.angles;
  }

  get head(): Point {
    return this.spine.joints[0];
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  const diff = (((b - a + Math.PI) % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI) - Math.PI;
  return a + diff * t;
}

function normalize(v: { x:number, y:number }) {
  const m = Math.hypot(v.x, v.y) || 1;
  v.x /= m; v.y /= m;
}
