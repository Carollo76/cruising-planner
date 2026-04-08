import type { Position } from './navigation';

export interface LogEntry {
  id: string;
  tripId: string;
  timestamp: number;
  position?: Position;
  positionSource: 'gps' | 'manual' | 'estimated';
  courseOverGround?: number;
  speedOverGround?: number;
  heading?: number;
  engineHours?: number;
  engineRunning: boolean;
  windSpeed?: number;
  windDirection?: number;
  seaState?: 'calm' | 'smooth' | 'slight' | 'moderate' | 'rough' | 'very-rough';
  visibility?: 'good' | 'moderate' | 'poor' | 'fog';
  barometer?: number;
  temperature?: number;
  weatherNotes?: string;
  notes: string;
  photos?: LogPhoto[];
  entryType: 'regular' | 'departure' | 'arrival' | 'position-fix' | 'weather-change' | 'incident' | 'watch-change';
  createdBy?: string;
}

export interface LogPhoto {
  id: string;
  data: string;
  caption?: string;
  timestamp: number;
}

export interface TripSummary {
  tripId: string;
  totalDistanceNM: number;
  totalTimeHours: number;
  totalEngineHours: number;
  totalFuelUsed: number;
  maxSpeed: number;
  averageSpeed: number;
  portsVisited: string[];
  logEntryCount: number;
  startDate: string;
  endDate: string;
}
