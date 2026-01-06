export interface Point {
  x: number;
  y: number;
}

export type UnitType = 'light' | 'heavy';

export type TerrainType = 'normal' | 'highground' | 'obstacle' | 'supply';

export interface TerrainCell {
  type: TerrainType;
  owner: number; // -1 = neutral
  bonus: number; // Attack/defense bonus multiplier
}

export interface UnitStats {
  baseHp: number;
  speed: number;
  captureRadius: number;
  attackPower: number;
  defenseBonus: number;
  bonusAgainst: UnitType[]; // Units this type counters
}

export interface PlayerConfig {
  id: number;
  color: string;
  basePosition: Point; // Normalized 0-1
  isAlive: boolean;
  coreHp: number;
  armyPower: number; // Total army strength metric
  baseRadius: number; // Base territory radius in grid cells
}

export interface GameConfig {
  playerCount: number;
  mapSize: number;
}

export interface GameStats {
  scores: number[];
  territoryCounts: number[];
  winner: number | null;
  phase: 'early' | 'mid' | 'late'; // Game phase for balance adjustments
}