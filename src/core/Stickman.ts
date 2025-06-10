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
    this.shoulders = new Bone(0, -30); // Zero length like in working code

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

    // Leg IK with proper alternating steps
    const hip = this.torso.getEndPosition();
    const L1 = this.leftThigh.length;
    const L2 = this.leftShin.length;
    const groundY = hip.y + L1 + L2;
    
    if (this.isWalking) {
      // Fixed step cycle - using a simpler approach like your working code
      const cycle = 60;
      const phase = (this.stepCycle * 10) % cycle / cycle; // Scale stepCycle properly
      const stride = 12;
      const lift = 8;
      
      // Left leg step cycle
      let footLX, footLY;
      if (phase < 0.6) {
        footLX = hip.x; 
        footLY = groundY;
      } else {
        const t = (phase - 0.6) / 0.4;
        footLX = hip.x + (t * 2 - 1) * stride;
        footLY = groundY - Math.sin(t * Math.PI) * lift;
      }
      
      // Right leg (phase + 0.5, wrapped)
      const rightPhase = (phase + 0.5) % 1;
      let footRX, footRY;
      if (rightPhase < 0.6) {
        footRX = hip.x; 
        footRY = groundY;
      } else {
        const t2 = (rightPhase - 0.6) / 0.4;
        footRX = hip.x + (t2 * 2 - 1) * stride;
        footRY = groundY - Math.sin(t2 * Math.PI) * lift;
      }
      
      const leftIK = this.solveTwoBoneIK(hip.x, hip.y, L1, L2, footLX, footLY);
      const rightIK = this.solveTwoBoneIK(hip.x, hip.y, L1, L2, footRX, footRY);
      
      this.leftThigh.angle = leftIK.hipAngle;
      this.leftShin.angle = leftIK.hipAngle + (Math.PI - leftIK.kneeAngle);
      
      this.rightThigh.angle = rightIK.hipAngle;
      this.rightShin.angle = rightIK.hipAngle + (Math.PI - rightIK.kneeAngle);
    } else {
      // Idle pose - slightly bent legs, more natural
      this.leftThigh.angle = Math.PI / 2 + 0.1; // Slight forward lean
      this.leftShin.angle = Math.PI / 2 + 0.15; // Bent knee
      this.rightThigh.angle = Math.PI / 2 + 0.1;
      this.rightShin.angle = Math.PI / 2 + 0.15;
    }

    // Position shoulders at hip (torso start) like in working code
    const hipPos = this.torso.getStartPosition();
    this.shoulders.updateRoot(hipPos.x, hipPos.y);

    // Arms with better folding
    const baseArm = Math.PI / 2;
    
    if (this.isWalking) {
      // Walking arms - swing with lower arms folded up
      const phase = (this.stepCycle * 10) % (Math.PI * 2) / (Math.PI * 2);
      const swing = Math.sin(phase * Math.PI * 2) * 0.6;
      const leftSwing = Math.max(-0.6, Math.min(0.6, swing));
      const rightSwing = Math.max(-0.6, Math.min(0.6, -swing));

      this.leftUpperArm.angle = baseArm + leftSwing;
      this.leftLowerArm.angle = baseArm + leftSwing * 0.4 - 0.3; // Folded up
      this.rightUpperArm.angle = baseArm + rightSwing;
      this.rightLowerArm.angle = baseArm + rightSwing * 0.4 - 0.3; // Folded up
    } else {
      // Idle arms - relaxed but slightly folded
      const idleSwing = Math.sin(this.tick * 0.01) * 0.1;
      this.leftUpperArm.angle = baseArm + idleSwing;
      this.leftLowerArm.angle = baseArm + idleSwing - 0.2; // Slightly folded
      this.rightUpperArm.angle = baseArm - idleSwing;
      this.rightLowerArm.angle = baseArm - idleSwing - 0.2; // Slightly folded
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
