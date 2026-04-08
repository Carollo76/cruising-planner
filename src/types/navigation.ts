export interface Position {
  lat: number;
  lng: number;
  timestamp?: number;
  accuracy?: number;
}

export interface Waypoint {
  id: string;
  routeId: string;
  position: Position;
  name: string;
  sequenceOrder: number;
  notes?: string;
  waypointType: 'departure' | 'waypoint' | 'destination' | 'anchorage' | 'hazard';
}

export interface RouteLeg {
  fromWaypointId: string;
  toWaypointId: string;
  distanceNM: number;
  bearingTrue: number;
  bearingMagnetic: number;
  estimatedTimeHours: number;
  estimatedFuelGallons: number;
}

export interface Route {
  id: string;
  tripId?: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  totalDistanceNM: number;
  totalEstimatedTimeHours: number;
  totalEstimatedFuelGallons: number;
  expectedSpeedKnots: number;
  fuelConsumptionGPH: number;
  waypoints: Waypoint[];
  legs: RouteLeg[];
}

export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  routeIds: string[];
  crewIds: string[];
  status: 'planning' | 'active' | 'completed';
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
