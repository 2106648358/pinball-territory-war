import { PlayerConfig, Point, UnitType, TerrainType, TerrainCell, UnitStats } from '../types';

// Constants
const GRAVITY = 0.25; 
const FRICTION = 0.99;
const BOUNCE_DAMPING = 0.75; 
const MAP_GRID_SIZE = 100;

// Game Balance - WAR SIMULATION (Slower unit generation)
const JACKPOT_UNITS_BASE = 4;   // Reduced from 8
const MISS_UNITS_BASE = 2;      // Reduced from 4
const CATCHER_Y = 135; 
const CATCHER_WIDTH_BASE = 28;  // Reduced from 32
const CATCHER_WIDTH_MAX_BONUS = 12; // Reduced from 18

// Unit Type Stats (Simplified, slower movement)
const UNIT_STATS: Record<UnitType, UnitStats> = {
  light: {
    baseHp: 40,
    speed: 0.2,  // Reduced from 0.3
    captureRadius: 1.0,
    attackPower: 0.8,
    defenseBonus: 0.8,
    bonusAgainst: []
  },
  heavy: {
    baseHp: 80,
    speed: 0.15,  // Reduced from 0.2
    captureRadius: 2.0,
    attackPower: 1.8,
    defenseBonus: 2.0,
    bonusAgainst: []
  }
};

class Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number = 5.0;
  color: string;
  stuckFrames: number = 0;
  rewardCooldown: number = 0;
  pegHitCount: number = 0; // Track peg hits

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.vx = (Math.random() - 0.5) * 6;
    this.vy = Math.random() * 2;
    this.pegHitCount = 0;
  }

  update(width: number, height: number, pegs: Point[], catcherX: number, catcherWidth: number): number {
    if (this.rewardCooldown > 0) this.rewardCooldown--;

    this.vy += GRAVITY;
    this.vx *= FRICTION;
    this.vy *= FRICTION;

    this.x += this.vx;
    this.y += this.vy;

    // Anti-stuck
    const speedSq = this.vx * this.vx + this.vy * this.vy;
    if (speedSq < 0.2) {
      this.stuckFrames++;
      if (this.stuckFrames > 30) {
        this.vy = -3 - Math.random() * 3;
        this.vx = (Math.random() - 0.5) * 8;
        this.stuckFrames = 0;
      }
    } else {
      this.stuckFrames = 0;
    }

    // Walls
    if (this.x < this.radius) {
      this.x = this.radius;
      this.vx *= -0.6;
    } else if (this.x > width - this.radius) {
      this.x = width - this.radius;
      this.vx *= -0.6;
    }

    // Pegs
    const pegRadius = 3;
    const minDist = this.radius + pegRadius;
    const minDistSq = minDist * minDist;

    for (const peg of pegs) {
      const dx = this.x - peg.x;
      const dy = this.y - peg.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistSq) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        
        const dot = this.vx * nx + this.vy * ny;
        if (dot < 0) {
            // Add randomness to peg bounce
            const randomFactor = 0.9 + (Math.random() * 0.2); // 0.9 to 1.1
            this.vx = (this.vx - 2 * dot * nx) * BOUNCE_DAMPING * randomFactor;
            this.vy = (this.vy - 2 * dot * ny) * BOUNCE_DAMPING * randomFactor;
            
            // Track peg hits
            this.pegHitCount++;
        }
        const overlap = minDist - dist;
        this.x += nx * overlap;
        this.y += ny * overlap;
      }
    }

    // Catcher Logic (Dynamic Width)
    const halfW = catcherWidth / 2;
    if (this.x >= catcherX - halfW - this.radius && 
        this.x <= catcherX + halfW + this.radius) {
        
        if (this.y + this.radius >= CATCHER_Y && 
            this.y - this.radius <= CATCHER_Y + 10 && 
            this.vy > 0) {
            
            this.y = CATCHER_Y - this.radius;
            
            // Enhanced bounce logic
            const hitOffset = (this.x - catcherX) / halfW;
            
            // Base bounce speed with more variation
            const baseBounce = 1.4 + (Math.random() * 0.4); // 1.4 to 1.8
            this.vy = -Math.abs(this.vy) * baseBounce;
            
            // Cap maximum vertical speed
            if (this.vy < -18) this.vy = -18;

            // Enhanced horizontal velocity based on hit position
            // Hitting center: less horizontal, Hitting edges: more horizontal
            this.vx += hitOffset * 4; // Increased from 2
            
            // Add some randomness to make it more challenging
            this.vx += (Math.random() - 0.5) * 1.5;

            if (this.rewardCooldown === 0) {
                this.rewardCooldown = 45; 
                return 2; // JACKPOT
            }
        }
    }

    if (this.y > height + this.radius) return 1; // MISS
    return 0;
  }
}

export class Unit {
  x: number;
  y: number;
  playerId: number;
  color: string;
  speed: number; 
  active: boolean = true;
  angle: number;
  captureRadius: number;
  hp: number;
  maxHp: number;
  unitType: UnitType;
  attackPower: number;
  defenseBonus: number;
  bonusAgainst: UnitType[];
  battleEffect: number = 0;
  trail: Point[] = []; // Trail for light units
  bounceCooldown: number = 0; // Cooldown for bouncing (heavy units only)
  maxDistance: number; // Maximum distance unit can travel from spawn point
  spawnPosition: Point; // Initial spawn position
  leftTerritoryPosition: Point | null; // Position where unit left own territory

  constructor(
    x: number, 
    y: number, 
    playerId: number, 
    color: string, 
    angle: number, 
    unitType: UnitType, 
    hpMultiplier: number,
    gamePhase: 'early' | 'mid' | 'late'
  ) {
    this.x = x;
    this.y = y;
    this.playerId = playerId;
    this.color = color;
    this.angle = angle;
    this.unitType = unitType;
    
    // Record spawn position for distance tracking
    this.spawnPosition = { x, y };
    this.leftTerritoryPosition = null; // Initially null - unit starts in own territory
    
    const stats = UNIT_STATS[unitType];
    
    // Set max distance based on unit type
    // Light units: max 1 tile, Heavy units: max 1.5 tiles
    this.maxDistance = unitType === 'light' ? 1.0 : 1.5;
    
    // Phase-based scaling
    let phaseMultiplier = 1.0;
    if (gamePhase === 'mid') phaseMultiplier = 1.2;
    if (gamePhase === 'late') phaseMultiplier = 1.4;
    
    this.speed = stats.speed;
    this.captureRadius = stats.captureRadius;
    this.attackPower = stats.attackPower * phaseMultiplier;
    this.defenseBonus = stats.defenseBonus;
    this.bonusAgainst = stats.bonusAgainst;
    
    // HP calculation
    const baseHp = stats.baseHp * hpMultiplier * phaseMultiplier;
    this.hp = baseHp;
    this.maxHp = baseHp;
    
    // Initialize trail
    this.trail = [];
  }

  update(grid: number[][], terrainGrid: TerrainCell[][], gridSize: number, players: PlayerConfig[], allUnits: Unit[]): boolean {
    if (!this.active) return false;

    // Add current position to trail for light units
    if (this.unitType === 'light') {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 5) {  // Reduced from 8
        this.trail.shift();
      }
    }

    // Movement
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;

    const gx = Math.floor(this.x);
    const gy = Math.floor(this.y);

    if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) {
      this.active = false;
      return false;
    }

    const currentOwner = grid[gy][gx];

    // Check if unit is in own territory
    if (currentOwner === this.playerId) {
      // In own territory - can move freely
      // BUT: only reset if we're in the original territory, not newly captured territory
      // Check if this position was part of the original territory
      const distFromSpawn = Math.sqrt(
        Math.pow(this.x - this.spawnPosition.x, 2) + 
        Math.pow(this.y - this.spawnPosition.y, 2)
      );
      
      // Only reset if we're close to spawn (within 2 tiles) - indicating original territory
      if (distFromSpawn < 2.0) {
        this.leftTerritoryPosition = null;
      }
      // If we're in newly captured territory (far from spawn), keep the distance limit
    } else {
      // Outside own territory (neutral or enemy territory)
      if (this.leftTerritoryPosition === null) {
        // Just left own territory - record this position
        this.leftTerritoryPosition = { x: this.x, y: this.y };
      } else {
        // Check distance from where we left territory
        const distanceFromTerritory = Math.sqrt(
          Math.pow(this.x - this.leftTerritoryPosition.x, 2) + 
          Math.pow(this.y - this.leftTerritoryPosition.y, 2)
        );
        
        // Check if unit has exceeded max distance
        if (distanceFromTerritory > this.maxDistance) {
          this.active = false;
          return false;
        }
      }
    }

    const terrain = terrainGrid[gy][gx];

    // Bounce logic for heavy units only
    if (this.unitType === 'heavy' && this.bounceCooldown <= 0) {
      let bounced = false;
      const margin = 0.5;
      
      // Check boundaries and bounce
      if (this.x <= margin) {
        this.x = margin;
        this.angle = Math.PI - this.angle;
        bounced = true;
      } else if (this.x >= gridSize - margin) {
        this.x = gridSize - margin;
        this.angle = Math.PI - this.angle;
        bounced = true;
      }
      
      if (this.y <= margin) {
        this.y = margin;
        this.angle = -this.angle;
        bounced = true;
      } else if (this.y >= gridSize - margin) {
        this.y = gridSize - margin;
        this.angle = -this.angle;
        bounced = true;
      }
      
      if (bounced) {
        this.bounceCooldown = 20; // 20 frame cooldown
        // Restore less HP on bounce
        this.hp = Math.min(this.maxHp, this.hp + 20); // Reduced from 50
      }
    }
    
    // Decrease bounce cooldown
    if (this.bounceCooldown > 0) {
      this.bounceCooldown--;
    }

    // Terrain effects
    let speedModifier = 1.0;
    let defenseModifier = 1.0;
    
    if (terrain.type === 'highground') {
      defenseModifier = 1.2; // Reduced from 1.3
      speedModifier = 0.9;   // Increased from 0.8
    } else if (terrain.type === 'obstacle') {
      speedModifier = 0.7;   // Increased from 0.5
    } else if (terrain.type === 'supply') {
      if (this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + 1.0); // Increased from 0.5
      }
    }

    // Apply terrain modifiers
    const effectiveSpeed = this.speed * speedModifier;
    this.x += Math.cos(this.angle) * (effectiveSpeed - this.speed);
    this.y += Math.sin(this.angle) * (effectiveSpeed - this.speed);

    // Inside own territory
    if (currentOwner === this.playerId) {
      this.x += Math.cos(this.angle) * 0.01;  // Reduced from 0.05 - almost no extra speed
      this.y += Math.sin(this.angle) * 0.01;  // Reduced from 0.05 - almost no extra speed
      return false;
    }

    // COMBAT LOGIC
    let resistanceMult = 1.0;
    let isEnemyTerritory = false;
    
    if (currentOwner !== -1 && players[currentOwner]?.isAlive) {
      resistanceMult = 5.0; // Increased from 3.5 for much slower expansion
      isEnemyTerritory = true;
    }

    // Check for nearby enemy units
    const nearbyEnemies = allUnits.filter(u => 
      u.active && 
      u.playerId !== this.playerId &&
      u.playerId === currentOwner &&
      Math.abs(u.x - this.x) < 3 &&
      Math.abs(u.y - this.y) < 3
    );

    // Unit type counter system
    let typeBonus = 1.0;
    for (const enemy of nearbyEnemies) {
      if (this.bonusAgainst.includes(enemy.unitType)) {
        typeBonus = 1.5; // Bonus damage against countered units
        this.battleEffect = 10;
        break;
      }
      if (enemy.bonusAgainst.includes(this.unitType)) {
        typeBonus = 0.7; // Reduced damage when countered
        break;
      }
    }

    // Calculate capture cost
    const pixelsPainted = this.paintArea(grid, gridSize, gx, gy, this.playerId, this.captureRadius);
    
    if (pixelsPainted > 0) {
      const baseCost = pixelsPainted * resistanceMult;
      // Add extra cost for neutral territory to slow expansion
      const neutralCost = currentOwner === -1 ? baseCost * 2.0 : baseCost; // Increased from 1.5
      const terrainCost = terrain.type === 'highground' ? neutralCost * 1.5 : neutralCost;
      let finalCost = terrainCost / (this.attackPower * typeBonus * defenseModifier);
      
      // Heavy units take less damage to extend lifespan
      if (this.unitType === 'heavy') {
        finalCost *= 0.7; // Reduced from 0.5 (more damage)
      }
      
      this.hp -= finalCost;
    } else {
      // No idle damage - units only die from exceeding max distance or capture cost
    }
    
    if (this.hp <= 0) {
      this.active = false;
    }
    
    return isEnemyTerritory;
  }

  paintArea(grid: number[][], gridSize: number, cx: number, cy: number, pid: number, radius: number): number {
    let paintedCount = 0;
    const rSq = radius * radius;
    const rCeil = Math.ceil(radius);

    for (let y = -rCeil; y <= rCeil; y++) {
      for (let x = -rCeil; x <= rCeil; x++) {
        if (x*x + y*y <= rSq) {
          const px = cx + x;
          const py = cy + y;
          if (px >= 0 && px < gridSize && py >= 0 && py < gridSize) {
            if (grid[py][px] !== pid) {
                grid[py][px] = pid;
                paintedCount++;
            }
          }
        }
      }
    }
    return paintedCount;
  }
}

export class GameEngine {
  players: PlayerConfig[] = [];
  balls: Map<number, Ball> = new Map();
  units: Unit[] = [];
  grid: number[][] = [];
  terrainGrid: TerrainCell[][] = [];
  pegs: Point[] = [];
  
  tick: number = 0; 
  catcherPhases: number[] = [];
  catcherPositions: number[] = []; 
  scores: number[] = [];
  territoryCounts: number[] = [];
  winner: number | null = null;
  
  // New: Streak tracking for catch/miss
  catchStreaks: number[] = []; // Consecutive catches
  missStreaks: number[] = [];   // Consecutive misses
  catchMultipliers: number[] = []; // Reward multipliers based on streaks
  catcherWidths: number[] = []; // Temporary width penalties
  pegHitCounts: number[] = []; // Number of pegs hit by each ball
  gamePhase: 'early' | 'mid' | 'late' = 'early';
  spawnAngles: number[] = []; // Slowly rotating spawn angles for each player

  constructor() {
    this.initGrid();
  }

  initGrid() {
    this.grid = Array(MAP_GRID_SIZE).fill(null).map(() => Array(MAP_GRID_SIZE).fill(-1));
    this.terrainGrid = Array(MAP_GRID_SIZE).fill(null).map(() => 
      Array(MAP_GRID_SIZE).fill(null).map(() => ({
        type: 'normal' as TerrainType,
        owner: -1,
        bonus: 1.0
      }))
    );
  }

  setup(playerCount: number) {
    this.players = [];
    this.balls = new Map();
    this.units = [];
    this.initGrid();
    this.scores = new Array(playerCount).fill(0);
    this.territoryCounts = new Array(playerCount).fill(100);
    this.pegs = [];
    this.tick = 0;
    this.winner = null;
    this.gamePhase = 'early';

    this.catcherPhases = new Array(playerCount).fill(0).map(() => Math.random() * Math.PI * 2);
    this.catcherPositions = new Array(playerCount).fill(50);
    
    // Initialize streak tracking
    this.catchStreaks = new Array(playerCount).fill(0);
    this.missStreaks = new Array(playerCount).fill(0);
    this.catchMultipliers = new Array(playerCount).fill(1.0);
    this.catcherWidths = new Array(playerCount).fill(0);
    this.pegHitCounts = new Array(playerCount).fill(0);
    this.spawnAngles = new Array(playerCount).fill(0); // Initialize empty array

    const centerX = 0.5;
    const centerY = 0.5;
    const mapRadius = 0.40;

    for (let i = 0; i < playerCount; i++) {
      const angle = (Math.PI * 2 * i) / playerCount;
      const basePos = {
        x: centerX + mapRadius * Math.cos(angle),
        y: centerY + mapRadius * Math.sin(angle)
      };

      this.players.push({
        id: i,
        color: `hsl(${Math.floor(360 * i / playerCount)}, 70%, 50%)`,
        basePosition: basePos,
        isAlive: true,
        coreHp: 500, // Increased from 200 for longer games
        armyPower: 0,
        baseRadius: 8 // Base territory radius in grid cells
      });
      
      this.initializeTerritory(i, basePos);
      this.spawnBall(i);
    }

    // Initialize spawn angles to point toward map center (after players are created)
    this.spawnAngles = this.players.map(p => {
      const bx = p.basePosition.x * MAP_GRID_SIZE;
      const by = p.basePosition.y * MAP_GRID_SIZE;
      const centerAngle = Math.atan2(50 - by, 50 - bx);
      // Add slight random variation
      return centerAngle + (Math.random() - 0.5) * 1.0;
    });

    this.generateTerrain();
  }

  generateTerrain() {
    // Generate strategic terrain features
    const numHighgrounds = 8;
    const numObstacles = 12;
    const numSupplyPoints = 6;

    // Highgrounds (strategic defensive positions)
    for (let i = 0; i < numHighgrounds; i++) {
      const cx = 20 + Math.random() * 60;
      const cy = 20 + Math.random() * 60;
      const radius = 6 + Math.random() * 4;
      
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          if (x*x + y*y <= radius*radius) {
            const gy = Math.floor(cy + y);
            const gx = Math.floor(cx + x);
            if (gy >= 0 && gy < MAP_GRID_SIZE && gx >= 0 && gx < MAP_GRID_SIZE) {
              this.terrainGrid[gy][gx] = {
                type: 'highground',
                owner: -1,
                bonus: 1.3
              };
            }
          }
        }
      }
    }

    // Obstacles (choke points)
    for (let i = 0; i < numObstacles; i++) {
      const cx = 15 + Math.random() * 70;
      const cy = 15 + Math.random() * 70;
      const radius = 3 + Math.random() * 3;
      
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          if (x*x + y*y <= radius*radius) {
            const gy = Math.floor(cy + y);
            const gx = Math.floor(cx + x);
            if (gy >= 0 && gy < MAP_GRID_SIZE && gx >= 0 && gx < MAP_GRID_SIZE) {
              this.terrainGrid[gy][gx] = {
                type: 'obstacle',
                owner: -1,
                bonus: 1.0
              };
            }
          }
        }
      }
    }

    // Supply points (healing zones)
    for (let i = 0; i < numSupplyPoints; i++) {
      const cx = 25 + Math.random() * 50;
      const cy = 25 + Math.random() * 50;
      const radius = 4;
      
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          if (x*x + y*y <= radius*radius) {
            const gy = Math.floor(cy + y);
            const gx = Math.floor(cx + x);
            if (gy >= 0 && gy < MAP_GRID_SIZE && gx >= 0 && gx < MAP_GRID_SIZE) {
              this.terrainGrid[gy][gx] = {
                type: 'supply',
                owner: -1,
                bonus: 1.0
              };
            }
          }
        }
      }
    }
  }

  initializeTerritory(playerId: number, basePos: Point) {
      const centerGridX = Math.floor(basePos.x * MAP_GRID_SIZE);
      const centerGridY = Math.floor(basePos.y * MAP_GRID_SIZE);
      const radius = 18; // Increased from 14

      for(let y = -radius; y <= radius; y++) {
          for(let x = -radius; x <= radius; x++) {
              if (x*x + y*y <= radius*radius) {
                  const gy = centerGridY + y;
                  const gx = centerGridX + x;
                  if (gy >= 0 && gy < MAP_GRID_SIZE && gx >= 0 && gx < MAP_GRID_SIZE) {
                      this.grid[gy][gx] = playerId;
                  }
              }
          }
      }
  }

  spawnBall(playerId: number) {
    if (!this.players[playerId].isAlive) return;
    const startX = 30 + Math.random() * 40; 
    const ball = new Ball(startX, -10, this.players[playerId].color);
    this.balls.set(playerId, ball);
  }

  spawnWave(playerId: number, amountBase: number, isJackpot: boolean) {
    if (!this.players[playerId].isAlive) return;

    const p = this.players[playerId];
    const bx = p.basePosition.x * MAP_GRID_SIZE;
    const by = p.basePosition.y * MAP_GRID_SIZE;
    
    // BALANCED CALCULATIONS
    const totalPixels = MAP_GRID_SIZE * MAP_GRID_SIZE;
    const ownedPixels = this.territoryCounts[playerId] || 100;
    const dominance = Math.min(1.0, Math.max(0.01, ownedPixels / totalPixels));

    // 1. Quantity Bonus - Reduced
    const quantityBonus = Math.floor(dominance * 3); // Reduced from 7
    const finalAmount = amountBase + quantityBonus;

    // 2. Quality (HP) Bonus - Reduced scaling
    const hpMultiplier = 1.0 + (dominance * 0.3); // Reduced from 0.5

    // 3. CATCH-UP MECHANISM - Weaker
    let catchUpBonus = 0;
    if (dominance < 0.2) {
      catchUpBonus = Math.floor((0.2 - dominance) * 6); // Reduced from 12
    }

    // 4. Aim Spread
    const spreadFactor = 0.5 + (dominance * 1.0);

    // Use slowly rotating spawn angle
    const baseAngle = this.spawnAngles[playerId];
    
    // Mix of unit types based on game phase
    const unitMix = this.getUnitMix(isJackpot);
    
    for(let i=0; i<finalAmount + catchUpBonus; i++) {
        const offsetX = (Math.random() - 0.5) * 4;
        const offsetY = (Math.random() - 0.5) * 4;
        
        const spread = (Math.random() - 0.5) * spreadFactor; 
        const unitAngle = baseAngle + spread;

        // Select unit type based on mix
        const unitType = this.selectUnitType(unitMix);
        
        this.units.push(new Unit(
          bx + offsetX, 
          by + offsetY, 
          playerId, 
          p.color, 
          unitAngle, 
          unitType, 
          hpMultiplier,
          this.gamePhase
        ));
    }
  }

  getUnitMix(isJackpot: boolean): Record<UnitType, number> {
    if (isJackpot) {
      return {
        light: 0.3,
        heavy: 0.7
      };
    } else {
      return {
        light: 0.5,
        heavy: 0.5
      };
    }
  }

  selectUnitType(mix: Record<UnitType, number>): UnitType {
    const rand = Math.random();
    let cumulative = 0;
    
    for (const [type, probability] of Object.entries(mix)) {
      cumulative += probability;
      if (rand < cumulative) {
        return type as UnitType;
      }
    }
    return 'assault';
  }

  checkSurvival() {
      let aliveCount = 0;
      let lastAliveId = -1;

      this.players.forEach(p => {
          if (!p.isAlive) return;

          const cx = Math.floor(p.basePosition.x * MAP_GRID_SIZE);
          const cy = Math.floor(p.basePosition.y * MAP_GRID_SIZE);
          const radius = p.baseRadius;

          // Check if base territory is under attack
          let controlledCells = 0;
          let totalCells = 0;

          for(let y = -radius; y <= radius; y++) {
              for(let x = -radius; x <= radius; x++) {
                  if (x*x + y*y <= radius*radius) {
                      totalCells++;
                      const gy = cy + y;
                      const gx = cx + x;
                      if (gy >= 0 && gy < MAP_GRID_SIZE && gx >= 0 && gx < MAP_GRID_SIZE) {
                          if (this.grid[gy][gx] === p.id) {
                              controlledCells++;
                          }
                      }
                  }
              }
          }

          const controlRatio = totalCells > 0 ? controlledCells / totalCells : 0;

          // HP is directly tied to base control ratio
          p.coreHp = controlRatio * 500;

          // Eliminate if base is completely lost
          if (controlRatio < 0.1) {
              p.isAlive = false;
              this.balls.delete(p.id);
          }

          // Count all alive players
          if (p.isAlive) {
              aliveCount++;
              lastAliveId = p.id;
          }
      });

      // Win Condition 1: Only one player remains
      if (aliveCount === 1) {
          this.winner = lastAliveId;
      }

      // Win Condition 2: Complete domination (100% territory)
      const totalPixels = MAP_GRID_SIZE * MAP_GRID_SIZE;
      for (let i = 0; i < this.players.length; i++) {
          if (this.players[i].isAlive && this.territoryCounts[i] >= totalPixels) {
              this.winner = i;
              break;
          }
      }
  }

  updateGamePhase() {
    const totalPixels = MAP_GRID_SIZE * MAP_GRID_SIZE;
    const maxTerritory = Math.max(...this.territoryCounts);
    const maxDominance = maxTerritory / totalPixels;

    if (maxDominance < 0.25) {
      this.gamePhase = 'early';
    } else if (maxDominance < 0.50) {
      this.gamePhase = 'mid';
    } else {
      this.gamePhase = 'late';
    }
  }

  update(pinballWidth: number, pinballHeight: number) {
    if (this.pegs.length === 0) {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 4; c++) {
            const stagger = (r % 2) * 12;
            this.pegs.push({ x: 14 + c * 24 + stagger, y: 40 + r * 25 });
        }
      }
    }
    
    this.tick++;
    const time = this.tick * 0.04; 

    // Smart spawn angle adjustment - point toward map center with random variation
    if (this.tick % 180 === 0) { // Every 3 seconds at 60fps
      this.players.forEach((p, idx) => {
        if (!p.isAlive) return;
        
        // Calculate angle toward map center
        const bx = p.basePosition.x * MAP_GRID_SIZE;
        const by = p.basePosition.y * MAP_GRID_SIZE;
        const centerAngle = Math.atan2(50 - by, 50 - bx);
        
        // Add random variation (-60 to +60 degrees)
        const randomVariation = (Math.random() - 0.5) * 2.1;
        
        // Blend current angle with center angle (80% center, 20% random)
        this.spawnAngles[idx] = centerAngle + randomVariation;
      });
    }

    this.checkSurvival();
    this.updateGamePhase();
    
    const totalPixels = MAP_GRID_SIZE * MAP_GRID_SIZE;

    this.players.forEach(p => {
      if (!p.isAlive) return;
      
      const phase = this.catcherPhases[p.id];
      const cx = 50 + Math.sin(time + phase) * 30;
      this.catcherPositions[p.id] = cx;

      const owned = this.territoryCounts[p.id] || 0;
      const dominance = owned / totalPixels;
      
      // CATCH-UP: Underdogs get MUCH wider catchers, dominators get narrower
      let catcherBonus = dominance * CATCHER_WIDTH_MAX_BONUS;
      if (dominance < 0.15) {
        catcherBonus += 15; // Increased from 8 - huge bonus for underdogs
      } else if (dominance > 0.5) {
        catcherBonus -= 5; // Penalty for dominators
      }
      
      const baseCatcherWidth = CATCHER_WIDTH_BASE + catcherBonus;
      
      // Apply miss streak penalty
      const currentCatcherWidth = Math.max(15, baseCatcherWidth * (this.catcherWidths[p.id] || 1.0));

      const ball = this.balls.get(p.id);
      if (ball) {
        const status = ball.update(pinballWidth, pinballHeight, this.pegs, cx, currentCatcherWidth);
        
        if (status === 2) { 
          // JACKPOT - Simplified reward rules
          
          // Rule 1: Catch streak multiplier (1.0 to 3.0)
          const streakMultiplier = this.catchMultipliers[p.id];
          
          // Rule 2: Peg hit bonus (more hits = more bonus)
          const pegHitBonus = 1.0 + (ball.pegHitCount * 0.1); // Each peg hit = +10% bonus
          
          // Combine multipliers
          const totalMultiplier = streakMultiplier * pegHitBonus;
          
          const adjustedUnits = Math.floor(JACKPOT_UNITS_BASE * totalMultiplier);
          
          this.scores[p.id] += adjustedUnits;
          this.spawnWave(p.id, adjustedUnits, true);
          
          // Increase catch streak and multiplier
          this.catchStreaks[p.id]++;
          this.missStreaks[p.id] = 0;
          
          // Update multiplier: 1.0 + 0.2 * streak, max 3.0
          this.catchMultipliers[p.id] = Math.min(3.0, 1.0 + (this.catchStreaks[p.id] * 0.2));
          
          // Restore catcher width on successful catch
          this.catcherWidths[p.id] = 1.0;
          
        } else if (status === 1) {
          // MISS - Apply penalty based on miss streak
          this.scores[p.id] += MISS_UNITS_BASE;
          this.spawnWave(p.id, MISS_UNITS_BASE, false);
          this.spawnBall(p.id);
          
          // Increase miss streak, reset catch streak
          this.missStreaks[p.id]++;
          this.catchStreaks[p.id] = 0;
          this.catchMultipliers[p.id] = 1.0;
          
          // Penalty: reduce catcher width temporarily
          if (this.missStreaks[p.id] >= 3) {
            // 3+ consecutive misses = penalty
            this.catcherWidths[p.id] = (this.catcherWidths[p.id] || 1.0) * 0.9;
          }
        }
      }
    });

    let territoryChanged = false;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const unit = this.units[i];
      if (!unit.active) {
        this.units.splice(i, 1);
        continue;
      }
      const changed = unit.update(this.grid, this.terrainGrid, MAP_GRID_SIZE, this.players, this.units);
      if (changed) territoryChanged = true;
    }

    if (territoryChanged || this.tick % 10 === 0) {
      const counts = new Array(this.players.length).fill(0);
      for(let y=0; y<MAP_GRID_SIZE; y++) {
        for(let x=0; x<MAP_GRID_SIZE; x++) {
          const owner = this.grid[y][x];
          if (owner !== -1) counts[owner]++;
        }
      }
      this.territoryCounts = counts;
    }
  }
}

export const gameEngine = new GameEngine();