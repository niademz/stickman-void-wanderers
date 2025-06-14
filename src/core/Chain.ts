// core/Chain.ts
import { Point } from 'pixi.js';

export function constrainDistance(
  pos: Point,
  anchor: Point,
  constraint: number
): Point {
  const dx = pos.x - anchor.x;
  const dy = pos.y - anchor.y;
  const len = Math.hypot(dx, dy) || 1;
  return new Point(
    anchor.x + (dx / len) * constraint,
    anchor.y + (dy / len) * constraint
  );
}

export function simplifyAngle(a: number): number {
  const TWO_PI = Math.PI * 2;
  while (a < 0) a += TWO_PI;
  while (a >= TWO_PI) a -= TWO_PI;
  return a;
}

export function relativeAngleDiff(angle: number, anchor: number): number {
  const PI = Math.PI;
  angle = simplifyAngle(angle + PI - anchor);
  return PI - angle;
}

export function constrainAngle(
  angle: number,
  anchor: number,
  constraint: number
): number {
  const diff = relativeAngleDiff(angle, anchor);
  if (Math.abs(diff) <= constraint) {
    return simplifyAngle(angle);
  }
  if (diff > constraint) {
    return simplifyAngle(anchor - constraint);
  }
  return simplifyAngle(anchor + constraint);
}

export class Chain {
  public joints: Point[] = [];
  public angles: number[] = [];
  constructor(
    origin: Point,
    public jointCount: number,
    public linkSize: number,
    public angleConstraint: number = Math.PI * 2
  ) {
    // initialize joints & angles
    for (let i = 0; i < jointCount; i++) {
      this.joints.push(
        i === 0
          ? new Point(origin.x, origin.y)
          : new Point(origin.x, origin.y + this.linkSize * i)
      );
      this.angles.push(0);
    }
  }

  /** Non-FABRIK (angle-constrained) resolution to make end follow `pos` */
  resolve(pos: Point) {
    // head
    const dx0 = pos.x - this.joints[0].x;
    const dy0 = pos.y - this.joints[0].y;
    this.angles[0] = Math.atan2(dy0, dx0);
    this.joints[0].set(pos.x, pos.y);

    // propagate down the chain
    for (let i = 1; i < this.jointCount; i++) {
      const prev = this.joints[i - 1];
      const cur = this.joints[i];
      const rawAngle = Math.atan2(prev.y - cur.y, prev.x - cur.x);
      const θ = constrainAngle(rawAngle, this.angles[i - 1], this.angleConstraint);
      this.angles[i] = θ;
      // place segment i exactly linkSize away
      cur.set(
        prev.x - Math.cos(θ) * this.linkSize,
        prev.y - Math.sin(θ) * this.linkSize
      );
    }
  }

  /** FABRIK two-pass resolution (optional) */
  fabrikResolve(target: Point, anchor: Point) {
    // forward
    this.joints[0].set(target.x, target.y);
    for (let i = 1; i < this.jointCount; i++) {
      const j = constrainDistance(this.joints[i], this.joints[i - 1], this.linkSize);
      this.joints[i].set(j.x, j.y);
    }
    // backward
    this.joints[this.jointCount - 1].set(anchor.x, anchor.y);
    for (let i = this.jointCount - 2; i >= 0; i--) {
      const j = constrainDistance(this.joints[i], this.joints[i + 1], this.linkSize);
      this.joints[i].set(j.x, j.y);
    }
  }
}
