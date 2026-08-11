export interface BoatConfig {
  id: string;
  name: string;
  make: string;
  model: string;
  year?: number;
  loa: number;
  beam: number;
  draft: number;
  /**
   * Height of the highest fixed point — masthead, antenna, wind instrument — above the
   * waterline, in feet. Optional because it must be measured, not assumed: bridge
   * clearance checks report "unknown" without it rather than guessing a rig height.
   */
  airDraftFt?: number;
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
