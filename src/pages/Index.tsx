
import { useEffect, useRef } from 'react';
import { Simulation } from '../core/Simulation';

const Index = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize simulation
    const simulation = new Simulation(canvasRef.current);
    simulationRef.current = simulation;

    return () => {
      // Cleanup
      if (simulationRef.current) {
        simulationRef.current.app.destroy(true);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-white overflow-hidden">
      <canvas 
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      
      {/* Minimal UI overlay */}
      <div className="absolute top-4 left-4 text-foreground/60 text-sm font-mono pointer-events-none">
        <div>Stickman Sandbox</div>
        <div className="text-xs mt-1 opacity-75">
          Left click: spawn • Right drag: pan • Scroll: zoom
        </div>
      </div>
      
      <div className="absolute bottom-4 right-4 text-foreground/40 text-xs font-mono pointer-events-none">
        God view active
      </div>
    </div>
  );
};

export default Index;
