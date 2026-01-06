import { PlayerConfig, Point, UnitType, TerrainType, TerrainCell, UnitStats } from '../types';

// Constants
const GRAVITY = 0.15;  // Reduced from 0.25 - Slower gravity for slower ball movement
const FRICTION = 0.99;
const BOUNCE_DAMPING = 0.75; 
const MAP_GRID_SIZE = 100;

// Game Balance - WAR SIMULATION (Slower unit generation)
const JACKPOT_UNITS_BASE = 8;   // Increased from 4 - More units per jackpot
const MISS_UNITS_BASE = 4;      // Increased from 2 - More units per miss
const CATCHER_Y = 135; 
const CATCHER_WIDTH_BASE = 28;  // Reduced from 32
const CATCHER_WIDTH_MAX_BONUS = 12; // Reduced from 18

// Unit Type Stats (Increased speed for more dynamic gameplay)
const UNIT_STATS: Record<UnitType, UnitStats> = {
  light: {
    baseHp: 45, // Increased from 40 - Better survival
    speed: 0.5,  // Increased from 0.45 - Even faster movement
    captureRadius: 1.2, // Increased from 1.0 - Faster territory capture
    attackPower: 1.0, // Increased from 0.8 - Faster combat
    defenseBonus: 0.9, // Increased from 0.8 - Better survival
    bonusAgainst: []
  },
  heavy: {
    baseHp: 90, // Increased from 80 - Better survival
    speed: 0.45,  // Increased from 0.4 - Even faster movement
    captureRadius: 2.5, // Increased from 2.2 - Faster territory capture
    attackPower: 2.0, // Increased from 1.8 - Faster combat
    defenseBonus: 2.2, // Increased from 2.0 - Better survival
    bonusAgainst: []
  }
};

class Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number = 100.0;
  color: string;
  stuckFrames: number = 0;
  rewardCooldown: number = 0;
  pegHitCount: number = 0; // Track peg hits

  // NEW: Combo system
  comboPoints: number = 0; // Combo points for multiplier
  maxComboPoints: number = 0; // Track maximum combo for this ball
  ballTick: number = 0; // For random seed

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    this.color = color;
    // NEW: Reduced initial velocity for more realistic free fall
    this.vx = (Math.random() - 0.5) * 1.5; // Reduced from 2 - Slower initial velocity
    this.vy = Math.random() * 0.3; // Reduced from 0.5 - Slower initial velocity
    this.pegHitCount = 0;
    this.comboPoints = 0;
    this.maxComboPoints = 0;
    this.ballTick = 0;
    this.radius = 6.0; // Increased from 5.0 - Larger ball for better visibility
  }

  update(width: number, height: number, pegs: any[]): number {
    this.ballTick++;
    if (this.rewardCooldown > 0) this.rewardCooldown--;

    this.vy += GRAVITY;
    this.vx *= FRICTION;
    this.vy *= FRICTION;

    this.x += this.vx;
    this.y += this.vy;

    // Anti-stuck - Enhanced
    const speedSq = this.vx * this.vx + this.vy * this.vy;
    if (speedSq < 0.2) {
      this.stuckFrames++;
      if (this.stuckFrames > 20) { // Reduced from 30 for faster recovery
        // Force ball to move upward with random horizontal velocity
        this.vy = -4 - Math.random() * 4; // Increased upward force
        this.vx = (Math.random() - 0.5) * 10; // Increased horizontal variation
        this.stuckFrames = 0;
      }
    } else {
      this.stuckFrames = 0;
    }

    // Additional anti-stuck: Check if ball is trapped between pegs
    let nearbyPegs = 0;
    for (const peg of pegs) {
      const dx = this.x - peg.x;
      const dy = this.y - peg.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 10) { // Increased from 8 - Larger detection radius
        nearbyPegs++;
      }
    }

    // If surrounded by too many pegs, force escape
    if (nearbyPegs >= 3 && speedSq < 1.0) {
      this.vy = -5; // Strong upward force
      this.vx = (this.x > 50) ? -3 : 3; // Move toward center
    }

    // Walls with improved physics
    if (this.x < this.radius) {
      this.x = this.radius;

      // Calculate incident angle (0 = perpendicular, 90 = grazing)
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const incidentAngle = Math.abs(Math.atan2(this.vy, this.vx)) * (180 / Math.PI);

      // Angle-based damping
      // Perpendicular hits lose more energy, grazing hits lose less
      const angleFactor = 0.5 + (incidentAngle / 90) * 0.3; // 0.5 at 0°, 0.8 at 90°
      this.vx *= -angleFactor;

    } else if (this.x > width - this.radius) {
      this.x = width - this.radius;

      // Calculate incident angle
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const incidentAngle = Math.abs(Math.atan2(this.vy, -this.vx)) * (180 / Math.PI);

      // Angle-based damping
      const angleFactor = 0.5 + (incidentAngle / 90) * 0.3;
      this.vx *= -angleFactor;
    }

    // NEW: Multi-layer pegs and combo system with improved physics
    const pegRadius = 4;  // Increased from 3 - Larger pegs for better visibility
    const minDist = this.radius + pegRadius;
    const minDistSq = minDist * minDist;

    // Track closest peg for continuous collision detection
    let closestPeg = null;
    let closestDistSq = Infinity;
    let closestDx = 0;
    let closestDy = 0;

    for (const peg of pegs) {
      const dx = this.x - peg.x;
      const dy = this.y - peg.y;
      const distSq = dx * dx + dy * dy;

      // Find closest peg
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestPeg = peg;
        closestDx = dx;
        closestDy = dy;
      }
    }

    // Process collision with closest peg
    if (closestPeg && closestDistSq < minDistSq) {
      const dist = Math.sqrt(closestDistSq);
      const nx = closestDx / dist; // Normal vector
      const ny = closestDy / dist;

      // Check if ball is moving toward the peg
      const dot = this.vx * nx + this.vy * ny;

      if (dot < 0) {
        // Calculate incident angle (0 = head-on, 90 = grazing)
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const incidentAngle = Math.abs(Math.asin(dot / speed)) * (180 / Math.PI);

        // Calculate tangential velocity (velocity along the peg surface)
        const tx = -ny; // Tangent vector (perpendicular to normal)
        const ty = nx;
        const tangentialVel = this.vx * tx + this.vy * ty;

        // Angle-based energy conservation
        // Head-on collisions lose more energy, grazing collisions lose less
        const angleFactor = 1.0 - (incidentAngle / 180) * 0.3; // 1.0 at 0°, 0.7 at 90°
        const effectiveDamping = BOUNCE_DAMPING * angleFactor;

        // Reflect normal component
        const normalVel = dot;
        const reflectedNormalVel = -normalVel * effectiveDamping;

        // Preserve tangential component with slight friction
        const tangentialFriction = 0.95; // Slightly reduce tangential velocity
        const newTangentialVel = tangentialVel * tangentialFriction;

        // Combine components
        this.vx = reflectedNormalVel * nx + newTangentialVel * tx;
        this.vy = reflectedNormalVel * ny + newTangentialVel * ty;

        // Add small random perturbation for variety (much smaller than before)
        const randomAngle = (Math.random() - 0.5) * 0.1; // ±0.05 radians (~3°)
        const cos = Math.cos(randomAngle);
        const sin = Math.sin(randomAngle);
        const newVx = this.vx * cos - this.vy * sin;
        const newVy = this.vx * sin + this.vy * cos;
        this.vx = newVx;
        this.vy = newVy;

        // Track peg hits
        this.pegHitCount++;

        // Combo system - Add points based on peg type
        if (closestPeg.type === 'normal') {
          this.comboPoints += 1;
        } else if (closestPeg.type === 'gold') {
          this.comboPoints += 3;
        } else if (closestPeg.type === 'red') {
          this.comboPoints -= 2;
        }

        // Track maximum combo
        this.maxComboPoints = Math.max(this.maxComboPoints, this.comboPoints);
      }

      // Position correction - push ball out of peg
      const overlap = minDist - dist;
      this.x += nx * overlap;
      this.y += ny * overlap;
    }

    // NEW: Random scoring system based on ball position and velocity
    // 1. 当小球到达底部时，根据速度和位置计算随机分数
    if (this.y > height + this.radius) {
      // 计算随机性因素
      const speedFactor = Math.min(1.0, Math.sqrt(speedSq) / 10); // 速度因子 (0-1)
      const xPositionFactor = Math.abs(this.x - 50) / 50; // 位置因子 (中心为0，边缘为1)
      const comboFactor = Math.min(2.0, 1.0 + (this.comboPoints / 20)); // 连击因子 (1-2)
      
      // 随机数种子 - 使用更多随机性
      const randomSeed = (this.x * 100 + this.y + this.ballTick + Math.random() * 100) % 100;
      
      // 基础分数 - 增加更大的差异范围
      let baseScore = 2;
      
      // 随机性调整 - 增加极端情况的概率
      if (randomSeed < 15) {
        baseScore = 0; // 15% 概率得0分 - 增加失败率
      } else if (randomSeed < 40) {
        baseScore = 1; // 25% 概率低分
      } else if (randomSeed < 70) {
        baseScore = 2; // 30% 概率中分
      } else if (randomSeed < 90) {
        baseScore = 4; // 20% 概率高分 - 增加奖励
      } else {
        baseScore = 8; // 10% 概率大奖 - 大幅增加
      }
      
      // 应用因子 - 增加位置影响
      const finalScore = Math.floor(baseScore * speedFactor * comboFactor * (1.0 - xPositionFactor * 0.5));
      
      // 确保至少0分（可以是0）
      return Math.max(0, finalScore);
    }
    
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
    // Increased max distance to allow units to penetrate deeper and break stalemates
    this.maxDistance = unitType === 'light' ? 3.5 : 5.0; // Increased from 3.0/4.0 to 3.5/5.0 for deeper penetration
    
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
      if (this.trail.length > 8) {  // Increased from 5 - Longer trail for better visibility
        this.trail.shift();
      }
    }

    // Movement - straight line without random variations
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
        this.bounceCooldown = 15; // Reduced from 20 - More frequent bounces
        // Restore less HP on bounce
        this.hp = Math.min(this.maxHp, this.hp + 30); // Increased from 20 - Better survival
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
      defenseModifier = 1.1; // Reduced from 1.2 - Less defensive bonus
      speedModifier = 0.95;  // Increased from 0.9 - Less speed penalty
    } else if (terrain.type === 'obstacle') {
      speedModifier = 0.8;   // Increased from 0.7 - Less speed penalty
    } else if (terrain.type === 'supply') {
      if (this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + 1.5); // Increased from 1.0 - Faster healing
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
      resistanceMult = 3.5; // Reduced from 5.0 - Faster expansion for quicker gameplay
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
      
      // NEW: Check if attacking a player's base area - much higher resistance
      let isBaseArea = false;
      for (const player of players) {
        if (currentOwner === player.id && player.isAlive) {
          const baseCenterX = Math.floor(player.basePosition.x * MAP_GRID_SIZE);
          const baseCenterY = Math.floor(player.basePosition.y * MAP_GRID_SIZE);
          const distToBase = Math.sqrt(Math.pow(gx - baseCenterX, 2) + Math.pow(gy - baseCenterY, 2));
          
          if (distToBase <= player.baseRadius) {
            isBaseArea = true;
            break;
          }
        }
      }
      
      // Add extra cost for neutral territory to slow expansion
      const neutralCost = currentOwner === -1 ? baseCost * 1.5 : baseCost; // Reduced from 2.0 to 1.5 - Faster neutral territory capture
      
      // NEW: Base areas are much harder to capture
      const baseAreaCost = isBaseArea ? neutralCost * 3.0 : neutralCost; // Reduced from 5.0 to 3.0 - Faster base capture for quicker gameplay

      const terrainCost = terrain.type === 'highground' ? baseAreaCost * 1.3 : baseAreaCost; // Reduced from 1.5 to 1.3 - Less terrain penalty
      let finalCost = terrainCost / (this.attackPower * typeBonus * defenseModifier);
      
      // Heavy units take less damage to extend lifespan
      if (this.unitType === 'heavy') {
        finalCost *= 0.8; // Increased from 0.7 - More damage for faster combat
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
  pegs: any[] = []; // Changed to any[] to support peg types

  tick: number = 0;
  catcherPhases: number[] = [];
  catcherPositions: number[] = [];
  // NEW: Per-player special peg refresh timers
  playerPegRefreshTimers: number[] = [];
  scores: number[] = [];
  territoryCounts: number[] = [];
  winner: number | null = null;

  // Streak tracking for catch/miss
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

  // Helper: Gaussian function for bell curve distribution
  private gaussian(x: number, mu: number, sigma: number): number {
    const a = 1 / (sigma * Math.sqrt(2 * Math.PI));
    const b = -0.5 * Math.pow((x - mu) / sigma, 2);
    return a * Math.exp(b);
  }

  // Helper: Generate bell curve pattern array based on row count
  private generateBellCurvePattern(rowCount: number, peakAt: number = 0): number[] {
    const pattern: number[] = [];
    const mu = peakAt >= 0 ? peakAt : (rowCount - 1) / 2;
    const sigma = rowCount / 4; // Adjust spread of the bell curve

    for (let i = 0; i < rowCount; i++) {
      // Calculate bell curve value and scale to reasonable peg count
      const value = this.gaussian(i, mu, sigma);
      // Scale: multiply by a factor to get 1-8 pegs per row
      const scaled = Math.max(1, Math.round(value * rowCount * 2.5));
      pattern.push(scaled);
    }

    return pattern;
  }

  // Helper: Get random peg type with weighted probabilities
  private getRandomPegType(): string {
    const rand = Math.random();
    if (rand < 0.10) return 'gold';
    if (rand < 0.18) return 'red';
    return 'normal';
  }

  // NEW: Generate multi-layer pegs with Gaussian normal distribution layout
  generateMultiLayerPegs() {
    this.pegs = [];

    // 统一配置：五排钉子，每排4个钉子，均匀分布
    const ROW_COUNT = 5;           // 五排钉子
    const COL_COUNT = 4;           // 每排4个钉子
    const ROW_SPACING = 24;        // 排与排之间的垂直间距
    const COL_SPACING = 24;        // 钉子之间的水平间距（与垂直间距相同）
    const START_Y = 120;           // 第一排的起始Y坐标

    for (let r = 0; r < ROW_COUNT; r++) {
      // 纵向错开：奇数排向右偏移半个间距
      const stagger = (r % 2) * (COL_SPACING / 2);
      const rowWidth = (COL_COUNT - 1) * COL_SPACING;
      const startX = (100 - rowWidth) / 2;

      for (let c = 0; c < COL_COUNT; c++) {
        // 计算钉子位置
        let x = startX + c * COL_SPACING + stagger;
        let y = START_Y - r * ROW_SPACING;

        // 添加少量随机偏移，使布局更自然
        const randomOffset = this.gaussianRandom(0, 0.8);
        x += randomOffset;
        y += randomOffset * 0.3;

        // 确保钉子在边界内
        x = Math.max(5, Math.min(95, x));
        y = Math.max(5, Math.min(140, y));

        this.pegs.push({
          x,
          y,
          type: this.getRandomPegType(),
          layer: 1  // 统一层级
        });
      }
    }

    console.log(`Generated ${this.pegs.length} pegs with 5-row staggered layout`);
  }

  // Helper: Box-Muller transform for Gaussian random numbers
  private gaussianRandom(mean: number = 0, stdDev: number = 1): number {
    const u1 = Math.random();
    const u2 = Math.random();
    // Box-Muller transform
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  // NEW: Refresh gold and red pegs randomly
  refreshSpecialPegs() {
    // Reset all special pegs to normal
    this.pegs.forEach(peg => {
      if (peg.type === 'gold' || peg.type === 'red') {
        peg.type = 'normal';
      }
    });

    // Randomly assign new gold and red pegs
    const normalPegs = this.pegs.filter(peg => peg.type === 'normal');
    const shuffled = normalPegs.sort(() => Math.random() - 0.5);

    // Assign gold pegs (10% of total)
    const goldCount = Math.floor(this.pegs.length * 0.10);
    for (let i = 0; i < goldCount && i < shuffled.length; i++) {
      shuffled[i].type = 'gold';
    }

    // Assign red pegs (8% of total)
    const redCount = Math.floor(this.pegs.length * 0.08);
    for (let i = goldCount; i < goldCount + redCount && i < shuffled.length; i++) {
      shuffled[i].type = 'red';
    }
  }
  
  // NEW: Refresh special pegs for a specific player with their own rules
  refreshSpecialPegsForPlayer(playerId: number) {
    // Reset all special pegs to normal
    this.pegs.forEach(peg => {
      if (peg.type === 'gold' || peg.type === 'red') {
        peg.type = 'normal';
      }
    });

    // Randomly assign new gold and red pegs with player-specific ratios
    const normalPegs = this.pegs.filter(peg => peg.type === 'normal');
    const shuffled = normalPegs.sort(() => Math.random() - 0.5);

    // Player-specific gold peg count based on territory control
    const totalPixels = MAP_GRID_SIZE * MAP_GRID_SIZE;
    const dominance = this.territoryCounts[playerId] / totalPixels;
    // Players with more territory get more gold pegs (10-20%)
    const goldCount = Math.floor(this.pegs.length * (0.10 + 0.10 * dominance));
    
    for (let i = 0; i < goldCount && i < shuffled.length; i++) {
      shuffled[i].type = 'gold';
    }

    // Player-specific red peg count based on territory control
    // Players with less territory get more red pegs to balance difficulty
    const redCount = Math.floor(this.pegs.length * (0.08 * (1.0 - dominance)));
    
    for (let i = goldCount; i < goldCount + redCount && i < shuffled.length; i++) {
      shuffled[i].type = 'red';
    }
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
    // Initialize per-player special peg refresh timers
    this.playerPegRefreshTimers = new Array(playerCount).fill(0);

    this.catcherPhases = new Array(playerCount).fill(0).map(() => Math.random() * Math.PI * 2);
    this.catcherPositions = new Array(playerCount).fill(50);

    // Initialize streak tracking
    this.catchStreaks = new Array(playerCount).fill(0);
    this.missStreaks = new Array(playerCount).fill(0);
    this.catchMultipliers = new Array(playerCount).fill(1.0);
    this.catcherWidths = new Array(playerCount).fill(0);
    this.pegHitCounts = new Array(playerCount).fill(0);
    this.spawnAngles = new Array(playerCount).fill(0);

    // NEW: Generate multi-layer pegs
    this.generateMultiLayerPegs();

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
        coreHp: 500,
        armyPower: 0,
        baseRadius: 8
      });

      this.initializeTerritory(i, basePos);
      this.spawnBall(i);
    }

    // Initialize spawn angles to point toward map center
    this.spawnAngles = this.players.map(p => {
      const bx = p.basePosition.x * MAP_GRID_SIZE;
      const by = p.basePosition.y * MAP_GRID_SIZE;
      const centerAngle = Math.atan2(50 - by, 50 - bx);
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

      // NEW: Use pixel-style circle (perfect circle but with jagged pixel edges)
      for(let y = -radius; y <= radius; y++) {
          for(let x = -radius; x <= radius; x++) {
              // Perfect circle equation
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

    // 1. Quantity Bonus - Increased for faster gameplay
    const quantityBonus = Math.floor(dominance * 5); // Increased from 3
    let finalAmount = amountBase + quantityBonus;

    // 2. Quality (HP) Bonus - Increased scaling
    const hpMultiplier = 1.0 + (dominance * 0.4); // Increased from 0.3

    // 3. ENHANCED CATCH-UP MECHANISM - Stronger for faster gameplay
    let catchUpBonus = 0;
    if (dominance < 0.20) { // Increased from 0.15
      catchUpBonus = Math.floor((0.20 - dominance) * 5); // Increased from 3
    }

    // 4. TERRITORY PENALTY - If territory is very low, reduce unit count
    let territoryPenalty = 1.0;
    if (dominance < 0.05) {
      territoryPenalty = 0.7; // Increased from 0.5 - Less penalty
    } else if (dominance < 0.10) {
      territoryPenalty = 0.8; // Increased from 0.7 - Less penalty
    } else if (dominance < 0.15) {
      territoryPenalty = 0.9; // Increased from 0.85 - Less penalty
    }

    // Apply territory penalty
    finalAmount = Math.floor(finalAmount * territoryPenalty);
    catchUpBonus = Math.floor(catchUpBonus * territoryPenalty);

    // 5. Aim Spread
    const spreadFactor = 0.5 + (dominance * 1.0);

    // Use slowly rotating spawn angle
    const baseAngle = this.spawnAngles[playerId];
    
    // Mix of unit types based on game phase
    const unitMix = this.getUnitMix(isJackpot);
    
    // Minimum unit count to prevent complete stagnation
    finalAmount = Math.max(1, finalAmount);
    
    for(let i=0; i<finalAmount + catchUpBonus; i++) {
        // NEW: Spawn units from production area (center 2/3 of base) only
        const productionRadius = p.baseRadius * 2 / 3;
        const randomAngle = Math.random() * Math.PI * 2;
        const randomDist = Math.random() * productionRadius;
        
        const offsetX = Math.cos(randomAngle) * randomDist;
        const offsetY = Math.sin(randomAngle) * randomDist;
        
        // NEW: Biased random angles - more likely to go towards center, less likely to go backward
        const centerX = MAP_GRID_SIZE / 2;
        const centerY = MAP_GRID_SIZE / 2;
        const angleToCenter = Math.atan2(centerY - by, centerX - bx);
        
        // Use weighted random to create bias towards center
        const rand = Math.random();
        let angleOffset;
        
        if (rand < 0.6) {
          // 60% chance: small random offset towards center direction
          angleOffset = (Math.random() - 0.5) * Math.PI / 2; // ±45 degrees
        } else if (rand < 0.9) {
          // 30% chance: medium random offset
          angleOffset = (Math.random() - 0.5) * Math.PI; // ±90 degrees
        } else {
          // 10% chance: large random offset (including backward)
          angleOffset = (Math.random() - 0.5) * Math.PI * 1.5; // ±135 degrees
        }
        
        const unitAngle = angleToCenter + angleOffset;

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

          // NEW: More accurate base HP calculation based on production area with weighted center
          let weightedControl = 0;
          let totalWeight = 0;

          // Calculate weighted control - center cells have higher weight
          const productionRadius = Math.floor(p.baseRadius * 2 / 3); // Center 2/3 produces units
          const baseCenterX = Math.floor(p.basePosition.x * MAP_GRID_SIZE);
          const baseCenterY = Math.floor(p.basePosition.y * MAP_GRID_SIZE);
          
          for(let y = -productionRadius; y <= productionRadius; y++) {
              for(let x = -productionRadius; x <= productionRadius; x++) {
                  if (x*x + y*y <= productionRadius*productionRadius) {
                      // Calculate distance from center for weighting
                      const distFromCenter = Math.sqrt(x*x + y*y);
                      // Weight: center cells have higher weight (closer to center = higher weight)
                      const weight = Math.max(1, (productionRadius - distFromCenter) * 2);
                      
                      totalWeight += weight;
                      
                      const gy = baseCenterY + y;
                      const gx = baseCenterX + x;
                      if (gy >= 0 && gy < MAP_GRID_SIZE && gx >= 0 && gx < MAP_GRID_SIZE) {
                          if (this.grid[gy][gx] === p.id) {
                              weightedControl += weight;
                          }
                      }
                  }
              }
          }

          const weightedControlRatio = totalWeight > 0 ? weightedControl / totalWeight : 0;
          // HP is directly tied to weighted production area control ratio
          p.coreHp = weightedControlRatio * 500;

          // Eliminate if production area is completely lost (weighted)
          if (weightedControlRatio < 0.1) {
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

    if (maxDominance < 0.15) { // Reduced from 0.20 - Even faster phase progression
      this.gamePhase = 'early';
    } else if (maxDominance < 0.30) { // Reduced from 0.40 - Even faster phase progression
      this.gamePhase = 'mid';
    } else {
      this.gamePhase = 'late';
    }
  }

  update(pinballWidth: number, pinballHeight: number) {
    this.tick++;
    const time = this.tick * 0.04;

    // NEW: Per-player special peg refresh - each player has different refresh timing
    this.players.forEach((p, idx) => {
      if (!p.isAlive) return;
      
      // Each player has different refresh interval based on their territory control
      const totalPixels = MAP_GRID_SIZE * MAP_GRID_SIZE;
      const dominance = this.territoryCounts[p.id] / totalPixels;
      
      // Calculate refresh interval: 200-400 ticks based on territory control
      // Players with more territory get more frequent refreshes
      const baseInterval = 200;
      const intervalVariation = 200 * dominance;
      const refreshInterval = Math.floor(baseInterval + intervalVariation);
      
      // Update timer
      this.playerPegRefreshTimers[idx]++;
      
      // Refresh pegs for this player when timer reaches interval
      if (this.playerPegRefreshTimers[idx] >= refreshInterval) {
        this.refreshSpecialPegsForPlayer(p.id);
        this.playerPegRefreshTimers[idx] = 0; // Reset timer
      }
    });

    // Smart spawn angle adjustment
    if (this.tick % 180 === 0) {
      this.players.forEach((p, idx) => {
        if (!p.isAlive) return;

        const bx = p.basePosition.x * MAP_GRID_SIZE;
        const by = p.basePosition.y * MAP_GRID_SIZE;
        const centerAngle = Math.atan2(50 - by, 50 - bx);

        const randomVariation = (Math.random() - 0.5) * 2.1;

        this.spawnAngles[idx] = centerAngle + randomVariation;
      });
    }

    this.checkSurvival();
    this.updateGamePhase();

    const totalPixels = MAP_GRID_SIZE * MAP_GRID_SIZE;

    this.players.forEach(p => {
      if (!p.isAlive) return;

      // Static catcher position at center
      const cx = 50;
      this.catcherPositions[p.id] = cx;

      const owned = this.territoryCounts[p.id] || 0;
      const dominance = owned / totalPixels;

      // Calculate catcher width
      let catcherBonus = dominance * CATCHER_WIDTH_MAX_BONUS;
      if (dominance < 0.15) {
        catcherBonus += 8;
      } else if (dominance > 0.5) {
        catcherBonus -= 5;
      } else if (dominance < 0.05) {
        catcherBonus -= 3;
      }

      const baseCatcherWidth = CATCHER_WIDTH_BASE + catcherBonus;
      const currentCatcherWidth = Math.max(15, baseCatcherWidth * (this.catcherWidths[p.id] || 1.0));

      const ball = this.balls.get(p.id);
      if (ball) {
        const score = ball.update(pinballWidth, pinballHeight, this.pegs);

        if (score > 0) {
          // Ball reached bottom - calculate reward with random factors
          
          // NEW: Random multiplier based on ball state - increased variance
          let randomMultiplier = 1.0;
          const randomFactor = Math.random();
          
          if (randomFactor < 0.25) {
            randomMultiplier = 0.5; // 25% 概率低倍率 - 降低
          } else if (randomFactor < 0.55) {
            randomMultiplier = 1.0; // 30% 概率正常倍率
          } else if (randomFactor < 0.80) {
            randomMultiplier = 2.0; // 25% 概率高倍率 - 增加
          } else if (randomFactor < 0.95) {
            randomMultiplier = 3.5; // 15% 概率超高倍率 - 大幅增加
          } else {
            randomMultiplier = 5.0; // 5% 概率极高倍率 - 新增
          }
          
          // NEW: Position-based bonus (中心位置奖励更高)
          const positionBonus = 1.0 - Math.abs(cx - 50) / 50 * 0.5; // 中心为1.0，边缘为0.5
          
          // NEW: Velocity-based bonus (速度越快奖励越高)
          const ballSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
          const speedBonus = Math.min(1.5, 1.0 + ballSpeed / 20);
          
          // NEW: Combo multiplier - increased impact
          let comboMultiplier = 1.0;
          if (ball.comboPoints >= 20) {
            comboMultiplier = 5.0; // 大幅增加
          } else if (ball.comboPoints >= 15) {
            comboMultiplier = 3.5;
          } else if (ball.comboPoints >= 10) {
            comboMultiplier = 2.5;
          } else if (ball.comboPoints >= 5) {
            comboMultiplier = 1.8;
          }
          
          // NEW: Peg hit bonus (击中钉子越多奖励越高)
          const pegHitBonus = Math.min(2.0, 1.0 + ball.pegHitCount / 15);
          
          // Calculate final units
          const baseUnits = score;
          const finalUnits = Math.floor(
            baseUnits * 
            randomMultiplier * 
            positionBonus * 
            speedBonus * 
            comboMultiplier * 
            pegHitBonus
          );

          this.scores[p.id] += finalUnits;
          this.spawnWave(p.id, finalUnits, true);
          this.spawnBall(p.id);

          // Reset catch streak and combo
          this.catchStreaks[p.id]++;
          this.missStreaks[p.id] = 0;
          this.catchMultipliers[p.id] = Math.min(2.0, 1.0 + (this.catchStreaks[p.id] * 0.15));

          // Reset catcher width
          this.catcherWidths[p.id] = 1.0;
        } else {
          // If ball is still in play (score = 0), continue
          // No additional actions needed
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