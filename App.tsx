import React, { useEffect, useRef, useState, useCallback } from 'react';
import { gameEngine } from './services/engine';
import { PlayerConfig } from './types';

// Icons
const RestartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74-2.74L3 12" /><path d="M3 5v7h7" /></svg>
);

const App: React.FC = () => {
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [speed, setSpeed] = useState<number>(1);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  
  // Refs for Canvases
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>(0);

  // Helper to split players into Left and Right panels
  const getPanelPlayers = () => {
    const players = gameEngine.players;
    const splitIndex = Math.ceil(players.length / 2);
    return {
      left: players.slice(0, splitIndex),
      right: players.slice(splitIndex)
    };
  };

  const startGame = useCallback(() => {
    gameEngine.setup(playerCount);
    setIsRunning(true);
  }, [playerCount]);

  useEffect(() => {
    startGame();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [startGame]);

  const render = useCallback(() => {
    if (!isRunning) return;

    // 1. Update Physics (Loop based on speed setting)
    for(let i = 0; i < speed; i++) {
        gameEngine.update(100, 150); 
    }
    
    // 2. Draw Map
    const mapCanvas = mapCanvasRef.current;
    if (mapCanvas) {
      const ctx = mapCanvas.getContext('2d');
      if (ctx) {
        const w = mapCanvas.width;
        const h = mapCanvas.height;
        const GRID_SIZE = 100; // Matches Engine

        // Clear
        ctx.fillStyle = '#1e293b'; 
        ctx.fillRect(0, 0, w, h);

        const cellSize = w / GRID_SIZE;
        
        // Draw terrain first (background layer)
        for (let y = 0; y < GRID_SIZE; y++) {
          for (let x = 0; x < GRID_SIZE; x++) {
            const terrain = gameEngine.terrainGrid[y][x];
            
            if (terrain.type === 'highground') {
              ctx.fillStyle = 'rgba(234, 179, 8, 0.15)'; // Yellow tint
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            } else if (terrain.type === 'obstacle') {
              ctx.fillStyle = 'rgba(100, 116, 139, 0.3)'; // Gray tint
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            } else if (terrain.type === 'supply') {
              ctx.fillStyle = 'rgba(52, 211, 153, 0.15)'; // Green tint
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
          }
        }
        
        // Draw owned tiles
        for (let y = 0; y < GRID_SIZE; y++) {
          for (let x = 0; x < GRID_SIZE; x++) {
            const ownerId = gameEngine.grid[y][x];
            if (ownerId !== -1) {
              const owner = gameEngine.players[ownerId];
              ctx.fillStyle = owner.color;
              
              if (!owner.isAlive) {
                  ctx.globalAlpha = 0.4;
              }
              
              ctx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5); 
              ctx.globalAlpha = 1.0;
            }
          }
        }

        // Draw Bases & Cores
        gameEngine.players.forEach(p => {
            if (!p.isAlive) return;

// Core with health indicator
            const clampedHp = Math.max(0, Math.min(500, p.coreHp));
            const coreHealthRatio = clampedHp / 500;
            ctx.beginPath();
            ctx.arc(p.basePosition.x * w, p.basePosition.y * h, 5, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Health ring
            ctx.beginPath();
            ctx.arc(p.basePosition.x * w, p.basePosition.y * h, 7, 0, Math.PI * 2 * coreHealthRatio);
            ctx.strokeStyle = coreHealthRatio > 0.5 ? '#22c55e' : coreHealthRatio > 0.25 ? '#eab308' : '#ef4444';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Draw Traveling Units with type-specific visuals
        gameEngine.units.forEach(u => {
          if (!u.active) return;
          
          // Parse HSL color to extract hue
          const colorMatch = u.color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
          const hue = colorMatch ? parseInt(colorMatch[1]) : 0;
          const saturation = colorMatch ? parseInt(colorMatch[2]) : 70;
          
          const px = u.x * cellSize;
          const py = u.y * cellSize;
          
          // Draw trail for light units
          if (u.unitType === 'light' && u.trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(u.trail[0].x * cellSize, u.trail[0].y * cellSize);
            for (let i = 1; i < u.trail.length; i++) {
              ctx.lineTo(u.trail[i].x * cellSize, u.trail[i].y * cellSize);
            }
            
            // Create gradient for trail
            const gradient = ctx.createLinearGradient(
              u.trail[0].x * cellSize, u.trail[0].y * cellSize,
              px, py
            );
            gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, 80%, 0)`);
            gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, 80%, 0.3)`); // Reduced from 0.6
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 2; // Reduced from 3
            ctx.lineCap = 'round';
            ctx.stroke();
            
            // Glow effect for trail (weaker)
            ctx.shadowBlur = 8; // Reduced from 15
            ctx.shadowColor = `hsl(${hue}, ${saturation}%, 80%)`;
            ctx.strokeStyle = `hsla(${hue}, ${saturation}%, 80%, 0.15)`; // Reduced from 0.3
            ctx.lineWidth = 3; // Reduced from 5
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
          
          // Battle effect
          if (u.battleEffect > 0) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = `hsl(${hue}, ${saturation}%, 80%)`;
            u.battleEffect--;
          }
          
          if (u.unitType === 'light') {
            // Light unit - Circle with gradient
            const radius = 2.8;
            
            // Outer glow
            ctx.beginPath();
            ctx.arc(px, py, radius + 2, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${hue}, ${saturation}%, 80%, 0.2)`;
            ctx.fill();
            
            // Main circle with gradient
            const gradient = ctx.createRadialGradient(px - 1, py - 1, 0, px, py, radius);
            gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, 90%)`);
            gradient.addColorStop(0.6, `hsl(${hue}, ${saturation}%, 70%)`);
            gradient.addColorStop(1, `hsl(${hue}, ${saturation}%, 55%)`);
            
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Bright center
            ctx.beginPath();
            ctx.arc(px - 0.8, py - 0.8, 1, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${hue}, ${saturation}%, 95%, 0.8)`;
            ctx.fill();
            
            // Health bar for damaged units
            if (u.hp < u.maxHp) {
              const healthRatio = u.hp / u.maxHp;
              const barWidth = radius * 2.5;
              const barHeight = 2;
              const barX = px - barWidth / 2;
              const barY = py - radius - 5;
              
              // Use transparent background instead of black
              ctx.fillStyle = `hsla(${hue}, ${saturation}%, 30%, 0.3)`;
              ctx.fillRect(barX, barY, barWidth, barHeight);
              
              ctx.fillStyle = healthRatio > 0.5 ? '#22c55e' : healthRatio > 0.25 ? '#eab308' : '#ef4444';
              ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
            }
          } else {
            // Heavy unit - Simple diamond shape
            const size = 4.5;
            
            // Simple diamond with brighter color
            ctx.beginPath();
            ctx.moveTo(px, py - size);
            ctx.lineTo(px + size, py);
            ctx.lineTo(px, py + size);
            ctx.lineTo(px - size, py);
            ctx.closePath();
            
            // Fill with brighter player color (increased from 50% to 65%)
            ctx.fillStyle = `hsl(${hue}, ${saturation}%, 65%)`;
            ctx.fill();
            
            // Thicker, brighter border
            ctx.strokeStyle = `hsl(${hue}, ${saturation}%, 90%)`;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Health bar for damaged units
            if (u.hp < u.maxHp) {
              const healthRatio = u.hp / u.maxHp;
              const barWidth = size * 2.5;
              const barHeight = 3;
              const barX = px - barWidth / 2;
              const barY = py - size - 6;
              
              // Use transparent background instead of black
              ctx.fillStyle = `hsla(${hue}, ${saturation}%, 30%, 0.3)`;
              ctx.fillRect(barX, barY, barWidth, barHeight);
              
              ctx.fillStyle = healthRatio > 0.5 ? '#22c55e' : healthRatio > 0.25 ? '#eab308' : '#ef4444';
              ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
            }
          }
          
          ctx.shadowBlur = 0;
        });
      }
    }

    // 3. Draw Pinball Boards
    const drawPinball = (player: PlayerConfig, canvasId: string) => {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        
        // Logical Scale
        const scaleX = w / 100;
        const scaleY = h / 150;

        // Clear
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        
        // If Eliminated
        if (!player.isAlive) {
            ctx.fillStyle = '#1e293b'; // Darker bg
            ctx.fillRect(0, 0, w, h);
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = '#ef4444'; // Red
            ctx.textAlign = 'center';
            ctx.fillText("ELIMINATED", w/2, h/2);
            ctx.textAlign = 'start';
            
            // Stats (Dimmed)
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 16px monospace';
            ctx.fillText(`${gameEngine.scores[player.id]}`, 10, 25);
            return;
        }

        // Draw Pegs
        ctx.fillStyle = '#334155';
        gameEngine.pegs.forEach(peg => {
            ctx.beginPath();
            ctx.arc(peg.x * scaleX, peg.y * scaleY, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Catcher (Moving Platform)
        const catcherX = gameEngine.catcherPositions[player.id];
        const catcherY = 135; 
        const catcherW = 34;
        const catcherH = 6;
        
        // Catcher Glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fbbf24'; // Amber-400
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(
            (catcherX - catcherW/2) * scaleX, 
            catcherY * scaleY, 
            catcherW * scaleX, 
            catcherH * scaleY
        );
        ctx.shadowBlur = 0;

        // Draw The Ball
        const ball = gameEngine.balls.get(player.id);
        if (ball) {
            ctx.fillStyle = player.color;
            ctx.beginPath();
            ctx.arc(ball.x * scaleX, ball.y * scaleY, ball.radius * scaleX, 0, Math.PI * 2);
            ctx.fill();
            
            // Shine effect
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc((ball.x - 2) * scaleX, (ball.y - 2) * scaleY, ball.radius * 0.3 * scaleX, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Stats Overlay
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`${gameEngine.scores[player.id]}`, 10, 25);
        
        // Territory Bar
        const totalTiles = 100*100;
        const percent = ((gameEngine.territoryCounts[player.id] / totalTiles) * 100).toFixed(1);
        ctx.font = '12px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Territory: ${percent}%`, 10, 45);
        
        // Game Phase
        ctx.font = '10px monospace';
        ctx.fillStyle = '#64748b';
        const phaseText = `Phase: ${gameEngine.gamePhase.toUpperCase()}`;
        ctx.fillText(phaseText, 10, 60);
        
        // Unit Type Legend
        ctx.font = '9px monospace';
        ctx.fillStyle = '#475569';
        ctx.fillText('Unit Types:', 10, 78);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('● Light', 10, 90);
        ctx.fillText('■ Heavy', 55, 90);
        
        // Base Health Display (at bottom)
        const clampedHp = Math.max(0, Math.min(500, player.coreHp));
        const healthRatio = clampedHp / 500;
        const healthBarWidth = w - 20;
        const healthBarHeight = 8;
        const healthBarX = 10;
        const healthBarY = h - 18;
        
        // Health bar background
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
        
        // Health bar fill
        let healthColor = '#ef4444';
        if (healthRatio > 0.5) healthColor = '#22c55e';
        else if (healthRatio > 0.25) healthColor = '#eab308';
        
        ctx.fillStyle = healthColor;
        ctx.fillRect(healthBarX, healthBarY, healthBarWidth * healthRatio, healthBarHeight);
        
        // Health text
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`BASE HP: ${Math.floor(clampedHp)}/500`, w / 2, healthBarY - 4);
        ctx.textAlign = 'start';
        
        // Border
        ctx.lineWidth = 4;
        ctx.strokeStyle = player.color;
        ctx.strokeRect(0, 0, w, h);
    };

    gameEngine.players.forEach(p => {
        drawPinball(p, `pinball-${p.id}`);
    });

    animationFrameRef.current = requestAnimationFrame(render);
  }, [isRunning, speed]); // Removed winner dependency

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(render);
    return () => {
        if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [render]);

  const { left, right } = getPanelPlayers();

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 z-10 shrink-0 shadow-lg">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black italic tracking-wider bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent">
            TERRITORY WARS: PINBALL
          </h1>
          <span className="text-xs text-slate-500 font-mono">WAR SIMULATION</span>
        </div>
        
        <div className="flex items-center gap-6">
          
          {/* Player Control */}
          <div className="flex items-center gap-3 bg-slate-700/50 px-4 py-1.5 rounded-full border border-slate-600">
            <span className="text-xs font-bold text-slate-400 uppercase">Players</span>
            <input 
              type="range" 
              min="2" 
              max="8" 
              value={playerCount} 
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              className="w-24 h-1.5 bg-slate-500 rounded-lg appearance-none cursor-pointer accent-blue-400"
            />
            <span className="text-sm font-mono font-bold text-blue-300 w-4 text-center">{playerCount}</span>
          </div>

          {/* Speed Control */}
          <div className="flex items-center gap-3 bg-slate-700/50 px-4 py-1.5 rounded-full border border-slate-600">
            <span className="text-xs font-bold text-slate-400 uppercase">Speed</span>
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={speed} 
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-24 h-1.5 bg-slate-500 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
            <span className="text-sm font-mono font-bold text-emerald-300 w-8 text-right">{speed}x</span>
          </div>

          <button 
            onClick={startGame}
            className="flex items-center gap-2 px-5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-full text-sm font-bold shadow-lg shadow-blue-900/50 transition-all hover:scale-105 active:scale-95 pointer-events-auto"
          >
            <RestartIcon /> 
            <span>RESTART WAR</span>
          </button>
        </div>
      </header>

      {/* Main Game Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Army Panel */}
        <div ref={leftPanelRef} className="w-1/4 flex flex-col bg-slate-900 border-r border-slate-800">
          {left.map((p) => (
            <div key={p.id} className="flex-1 relative border-b border-slate-800 p-2 min-h-0">
               <canvas 
                  id={`pinball-${p.id}`} 
                  width={300} 
                  height={450} 
                  className="w-full h-full object-contain block rounded bg-slate-800/50"
               />
            </div>
          ))}
        </div>

        {/* Center War Map */}
        <div className="w-1/2 bg-[#050505] relative flex items-center justify-center p-6 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]">
            <div className="relative w-full h-full max-w-[85vh] max-h-[85vh] aspect-square">
                <canvas 
                    ref={mapCanvasRef}
                    width={800}
                    height={800}
                    className="w-full h-full block rounded-full shadow-2xl ring-4 ring-slate-800"
                    style={{ background: '#0f172a' }}
                />
            </div>
        </div>

        {/* Right Army Panel */}
        <div ref={rightPanelRef} className="w-1/4 flex flex-col bg-slate-900 border-l border-slate-800">
          {right.map((p) => (
            <div key={p.id} className="flex-1 relative border-b border-slate-800 p-2 min-h-0">
               <canvas 
                  id={`pinball-${p.id}`} 
                  width={300} 
                  height={450} 
                  className="w-full h-full object-contain block rounded bg-slate-800/50"
               />
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default App;