import { v4 as uuidv4 } from 'uuid';
import { Bone } from './Bone';

export enum State {
  Idle        = 'Idle',
  Wander      = 'Wander',
  Chase       = 'Chase',
  Investigate = 'Investigate',
  SeekQuiet   = 'SeekQuiet',
  Rest        = 'Rest',
  RunAway     = 'RunAway',
}

enum EventType {
  Caught = 'caught',
  CaughtVictim = 'caughtVictim',
  Investigated = 'investigated',
  InvestigatedTarget = 'investigatedTarget',
}

type Personality = 'hostile' | 'curious' | 'loner';

export class Stickman {
  id = uuidv4();
  x: number; y: number;
  dx = 0; dy = 0;
  tick = 0;
  walkSpeed: number;
  stepCycle = 0;
  isWalking = false;


  personality: Personality;
  state: State = State.Idle;
  stateTimer = 0;

  currentEvent: EventType | null = null;
  private eventTimer = 0;
  private readonly EVENT_DURATION = 150;
  private eventAngle     = 0;    // current physics angle
  private eventAngVel    = 0; 
  public chaseTargetId: string | null = null;
  private readonly TALK_ELBOW_SPEED   = 0.2;   // how fast they gesture
  private readonly TALK_ELBOW_AMPLITUDE = 0.1; // how big the gesture is
  public groupId: number | null = null;

  debugColor: number;

  // wander target
  targetX = 0; targetY = 0;
  wanderRadius: number;
  restDuration: number;
  restTimer = 0;
  TARGET_BUFFER = 8;
  

  // skeleton
  torso: Bone;
  shoulders: Bone;
  leftThigh: Bone; leftShin: Bone;
  rightThigh: Bone; rightShin: Bone;
  leftUpperArm: Bone; leftLowerArm: Bone;
  rightUpperArm: Bone; rightLowerArm: Bone;

  constructor(x = Math.random()*800, y = Math.random()*600) {
    this.x = x; this.y = y;
    this.walkSpeed    = 0.3 + Math.random()*0.7;
    this.wanderRadius = 200  + Math.random()*100;
    this.restDuration = 60  + Math.random()*120;

    // skeleton
    this.torso        = new Bone(30, Math.PI/2);
    this.shoulders    = new Bone(0, 0);
    this.leftThigh    = new Bone(20, Math.PI/2, this.torso);
    this.leftShin     = new Bone(20, Math.PI/2, this.leftThigh);
    this.rightThigh   = new Bone(20, Math.PI/2, this.torso);
    this.rightShin    = new Bone(20, Math.PI/2, this.rightThigh);
    this.leftUpperArm = new Bone(15, Math.PI/2, this.shoulders);
    this.leftLowerArm = new Bone(15, Math.PI/2, this.leftUpperArm);
    this.rightUpperArm= new Bone(15, Math.PI/2, this.shoulders);
    this.rightLowerArm= new Bone(15, Math.PI/2, this.rightUpperArm);

    // personality
    const types: Personality[] = ['hostile','curious','loner'];
    this.personality = types[Math.floor(Math.random()*types.length)];
    const colorMap = { hostile:0xff0000, curious:0x0000ff, loner:0x00aa00 };
    this.debugColor = colorMap[this.personality];

    this.setNewTarget();
    this.state = State.Wander;
  this.stateTimer = 0;
  }

  // Markov transition matrices
  private static hostileMatrix: Record<State,[State,number][]> = {
    [State.Idle]: [[State.Idle, 0.55], [State.Wander, 0.33], [State.Chase, 0.05], [State.Rest, 0.07]],
    [State.Wander]: [[State.Idle, 0.08], [State.Wander, 0.62], [State.Chase, 0.10], [State.Rest, 0.20]],
    [State.Chase]: [[State.Wander, 0.75], [State.Rest, 0.25]],
    [State.Rest]: [[State.Idle, 0.80], [State.Wander, 0.05], [State.Rest, 0.15]],
    [State.Investigate]: [],
    [State.SeekQuiet]: [],
    [State.RunAway]: []
  };
  private static curiousMatrix: Record<State,[State,number][]> = {
    [State.Idle]: [[State.Idle, 0.60], [State.Wander, 0.25], [State.Investigate, 0.15]],
    [State.Wander]: [[State.Idle, 0.20], [State.Wander, 0.50], [State.Investigate, 0.20], [State.Rest, 0.10]],
    [State.Investigate]: [[State.Idle, 0.10], [State.Wander, 0.20], [State.Investigate, 0.60], [State.Rest, 0.10]],
    [State.Rest]: [[State.Idle, 0.80], [State.Wander, 0.15], [State.Rest, 0.05]],
    [State.Chase]: [],
    [State.SeekQuiet]: [],
    [State.RunAway]: []
  };
  private static lonerMatrix: Record<State,[State,number][]> = {
    [State.Idle]: [[State.Idle, 0.10], [State.SeekQuiet, 0.80], [State.Rest, 0.10]],
    [State.SeekQuiet]: [[State.Idle, 0.05], [State.SeekQuiet, 0.85], [State.Rest, 0.10]],
    [State.Rest]: [[State.Idle, 0.90], [State.SeekQuiet, 0.10]],
    [State.Wander]: [[State.SeekQuiet, 1.0]],
    [State.Chase]: [],
    [State.Investigate]: [],
    [State.RunAway]: []
  };

  private pickNextState(): State {
  const matrix = this.personality === 'hostile'
    ? Stickman.hostileMatrix
    : this.personality === 'curious'
      ? Stickman.curiousMatrix
      : Stickman.lonerMatrix;

  const row = matrix[this.state];
  // if we have no transitions defined → fall back to a safe state
  if (!row || row.length === 0) {
    console.warn(`No transitions defined for state ${this.state}; defaulting to Wander`);
    return State.Wander;
  }

  let r = Math.random();
  for (const [nextState, weight] of row) {
    if (r < weight) return nextState;
    r -= weight;
  }
  // final fallback (should never happen if weights sum to 1)
  return row[row.length-1][0];
}


  setNewTarget() {
    const a = Math.random()*Math.PI*2;
    const d = Math.random()*this.wanderRadius;
    this.targetX = this.x + Math.cos(a)*d;
    this.targetY = this.y + Math.sin(a)*d;
  }
  update(others: Stickman[], fishes: { head: { x:number, y:number } }[]) {
    this.tick++;
    const TARGET_BUFFER = 8;

    // 0) FISH AVOIDANCE OVERRIDE
    const FLEE_DIST = 300;                   // how close before they panic
    const FLEE2     = FLEE_DIST * FLEE_DIST;
    const threat2    = fishes.find(f => {
      const dx = f.head.x - this.x;
      const dy = f.head.y - this.y;
      return dx*dx + dy*dy < FLEE2;
    });
    if (threat2) {
      // run directly away from the fish
      if (this.state !== State.RunAway) {
        this.state = State.RunAway;
        this.stateTimer = 0;
      }

      const dx   = this.x - threat2.head.x;
      const dy   = this.y - threat2.head.y;
      const mag  = Math.hypot(dx, dy) || 1;
      this.dx    = (dx / mag) * this.walkSpeed * 2;
      this.dy    = (dy / mag) * this.walkSpeed * 2;
      this.state = State.RunAway;
      this.isWalking = true;

      

      // advance position + skeleton immediately
      this.x += this.dx;
      this.y += this.dy;
      this.stepCycle += Math.hypot(this.dx, this.dy) * 0.3;
      this.updateSkeleton();
      this.stateTimer++;
      return;  // skip the rest of the FSM
    }

    // 1) override: run away if chased
    if (this.currentEvent) {
    this.eventTimer++;
    this.updateSkeleton();
    if (this.eventTimer >= this.EVENT_DURATION) {
      this.endEvent();
    }
    return; // skip all FSM/movement until event finishes
  }

    const chaser = others.find(o =>
      o.personality==='hostile' && o.state===State.Chase
      && o.chaseTargetId  === this.id
    );
    if (chaser) {
      this.state = State.RunAway;
      this.stateTimer = 0;
      const dx = this.x-chaser.x, dy = this.y-chaser.y;
      const dist = Math.hypot(dx,dy)||1;
      this.dx = dx/dist*this.walkSpeed;
      this.dy = dy/dist*this.walkSpeed;
      this.isWalking = true;
    } else {
      // 2) FSM tick
      const D:Record<State,number> = {
        [State.Idle]:10,[State.Wander]:220,[State.Chase]:80,
        [State.Investigate]:80,[State.SeekQuiet]:100,
        [State.Rest]:50,[State.RunAway]:200
      };
      if (this.stateTimer >= D[this.state]) {
        if (this.state===State.RunAway) this.state=State.Rest;
        else this.state = this.pickNextState();
        this.stateTimer=0;
      }
    }

    // 3) do state behavior
    const hip = this.torso.getEndPosition();
    switch(this.state) {
      case State.Idle:
        this.dx=this.dy=0; 
        this.isWalking = false;
        break;
      case State.Wander:{
        // Wander state with buffer to prevent jitter
        if (this.stateTimer === 0) {
          this.setNewTarget();
        }
        const dxW = this.targetX - this.x;
        const dyW = this.targetY - this.y;
        const distW = Math.hypot(dxW, dyW);
        if (distW < this.TARGET_BUFFER) {
          // arrived within buffer, stop movement
          this.dx = 0;
          this.dy = 0;
          this.isWalking = false;
        } else {
          this.isWalking = true;
          this.moveToward(this.targetX, this.targetY);
        }
        break;
      }
      case State.Chase: {
        // chase but keep buffer distance
        const close = others.map(o => ({ o, d: Math.hypot(o.x - this.x, o.y - this.y) }))
                           .filter(c => c.d < 150);
        if (!close.length) {
          this.chaseTargetId = null;
          this.state = State.Wander;
        } else {
          const target = close.reduce((a, b) => a.d < b.d ? a : b).o;
          this.chaseTargetId = target.id; 
          const dxC = target.x - this.x;
          const dyC = target.y - this.y;
          const distC = Math.hypot(dxC, dyC);
          if (distC < TARGET_BUFFER) {
            this.startEvent(EventType.Caught);
            target.startEvent(EventType.CaughtVictim);
          } else {
            this.isWalking = true;
            // move to a point that is TARGET_BUFFER away from target
            const angle = Math.atan2(dyC, dxC);
            const tx = target.x - Math.cos(angle) * TARGET_BUFFER;
            const ty = target.y - Math.sin(angle) * TARGET_BUFFER;
            this.moveToward(tx, ty);
          }
        } 
        break;
      }
      case State.Investigate: {
        // investigate with buffer
        const close = others.map(o => ({ o, d: Math.hypot(o.x - this.x, o.y - this.y) }))
                           .filter(c => c.d < 150);
        if (!close.length) {
          this.state = State.Wander;
        } else {
          const target = close.reduce((a, b) => a.d < b.d ? a : b).o;
          const dxI = target.x - this.x;
          const dyI = target.y - this.y;
          const distI = Math.hypot(dxI, dyI);
          if (distI < TARGET_BUFFER * 1.5) {
             this.dx = 1;
            this.startEvent(EventType.Investigated);
            target.dx = -1;
            target.startEvent(EventType.InvestigatedTarget);
          } else {
            this.isWalking = true;
            const angle = Math.atan2(dyI, dxI);
            const tx = target.x - Math.cos(angle) * TARGET_BUFFER * 1.5;
            const ty = target.y - Math.sin(angle) * TARGET_BUFFER * 1.5;
            this.moveToward(tx, ty);
          }
        }
        break;
      }
      case State.SeekQuiet: {
        // on entering SeekQuiet, pick a quiet spot once
        if (this.stateTimer === 0) {
          // compute and cache quiet target
          const samples = 8, r = this.wanderRadius;
          let best = { x: this.x, y: this.y, d: Infinity };
          for (let i = 0; i < samples; i++) {
            const a = Math.random() * Math.PI * 2;
            const dist = Math.random() * r;
            const cx = this.x + Math.cos(a) * dist;
            const cy = this.y + Math.sin(a) * dist;
            const density = others.filter(o => Math.hypot(o.x - cx, o.y - cy) < r * 0.3).length;
            if (density < best.d) best = { x: cx, y: cy, d: density };
          }
          this.targetX = best.x;
          this.targetY = best.y;
          this.isWalking = true;
        }
        // buffer check for quiet spot
        const dxQ = this.targetX - this.x;
        const dyQ = this.targetY - this.y;
        const distQ = Math.hypot(dxQ, dyQ);
        if (distQ < TARGET_BUFFER) {
          this.dx = this.dy = 0;
          this.isWalking = false;
        } else {
          this.isWalking = true;
          this.moveToward(this.targetX, this.targetY);
        }
        break;
      }
      case State.Rest:
        this.dx=this.dy=0;break;
      case State.RunAway:
        // dx/dy set above
        break;
    }

    // 4) move + animate
    this.x += this.dx; this.y += this.dy;
    if (this.state!==State.Rest) this.stepCycle += Math.hypot(this.dx,this.dy)*0.3;
    this.updateSkeleton();
    this.stateTimer++;
  }

  // movement helpers…
  private moveToward(tx:number,ty:number) {
    const a=Math.atan2(ty-this.y,tx-this.x);
    this.dx=Math.cos(a)*this.walkSpeed;
    this.dy=Math.sin(a)*this.walkSpeed;
  }

  private chaseClosest(others:Stickman[], speed=1) {
    const close=others.map(o=>({o,d:Math.hypot(o.x-this.x,o.y-this.y)}))
                      .filter(c=>c.d<150);
    if (!close.length) { this.dx=this.dy=0; return; }
    const t=close.reduce((a,b)=>a.d<b.d?a:b).o;
    const a=Math.atan2(t.y-this.y,t.x-this.x);
    this.dx=Math.cos(a)*this.walkSpeed*speed;
    this.dy=Math.sin(a)*this.walkSpeed*speed;
  }

  private seekQuietSpot(others:Stickman[]) {
    const samples=8, r=this.wanderRadius;
    let best={x:this.x,y:this.y,d:Infinity};
    for(let i=0;i<samples;i++){
      const a=Math.random()*Math.PI*2, d=Math.random()*r;
      const cx=this.x+Math.cos(a)*d, cy=this.y+Math.sin(a)*d;
      const density=others.filter(o=>Math.hypot(o.x-cx,o.y-cy)<r*0.3).length;
      if(density<best.d){ best={x:cx,y:cy,d:density}; }
    }
    this.moveToward(best.x,best.y);
  }

  private startEvent(evt: EventType) {
    if (evt === EventType.CaughtVictim) {
    this.eventAngle  = 0;
    this.eventAngVel = 0.1;   // ← SMALL PUSH so it actually falls
  }
    this.currentEvent = evt;
    this.eventTimer = 0;
    this.dx = this.dy = 0;
    this.isWalking = false;
    
  }

  private endEvent() {
    // after the mini‐event, drop into Rest and clear the flag
    this.currentEvent = null;
    this.state = State.Wander;
    this.stateTimer = 0;
  }

  private animateCaught() {
  // 0) compute a little up/down “bounce” based on eventTimer
  const bounceAmp   = 8;            // how many pixels high
  const bounceSpeed = Math.PI / 15; // controls how fast it bobs
  // sin goes −1→1, we take abs so you always bounce upwards from floor
  const bounceY    = Math.abs(Math.sin(this.eventTimer * bounceSpeed)) * bounceAmp;

  // 1) draw torso shifted up by bounceY
  const hipPos = this.torso.getStartPosition();
  this.torso.updateRoot(this.x, this.y - bounceY);      // subtract to lift up
  this.torso.angle = Math.PI/2 + 0.1;                   // slight forward lean

  // 2) pivot shoulders at the (bounced) hip
  this.shoulders.updateRoot(hipPos.x, hipPos.y - bounceY);

  // 3) arms as before
  const armBonus = 0.2;
  this.leftUpperArm.angle  = 3 * Math.PI/2 - armBonus;
  this.rightUpperArm.angle = 3 * Math.PI/2 + armBonus;
  this.leftLowerArm.angle  = this.leftUpperArm.angle;
  this.rightLowerArm.angle = this.rightUpperArm.angle;

  // 4) legs splayed
  const legSpread = 0.3;
  this.leftThigh.angle  = Math.PI/2 + legSpread;
  this.rightThigh.angle = Math.PI/2 - legSpread;
  this.leftShin.angle   = Math.PI/2 + legSpread;
  this.rightShin.angle  = Math.PI/2 - legSpread;
}



private animateCaughtVictim() {
  const D = this.EVENT_DURATION / 5;      // total duration in ticks
  const maxAngle = Math.PI / 2;       // 90°

  // → Tweak this:
  const numFrames = 64;                 // how many distinct poses from upright→flat

  // 1) build your key‐frame angles (evenly spaced here):
  const keyFrames = Array.from({length: numFrames}, (_, i) => {
    // i=0 → 0°, i=numFrames-1 → 90°
    return (i / (numFrames - 1)) * maxAngle;
  });

  // 2) pick the right frame based on eventTimer
  const phase = this.eventTimer / D;                          // 0→1 over the event
  const idx   = Math.min(
    keyFrames.length - 1,
    Math.floor(phase * keyFrames.length)
  );
  const fallAngle = keyFrames[idx];

  // 3) pivot around the ankles, same as before
  const thighLen = this.leftThigh.length;
  const shinLen  = this.leftShin.length;
  const groundY  = this.y + thighLen + shinLen;
  const pivotX   = this.x;
  const pivotY   = groundY;

  const dx = this.x - pivotX;
  const dy = this.y - pivotY;
  const c  = Math.cos(fallAngle);
  const s  = Math.sin(fallAngle);
  const hipX = pivotX + dx*c - dy*s;
  const hipY = pivotY + dx*s + dy*c;

  // 4) apply the pose
  this.torso.updateRoot(hipX, hipY);
  this.torso.angle = Math.PI/2 + fallAngle;

  // limp arms
  const shoulderPos = this.torso.getStartPosition();
  this.shoulders.updateRoot(shoulderPos.x, shoulderPos.y);
  this.leftUpperArm.angle  = this.torso.angle + 0.5;
  this.leftLowerArm.angle  = this.leftUpperArm.angle + 0.2;
  this.rightUpperArm.angle = this.torso.angle - 0.5;
  this.rightLowerArm.angle = this.rightUpperArm.angle - 0.2;

  // lock legs straight
  const legAngle = this.torso.angle;
  this.leftThigh.angle   = legAngle;
  this.leftShin.angle    = legAngle;
  this.rightThigh.angle  = legAngle;
  this.rightShin.angle   = legAngle;
}



private animateInvestigated() {
  // head‐bob + torso upright
  this.torso.updateRoot(this.x, this.y + Math.sin(this.tick * 0.1) * 2);
  this.torso.angle = Math.PI / 2;

  // plant feet in that V-stance you liked
  const hipPos = this.torso.getStartPosition();
  const legSpread = 0.2;
  this.leftThigh.angle  = Math.PI/2 + legSpread;
  this.leftShin.angle   = Math.PI/2 + legSpread;
  this.rightThigh.angle = Math.PI/2 - legSpread;
  this.rightShin.angle  = Math.PI/2 - legSpread;

  // pivot shoulders
  this.shoulders.updateRoot(hipPos.x, hipPos.y);

  // both upper arms fixed at the same pointing angle
  const armAngle = Math.PI/2 - 0.6;   // ← adjust until it’s exactly where you want
  this.leftUpperArm.angle  = armAngle - 0.3;
  this.rightUpperArm.angle = armAngle;

  // really fold the lower arms in tight
  const phase = Math.sin(this.tick * this.TALK_ELBOW_SPEED) * this.TALK_ELBOW_AMPLITUDE;
  const baseElbowBend = 2.0;
  this.leftLowerArm.angle  = (armAngle + baseElbowBend) + phase;
  this.rightLowerArm.angle = (armAngle + baseElbowBend) - phase;
}

private animateInvestigatedTarget() {
  // same head‐bob + torso
  this.torso.updateRoot(this.x, this.y + Math.sin(this.tick * 0.1) * 2);
  this.torso.angle = Math.PI / 2;

  // legs
  const hipPos = this.torso.getStartPosition();
  const legSpread = 0.2;
  this.leftThigh.angle  = Math.PI/2 + legSpread;
  this.leftShin.angle   = Math.PI/2 + legSpread;
  this.rightThigh.angle = Math.PI/2 - legSpread;
  this.rightShin.angle  = Math.PI/2 - legSpread;

  // shoulders pivot
  this.shoulders.updateRoot(hipPos.x, hipPos.y);

  // both arms on the same side
  const armAngle = Math.PI/2 - 0.6;
  this.leftUpperArm.angle  = armAngle - 0.3;
  this.rightUpperArm.angle = armAngle;

  // elbow wiggle
  const phase = Math.sin(this.tick * this.TALK_ELBOW_SPEED) * this.TALK_ELBOW_AMPLITUDE;
  const baseElbowBend = 2.0;
  this.leftLowerArm.angle  = (armAngle - baseElbowBend) + phase;
  this.rightLowerArm.angle = (armAngle - baseElbowBend) - phase;
}



private animateChase() {
  // lean forward, longer stride
  this.torso.updateRoot(this.x, this.y);
  this.torso.angle = Math.PI/2 + 0.2;  // forward lean

  // arms pumping (reuse walking arms but bigger)
  const armPhase = ((this.stepCycle*5)%40)/40;
  const swing = Math.sin(2*Math.PI*armPhase)*1.0;
  this.shoulders.updateRoot(this.x, this.y);
  this.leftUpperArm.angle  = Math.PI/2 + swing;
  this.rightUpperArm.angle = Math.PI/2 - swing;
  this.leftLowerArm.angle  = this.leftUpperArm.angle  - 0.2;
  this.rightLowerArm.angle = this.rightUpperArm.angle - 0.2;

  this.stepCycle += Math.hypot(this.dx, this.dy)*0.3;  // keep stepping
  this.applyLegIK(/* speedMultiplier= */ 2);

  // legs: speed up the existing IK-driven walk cycle
  // you already have walking code; just let it run with isWalking=true
  // so here simply force isWalking and let your IK do the rest.
}

private animateRunAway() {
  // dramatic lean back
  this.torso.updateRoot(this.x, this.y);
  this.torso.angle = Math.PI/2 - 0.3;

  // back-and-forth swing
  const hipPos   = this.torso.getStartPosition();
  const armPhase = ((this.stepCycle * 5) % 40) / 40;
  const swing    = Math.sin(2 * Math.PI * armPhase) * 0.3;

  // shoulders pivot
  this.shoulders.updateRoot(hipPos.x, hipPos.y);

  // base “arms-up” pose: straight up ± small spread
  const spread    = 0.2;          // how far from vertical they splay
  const baseLeft  = 5 * Math.PI / 4 + spread;
  const baseRight = 5 * Math.PI / 4 - spread;

  // apply swing
  this.leftUpperArm.angle  = baseLeft  + swing * 0.5;   // half-swing so it’s subtle
  this.rightUpperArm.angle = baseRight - swing * 0.5;

  // elbows bent a bit but echo swing lightly
  const elbowBend = 0.4;
  this.leftLowerArm.angle  = this.leftUpperArm.angle - elbowBend + swing * 0.2;
  this.rightLowerArm.angle = this.rightUpperArm.angle - elbowBend - swing * 0.2;

  // step and legs as before
  this.stepCycle += Math.hypot(this.dx, this.dy) * 0.3;
  this.applyLegIK(/* speedMultiplier= */ 2);
}



private applyLegIK(speedMultiplier: number = 1) {
  // 1) parameters for your walk cycle
  const cycle        = 40;
  const phase        = ((this.stepCycle * 5 * speedMultiplier) % cycle) / cycle;
  const stride       = 12;    // horizontal foot swing distance
  const lift         = 6;     // vertical foot lift amount
  const snapPower    = 2.5;   // controls “snappiness” of the lift
  const swayPower    = 1.2;   // controls ease of the horizontal swing
  const reverseCycle = true;  // flip phase for smooth looping

  // 2) hip position + leg lengths
  const hip      = this.torso.getEndPosition();
  const L1       = this.leftThigh.length;
  const L2       = this.leftShin.length;
  const groundY  = hip.y + L1 + L2;

  // 3) compute each foot target
  const footTarget = (offset: number) => {
    let t = (phase + offset) % 1;
    if (reverseCycle) t = 1 - t;

    // horizontal swing
    const rawX = Math.sin(2 * Math.PI * t);
    const sx   = Math.sign(rawX) * Math.pow(Math.abs(rawX), swayPower);

    // vertical lift
    const rawY = Math.sin(Math.PI * t);
    const sy   = Math.pow(rawY, snapPower);

    return {
      x: hip.x + sx * stride,
      y: groundY - sy * lift
    };
  };

  // 4) left leg IK
  const { x: fLX, y: fLY } = footTarget(0);
  const leftIK = this.solveTwoBoneIK(hip.x, hip.y, L1, L2, fLX, fLY);
  this.leftThigh.angle = leftIK.hipAngle;
  this.leftShin.angle  = leftIK.hipAngle + (Math.PI - leftIK.kneeAngle);

  // 5) right leg IK
  const { x: fRX, y: fRY } = footTarget(0.5);
  const rightIK = this.solveTwoBoneIK(hip.x, hip.y, L1, L2, fRX, fRY);
  this.rightThigh.angle = rightIK.hipAngle;
  this.rightShin.angle  = rightIK.hipAngle + (Math.PI - rightIK.kneeAngle);
}

  updateSkeleton() {

    // 0) Special‐case animations
  if (this.currentEvent === EventType.Caught) {
    this.animateCaught();
    return;
  }
  if (this.currentEvent === EventType.CaughtVictim) {
    this.animateCaughtVictim();
    return;
  }
  if (this.currentEvent === EventType.Investigated) {
    this.dx = 1;
    this.x += 0.1;
    this.animateInvestigated();
    return;
  }
  if (this.currentEvent === EventType.InvestigatedTarget) {
    this.dx = -1;
    this.x += -0.1;
    this.animateInvestigated();
    return;
  }
  if (this.state === State.Chase) {
    this.animateChase();
    return;
  }
  if (this.state === State.RunAway) {
    this.animateRunAway();
    return;
  }

    // 1) torso bob + lean (unchanged)
    const walkBob = this.isWalking ? Math.sin(this.stepCycle) * 1.5 : 0;
    const idleBob = this.isWalking ? 0 : Math.sin(this.tick * 0.02) * 0.5;
    this.torso.updateRoot(this.x, this.y + walkBob + idleBob);
    const leanAmount = this.isWalking ? Math.sign(this.dx) * 0.05 : 0;
    this.torso.angle = Math.PI / 2 + leanAmount;

    // 2) **Leg IK with old-project logic**  
    const hip     = this.torso.getEndPosition();
    const L1      = this.leftThigh.length, L2 = this.leftShin.length;
    const groundY = hip.y + L1 + L2;

    const cycle        = 40;
    const stride       = 12;
    const lift         =  6;
    const snapPower    =  2.5;
    const swayPower    =  1.2;
    const reverseCycle = true;

    if (this.isWalking) {
      // phase driven by stepCycle
      const phase = ((this.stepCycle * 5) % cycle) / cycle;

      const footTarget = (offset: number) => {
        let t = (phase + offset) % 1;
        if (reverseCycle) t = 1 - t;

        // horizontal swing
        const rawX = Math.sin(2 * Math.PI * t);
        const sx   = Math.sign(rawX) * Math.pow(Math.abs(rawX), swayPower);

        // vertical lift
        const rawY = Math.sin(Math.PI * t);
        const sy   = Math.pow(rawY, snapPower);

        return {
          x: hip.x + sx * stride,
          y: groundY - sy * lift
        };
      };

      // left foot
      const { x: fLX, y: fLY } = footTarget(0);
      const leftIK  = this.solveTwoBoneIK(hip.x, hip.y, L1, L2, fLX, fLY);
      this.leftThigh.angle = leftIK.hipAngle;
      this.leftShin.angle  = leftIK.hipAngle + (Math.PI - leftIK.kneeAngle);

      // right foot
      const { x: fRX, y: fRY } = footTarget(0.5);
      const rightIK = this.solveTwoBoneIK(hip.x, hip.y, L1, L2, fRX, fRY);
      this.rightThigh.angle = rightIK.hipAngle;
      this.rightShin.angle  = rightIK.hipAngle + (Math.PI - rightIK.kneeAngle);

    } else {
      // ——————  IDLE STANCE  ——————
      // 1) Plant feet via IK, stance apart:
      const stance     = 8;
      const L1         = this.leftThigh.length;
      const L2         = this.leftShin.length;
      const groundY    = hip.y + L1 + L2;

      // left foot target:
      const leftIdle  = this.solveTwoBoneIK(
        hip.x, hip.y, L1, L2,
        hip.x - stance,
        groundY
      );
      this.leftThigh.angle =  leftIdle.hipAngle;
      this.leftShin.angle  =  leftIdle.hipAngle + (Math.PI - leftIdle.kneeAngle);

      // right foot target:
      const rightIdle = this.solveTwoBoneIK(
        hip.x, hip.y, L1, L2,
        hip.x + stance,
        groundY
      );
      this.rightThigh.angle = rightIdle.hipAngle;
      this.rightShin.angle  = rightIdle.hipAngle + (Math.PI - rightIdle.kneeAngle);

      // 2) Arms: splay outward then fold down
      const downArm   = Math.PI / 2;
      const elbowBend = 0.2;
      const splay     = 0.3;  // tweak this for how “open” the idle arms are

      this.leftUpperArm.angle  = downArm + splay;
      this.leftLowerArm.angle  = downArm - elbowBend + splay;
      this.rightUpperArm.angle = downArm - splay;
      this.rightLowerArm.angle = downArm + elbowBend - splay;

      // 3) Torso: straight up + tiny breathing bob
      const idleBob = Math.sin(this.tick * 0.02) * 0.5;
      this.torso.updateRoot(this.x, this.y + idleBob);
      this.torso.angle = Math.PI / 2;
    }

    // 3) shoulders root (same as before)
    const hipPos = this.torso.getStartPosition();
    this.shoulders.updateRoot(hipPos.x, hipPos.y);

    // 4) **Arms with old-project folding**  
    const baseArm   = Math.PI / 2;
    const armRange  = 0.6;
    const elbowBend = 0.2;
    const armPhase  = ((this.stepCycle * 5) % cycle) / cycle;

    if (this.isWalking) {
      const swingL = Math.sin(2 * Math.PI * armPhase + Math.PI) * armRange;
      const swingR = Math.sin(2 * Math.PI * armPhase)         * armRange;

      // upper
      this.leftUpperArm.angle  = baseArm + swingL;
      this.rightUpperArm.angle = baseArm + swingR;

      // lower (fold opposite)
      this.leftLowerArm.angle  = this.leftUpperArm.angle  - elbowBend;
      this.rightLowerArm.angle = this.rightUpperArm.angle - elbowBend;

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
