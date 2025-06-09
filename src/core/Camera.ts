
export class Camera {
  x: number = 0;
  y: number = 0;
  zoom: number = 1;
  targetZoom: number = 1;
  
  isDragging: boolean = false;
  lastPointerX: number = 0;
  lastPointerY: number = 0;

  update() {
    // Smooth zoom interpolation
    this.zoom += (this.targetZoom - this.zoom) * 0.1;
  }

  startDrag(x: number, y: number) {
    this.isDragging = true;
    this.lastPointerX = x;
    this.lastPointerY = y;
  }

  updateDrag(x: number, y: number) {
    if (!this.isDragging) return;
    
    const deltaX = x - this.lastPointerX;
    const deltaY = y - this.lastPointerY;
    
    this.x -= deltaX / this.zoom;
    this.y -= deltaY / this.zoom;
    
    this.lastPointerX = x;
    this.lastPointerY = y;
  }

  stopDrag() {
    this.isDragging = false;
  }

  setZoom(newZoom: number) {
    this.targetZoom = Math.max(0.1, Math.min(5, newZoom));
  }

  screenToWorld(screenX: number, screenY: number) {
    return {
      x: (screenX / this.zoom) + this.x,
      y: (screenY / this.zoom) + this.y
    };
  }
}
