
import { v4 as uuidv4 } from 'uuid';
import { Bone } from './Bone';

export class Stickman {
  id: string = uuidv4();
  x: number;
  y: number;
  dx: number = 0;
  dy: number = 0;
  tick: number = 0;
  walkSpeed: number;
  stepCycle: number = 0;
  isWalking: boolean = false;
  targetX: number = 0;
  targetY: number = 0;
  
  // Personality traits
  wanderRadius: number;
  restDuration: number;
  restTimer: number = 0;

  // Skeleton bones
  torso: Bone;
  leftThigh: Bone;
  leftShin: Bone;
  rightThigh: Bone;
  rightShin: Bone;
  leftUpperArm: Bone;
  leftLowerArm: Bone;
  rightUpperArm: Bone;
  rightLowerArm: Bone;
  shoulders: Bone;

  constructor(x: number = Math.random() * 800, y: number = Math.random() * 600) {
    this.x = x;
    this.y = y;
    
    // Randomized traits
    this.walkSpeed = 0.3 + Math.random() * 0.7;
    this.wanderRadius = 50 + Math.random() * 100;
    this.restDuration = 60 + Math.random() * 120;
    
    // Initialize skeleton
    this.torso = new Bone(30, Math.PI / 2);
    this.shoulders = new Bone(25, 0); // Give shoulders proper width

    this.leftThigh = new Bone(20, Math.PI / 2, this.torso);
    this.leftShin = new Bone(20, Math.PI / 2, this.leftThigh);

    this.rightThigh = new Bone(20, Math.PI / 2, this.torso);
    this.rightShin = new Bone(20, Math.PI / 2, this.rightThigh);

    this.leftUpperArm = new Bone(15, Math.PI / 2, this.shoulders);
    this.leftLowerArm = new Bone(15, Math.PI / 2, this.leftUpperArm);

    this.rightUpperArm = new Bone(15, Math.PI / 2, this.shoulders);
    this.rightLowerArm = new Bone(15, Math.PI / 2, this.rightUpperArm);
    
    this.setNewTarget();
  }

  setNewTarget() {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.wanderRadius;
    this.targetX = this.x + Math.cos(angle) * distance;
    this.targetY = this.y + Math.sin(angle) * distance;
  }

  update() {
    this.tick++;
    
    // Simple AI behavior
    if (this.restTimer > 0) {
      this.restTimer--;
      this.isWalking = false;
      this.dx *= 0.9; // Slow down
      this.dy *= 0.9;
    } else {
      // Move towards target
      const distToTarget = Math.hypot(this.targetX - this.x, this.targetY - this.y);
      
      if (distToTarget < 5) {
        // Reached target, rest or find new target
        if (Math.random() < 0.3) {
          this.restTimer = this.restDuration;
        } else {
          this.setNewTarget();
        }
      } else {
        // Move towards target
        this.isWalking = true;
        const moveAngle = Math.atan2(this.targetY - this.y, this.targetX - this.x);
        this.dx = Math.cos(moveAngle) * this.walkSpeed;
        this.dy = Math.sin(moveAngle) * this.walkSpeed;
      }
    }

    // Update position
    this.x += this.dx;
    this.y += this.dy;

    // Update step cycle for walking animation
    if (this.isWalking) {
      this.stepCycle += Math.hypot(this.dx, this.dy) * 0.3;
    }

    // Update skeleton
    this.updateSkeleton();
  }

  updateSkeleton() {
    // Less flowy torso - more mechanical bobbing
    const walkBob = this.isWalking ? Math.sin(this.stepCycle) * 1.5 : 0;
    const idleBob = this.isWalking ? 0 : Math.sin(this.tick * 0.02) * 0.5;
    
    this.torso.updateRoot(this.x, this.y + walkBob + idleBob);
    
    // Slight torso lean when walking
    const leanAmount = this.isWalking ? Math.sign(this.dx) * 0.05 : 0;
    this.torso.angle = Math.PI / 2 + leanAmount;

    // Leg IK with more mechanical stepping
    const hip = this.torso.getEndPosition();
    const L1 = this.leftThigh.length;
    const L2 = this.leftShin.length;
    const groundY = hip.y + L1 + L2;
    
    if (this.isWalking) {
      // More robotic stepping pattern
      const stepPhase = this.stepCycle;
      const stride = 12;
      const lift = 8;
      
      // Sharp, mechanical step pattern instead of smooth sine
      const leftStep = ((stepPhase % (Math.PI * 2)) / (Math.PI * 2));
      const rightStep = (((stepPhase + Math.PI) % (Math.PI * 2)) / (Math.PI * 2));
      
      // Create more angular stepping motion
      const leftLift = leftStep < 0.5 ? Math.sin(leftStep * Math.PI * 2) * lift : 0;
      const rightLift = rightStep < 0.5 ? Math.sin(rightStep * Math.PI * 2) * lift : 0;
      
      const footLX = hip.x + (leftStep - 0.5) * stride;
      const footLY = groundY - leftLift;
      
      const footRX = hip.x + (rightStep - 0.5) * stride;
      const footRY = groundY - rightLift;
      
      const leftIK = this.solveTwoBoneIK(hip.x, hip.y, L1, L2, footLX, footLY);
      const rightIK = this.solveTwoBoneIK(hip.x, hip.y, L1, L2, footRX, footRY);
      
      this.leftThigh.angle = leftIK.hipAngle;
      this.leftShin.angle = leftIK.hipAngle + (Math.PI - leftIK.kneeAngle);
      
      this.rightThigh.angle = rightIK.hipAngle;
      this.rightShin.angle = rightIK.hipAngle + (Math.PI - rightIK.kneeAngle);
    } else {
      // Standing pose - straight legs
      this.leftThigh.angle = Math.PI / 2;
      this.leftShin.angle = Math.PI / 2;
      this.rightThigh.angle = Math.PI / 2;
      this.rightShin.angle = Math.PI / 2;
    }

    // Position shoulders at torso start (top of character)
    const shoulderPos = this.torso.getStartPosition();
    this.shoulders.updateRoot(shoulderPos.x, shoulderPos.y);

    // Calculate shoulder endpoints for arm attachment
    const shoulderStart = this.shoulders.getStartPosition();
    const shoulderEnd = this.shoulders.getEndPosition();
    
    // Left arm starts from left side of shoulders
    const leftShoulderX = shoulderStart.x - this.shoulders.length / 2;
    const leftShoulderY = shoulderStart.y;
    
    // Right arm starts from right side of shoulders  
    const rightShoulderX = shoulderStart.x + this.shoulders.length / 2;
    const rightShoulderY = shoulderStart.y;

    // More mechanical arm movement
    if (this.isWalking) {
      const armSwing = Math.sin(this.stepCycle + Math.PI) * 0.3;
      
      // Update left arm position and angles
      this.leftUpperArm.updateRoot(leftShoulderX, leftShoulderY);
      this.leftUpperArm.angle = Math.PI / 2 + armSwing;
      this.leftLowerArm.angle = this.leftUpperArm.angle + Math.abs(armSwing) * 0.5;
      
      // Update right arm position and angles
      this.rightUpperArm.updateRoot(rightShoulderX, rightShoulderY);
      this.rightUpperArm.angle = Math.PI / 2 - armSwing;
      this.rightLowerArm.angle = this.rightUpperArm.angle + Math.abs(armSwing) * 0.5;
    } else {
      // Hanging arms when idle
      this.leftUpperArm.updateRoot(leftShoulderX, leftShoulderY);
      this.leftUpperArm.angle = Math.PI / 2;
      this.leftLowerArm.angle = Math.PI / 2;
      
      this.rightUpperArm.updateRoot(rightShoulderX, rightShoulderY);
      this.rightUpperArm.angle = Math.PI / 2;
      this.rightLowerArm.angle = Math.PI / 2;
    }
  }

  private solveTwoBoneIK(
    rootX: number, rootY: number,
    L1: number, L2: number,
    targetX: number, targetY: number
  ): { hipAngle: number, kneeAngle: number } {
    const dx = targetX - rootX;
    const dy = targetY - rootY;
    const dist = Math.hypot(dx, dy);
    const r = Math.min(Math.max(dist, Math.abs(L1-L2)), L1+L2);

    const cosKnee = (L1*L1 + L2*L2 - r*r) / (2*L1*L2);
    const kneeAngle = Math.acos(Math.max(-1, Math.min(1, cosKnee)));

    const cosAlpha = (r*r + L1*L1 - L2*L2) / (2*r*L1);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));

    const baseAngle = Math.atan2(dy, dx);
    const hipAngle = baseAngle - alpha;

    return { hipAngle, kneeAngle };
  }
}
