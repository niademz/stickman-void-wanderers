
import * as PIXI from 'pixi.js';
import { Stickman } from '../core/Stickman';

export class StickmanSprite extends PIXI.Graphics {
  stickman: Stickman;

  constructor(stickman: Stickman) {
    super();
    this.stickman = stickman;
  }

  update() {
    this.clear();
    this.setStrokeStyle({ width: 2, color: 0x000000 });

    const { x, y } = this.stickman;

    // Draw torso
    const torsoStart = this.stickman.torso.getStartPosition();
    const torsoEnd = this.stickman.torso.getEndPosition();
    this.moveTo(torsoStart.x - x, torsoStart.y - y);
    this.lineTo(torsoEnd.x - x, torsoEnd.y - y);

    // Draw shoulders
    const shoulderStart = this.stickman.shoulders.getStartPosition();
    const shoulderEnd = this.stickman.shoulders.getEndPosition();
    this.moveTo(shoulderStart.x - x, shoulderStart.y - y);
    this.lineTo(shoulderEnd.x - x, shoulderEnd.y - y);

    // Draw left leg
    const lThighStart = this.stickman.leftThigh.getStartPosition();
    const lThighEnd = this.stickman.leftThigh.getEndPosition();
    this.moveTo(lThighStart.x - x, lThighStart.y - y);
    this.lineTo(lThighEnd.x - x, lThighEnd.y - y);

    const lShinEnd = this.stickman.leftShin.getEndPosition();
    this.moveTo(lThighEnd.x - x, lThighEnd.y - y);
    this.lineTo(lShinEnd.x - x, lShinEnd.y - y);

    // Draw right leg
    const rThighStart = this.stickman.rightThigh.getStartPosition();
    const rThighEnd = this.stickman.rightThigh.getEndPosition();
    this.moveTo(rThighStart.x - x, rThighStart.y - y);
    this.lineTo(rThighEnd.x - x, rThighEnd.y - y);

    const rShinEnd = this.stickman.rightShin.getEndPosition();
    this.moveTo(rThighEnd.x - x, rThighEnd.y - y);
    this.lineTo(rShinEnd.x - x, rShinEnd.y - y);

    // Draw left arm
    const lUpperStart = this.stickman.leftUpperArm.getStartPosition();
    const lUpperEnd = this.stickman.leftUpperArm.getEndPosition();
    this.moveTo(lUpperStart.x - x, lUpperStart.y - y);
    this.lineTo(lUpperEnd.x - x, lUpperEnd.y - y);

    const lLowerEnd = this.stickman.leftLowerArm.getEndPosition();
    this.moveTo(lUpperEnd.x - x, lUpperEnd.y - y);
    this.lineTo(lLowerEnd.x - x, lLowerEnd.y - y);

    // Draw right arm
    const rUpperStart = this.stickman.rightUpperArm.getStartPosition();
    const rUpperEnd = this.stickman.rightUpperArm.getEndPosition();
    this.moveTo(rUpperStart.x - x, rUpperStart.y - y);
    this.lineTo(rUpperEnd.x - x, rUpperEnd.y - y);

    const rLowerEnd = this.stickman.rightLowerArm.getEndPosition();
    this.moveTo(rUpperEnd.x - x, rUpperEnd.y - y);
    this.lineTo(rLowerEnd.x - x, rLowerEnd.y - y);

    // Draw head as small black circle
    this.beginFill(0x000000);
    this.drawCircle(torsoStart.x - x, torsoStart.y - y - 8, 3);
    this.endFill();
    
    this.position.set(x, y);
    this.stroke();
  }
}
