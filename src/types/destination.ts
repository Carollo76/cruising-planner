import type { Position } from './navigation';

export type DestinationType = 'marina' | 'anchorage' | 'mooring' | 'yacht-club' | 'town-dock';
export type Region = 'chesapeake' | 'new-england' | 'florida' | 'icw' | 'mid-atlantic' | 'other';

export interface Destination {
  id: string;
  name: string;
  type: DestinationType;
  position: Position;
  region: Region;
  description?: string;
  vhfChannel?: string;
  phone?: string;
  website?: string;
  amenities: Amenities;
  details: MarinaDetails | AnchorageDetails | MooringDetails;
  reviews: Review[];
  isUserAdded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Amenities {
  fuel: boolean;
  water: boolean;
  electric: boolean;
  pumpout: boolean;
  showers: boolean;
  laundry: boolean;
  wifi: boolean;
  restaurant: boolean;
  groceries: boolean;
  repairs: boolean;
  dinghyDock: boolean;
  pool: boolean;
  ice: boolean;
  propane: boolean;
}

export interface MarinaDetails {
  type: 'marina';
  slipCount?: number;
  maxLOA?: number;
  maxDraft?: number;
  pricePerFoot?: number;
  transientSlips: boolean;
  reservationRequired: boolean;
}

export interface AnchorageDetails {
  type: 'anchorage';
  holdingQuality: 'excellent' | 'good' | 'fair' | 'poor';
  bottomType: string;
  protectionFrom: string[];
  exposedTo: string[];
  typicalDepthFeet: number;
  maxDepthFeet?: number;
  swingRoomFeet?: number;
  maxBoats?: number;
}

export interface MooringDetails {
  type: 'mooring';
  mooringCount?: number;
  pricePerNight?: number;
  maxLOA?: number;
  maxDisplacement?: number;
  dinghyDock: boolean;
  launchService: boolean;
  reservationRequired: boolean;
  operator?: string;
}

export interface Review {
  id: string;
  destinationId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  visitDate: string;
  text: string;
  author: string;
  createdAt: number;
}
