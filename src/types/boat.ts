export interface BoatConfig {
  id: string;
  name: string;
  make: string;
  model: string;
  year?: number;
  loa: number;
  beam: number;
  draft: number;
  displacement: number;
  engineHP: number;
  fuelCapacityGallons: number;
  waterCapacityGallons: number;
  holdingTankGallons: number;
  fuelConsumptionGPH: number;
  cruisingSpeedKnots: number;
  maxSpeedKnots: number;
  sleeperCapacity: number;
  hullType: 'monohull' | 'catamaran' | 'trimaran';
  registrationNumber?: string;
  hailingPort?: string;
  mmsi?: string;
  callSign?: string;
  /** Hull colour, used on the float plan for search-and-rescue identification. */
  hullColor?: string;
}
