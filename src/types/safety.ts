import type { Position } from './navigation';

export interface Checklist {
  id: string;
  name: string;
  category: 'pre-departure' | 'underway' | 'arrival' | 'heavy-weather' | 'custom';
  items: ChecklistItem[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  category?: string;
  isRequired: boolean;
  sortOrder: number;
}

export interface ChecklistRun {
  id: string;
  checklistId: string;
  tripId?: string;
  startedAt: number;
  completedAt?: number;
  completedItems: string[];
  notes: Record<string, string>;
}

export interface FloatPlan {
  id: string;
  tripId?: string;
  vesselName: string;
  vesselDescription: string;
  hailingPort: string;
  mmsi?: string;
  crew: FloatPlanCrew[];
  departurePoint: string;
  departureTime: string;
  destinationPoint: string;
  estimatedArrival: string;
  routeDescription: string;
  waypoints: Position[];
  safetyEquipment: SafetyEquipment;
  fuelCapacity: number;
  waterCapacity: number;
  engineType: string;
  communicationEquipment: string[];
  emergencyContacts: EmergencyContact[];
  shoreContact: ShoreContact;
  generatedAt: number;
}

export interface FloatPlanCrew {
  name: string;
  age?: number;
  medicalConditions?: string;
  swimmingAbility: 'strong' | 'moderate' | 'weak' | 'none';
}

export interface SafetyEquipment {
  lifeJackets: number;
  throwableDevices: number;
  fireExtinguishers: number;
  flares: boolean;
  horn: boolean;
  epirb: boolean;
  lifeRaft: boolean;
  firstAidKit: boolean;
  flashlights: number;
  vhfRadio: boolean;
  anchor: boolean;
}

export interface ShoreContact {
  name: string;
  phone: string;
  email?: string;
  relationship: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  vhfChannel?: string;
  type: 'coast-guard' | 'towing' | 'medical' | 'marina' | 'personal';
  region?: string;
}
