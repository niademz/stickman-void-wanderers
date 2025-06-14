// graphics/FishSprite.ts
import * as PIXI from 'pixi.js';
import { Fish } from '@/core/Fish';
import { relativeAngleDiff } from '@/core/Chain';

export class FishSprite extends PIXI.Graphics {
  // exactly the same "width at each vertebra" from Fish.pde
  private bodyWidth = [68, 81, 84, 83, 77, 64, 51, 38, 32, 19];
  // same colours
  private bodyColor = 0x3a7ca5;
  private finColor  = 0x81c3d7;

  constructor(private fish: Fish) {
    super();
  }

  /**
   * Call this each frame (after fish.resolve), passing in the current mouse coords.
   */
  update() {
    const j = this.fish.getJoints();  // PVector equivalents
    const a = this.fish.getAngles();  // heading at each joint

    // === compute those "relative angle diffs" exactly as in Fish.pde ===
    const headToMid1 = relativeAngleDiff(a[0], a[6]);
    const headToMid2 = relativeAngleDiff(a[0], a[7]);
    const headToTail = headToMid1 + relativeAngleDiff(a[6], a[11]);

    // clear previous frame
    this.clear();

    // === PECTORAL FINS ===
    this.lineStyle(4, 0xffffff);
    this.beginFill(this.finColor);
    // right fin
    this.drawEllipse(
      ...this.getPos(3, Math.PI/3, 0, j, a),
      160, 64
    );
    // left fin
    this.drawEllipse(
      ...this.getPos(3, -Math.PI/3, 0, j, a),
      160, 64
    );
    this.endFill();

    // === VENTRAL FINS ===
    this.beginFill(this.finColor);
    // right
    this.drawEllipse(
      ...this.getPos(7, Math.PI/2, 0, j, a),
      96, 32
    );
    // left
    this.drawEllipse(
      ...this.getPos(7, -Math.PI/2, 0, j, a),
      96, 32
    );
    this.endFill();

    // === CAUDAL FIN ===
    this.lineStyle(4, 0xffffff);
    this.beginFill(this.finColor);
    // bottom half
    const bottom: number[] = [];
    for (let i = 8; i < 12; i++) {
      const w = 1.5 * headToTail * (i - 8) * (i - 8);
      bottom.push(
        j[i].x + Math.cos(a[i] - Math.PI/2) * w,
        j[i].y + Math.sin(a[i] - Math.PI/2) * w,
      );
    }
    // top half
    const top: number[] = [];
    for (let i = 11; i >= 8; i--) {
      const w = Math.max(-13, Math.min(13, headToTail * 6));
      top.push(
        j[i].x + Math.cos(a[i] + Math.PI/2) * w,
        j[i].y + Math.sin(a[i] + Math.PI/2) * w,
      );
    }
    this.drawPolygon([...bottom, ...top]);
    this.endFill();

    // === BODY ===
    this.beginFill(this.bodyColor);
    const bodyPts: number[] = [];
    // right half
    for (let i = 0; i < 10; i++) {
      bodyPts.push(...this.getPos(i, Math.PI/2, 0, j, a));
    }
    // bottom tip
    bodyPts.push(...this.getPos(9, Math.PI, 0, j, a));
    // left half
    for (let i = 9; i >= 0; i--) {
      bodyPts.push(...this.getPos(i, -Math.PI/2, 0, j, a));
    }
    // top of head loop
    bodyPts.push(...this.getPos(0, -Math.PI/6, 0, j, a));
    bodyPts.push(...this.getPos(0, 0, 4,   j, a));
    bodyPts.push(...this.getPos(0,  Math.PI/6, 0, j, a));
    // overlap verts
    bodyPts.push(...this.getPos(0,  Math.PI/2, 0, j, a));
    bodyPts.push(...this.getPos(1,  Math.PI/2, 0, j, a));
    bodyPts.push(...this.getPos(2,  Math.PI/2, 0, j, a));
    this.drawPolygon(bodyPts);
    this.endFill();

    // === DORSAL FIN ===
    this.beginFill(this.finColor);
    const dorsal: number[] = [
      j[4].x, j[4].y,
      // cubic bezier from 4→5→6→7
      j[5].x, j[5].y,  j[6].x, j[6].y,  j[7].x, j[7].y,
      // return curve via mid2/mid1
      j[6].x + Math.cos(a[6] + Math.PI/2) * headToMid2 * 16,
      j[6].y + Math.sin(a[6] + Math.PI/2) * headToMid2 * 16,
      j[5].x + Math.cos(a[5] + Math.PI/2) * headToMid1 * 16,
      j[5].y + Math.sin(a[5] + Math.PI/2) * headToMid1 * 16,
      j[4].x, j[4].y,
    ];
    this.drawPolygon(dorsal);
    this.endFill();

    // === EYES ===
    this.beginFill(0xffffff);
    this.drawEllipse(
      ...this.getPos(0, Math.PI/2, -18, j, a),
      24, 24
    );
    this.drawEllipse(
      ...this.getPos(0, -Math.PI/2, -18, j, a),
      24, 24
    );
    this.endFill();

   

    // finally, move the Graphics container so its (0,0) is the head:
   // this.position.set(j[0].x, j[0].y);
  }

  /** helper to mirror getPosX/getPosY from the PDE: returns [x,y] */
  private getPos(
    i: number,
    angleOffset: number,
    lengthOffset: number,
    j: PIXI.Point[],
    a: number[]
  ): [number, number] {
    const w = this.bodyWidth[i] + lengthOffset;
    const ang = a[i] + angleOffset;
    return [
      j[i].x + Math.cos(ang) * w,
      j[i].y + Math.sin(ang) * w,
    ];
  }
}
