
export class Bone {
  length: number;
  angle: number;
  parent: Bone | null;
  x: number = 0;
  y: number = 0;

  constructor(length: number, angle: number, parent: Bone | null = null) {
    this.length = length;
    this.angle = angle;
    this.parent = parent;
  }

  updateRoot(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  getStartPosition(): { x: number; y: number } {
    if (this.parent) {
      return this.parent.getEndPosition();
    }
    return { x: this.x, y: this.y };
  }

  getEndPosition(): { x: number; y: number } {
    const start = this.getStartPosition();
    return {
      x: start.x + Math.cos(this.angle) * this.length,
      y: start.y + Math.sin(this.angle) * this.length,
    };
  }
}
