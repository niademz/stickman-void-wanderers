
import * as PIXI from 'pixi.js';
import { Stickman } from './Stickman';
import { StickmanSprite } from '../graphics/StickmanSprite';
import { Camera } from './Camera';

export class Simulation {
  app: PIXI.Application;
  stickmen: Stickman[] = [];
  sprites: StickmanSprite[] = [];
  camera: Camera;
  worldContainer: PIXI.Container;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application();
    this.camera = new Camera();
    this.worldContainer = new PIXI.Container();
    
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

    // Create initial stickmen
    for (let i = 0; i < 5; i++) {
      this.spawnStickman(
        Math.random() * 400 + 200,
        Math.random() * 300 + 200
      );
    }

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
    // Mouse/touch interactions
    this.app.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) { // Left click
        const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
        this.spawnStickman(worldPos.x, worldPos.y);
      } else if (e.button === 2) { // Right click - start camera drag
        this.camera.startDrag(e.clientX, e.clientY);
      }
    });

    this.app.canvas.addEventListener('pointermove', (e) => {
      this.camera.updateDrag(e.clientX, e.clientY);
    });

    this.app.canvas.addEventListener('pointerup', () => {
      this.camera.stopDrag();
    });

    // Zoom with mouse wheel
    this.app.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.camera.setZoom(this.camera.targetZoom * zoomFactor);
    });

    // Prevent context menu on right click
    this.app.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Resize handler
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
    // Update camera
    this.camera.update();

    // Update all stickmen
    this.stickmen.forEach(stickman => stickman.update());
  }

  render() {
    // Apply camera transform
    this.worldContainer.position.set(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);
    this.worldContainer.scale.set(this.camera.zoom);

    // Update all sprites
    this.sprites.forEach(sprite => sprite.update());
  }
}
