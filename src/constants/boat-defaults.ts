import type { BoatConfig } from '../types/boat';

export const BENETEAU_OCEANIS_37: BoatConfig = {
  id: 'default',
  name: 'Our Boat',
  make: 'Beneteau',
  model: 'Oceanis 37',
  loa: 36.8,
  beam: 12.1,
  /** Shoal keel: 4.5 ft (~1.37 m). Confirmed by the owner 2026-08-09; the previous
   *  5.9 ft was the deep-keel figure and was wrong for this boat. Drives the polar
   *  selection and every depth check, so it is not a cosmetic value. */
  draft: 4.5,
  displacement: 14991,
  engineHP: 40,
  fuelCapacityGallons: 32,
  waterCapacityGallons: 66,
  holdingTankGallons: 26,
  fuelConsumptionGPH: 1.5,
  cruisingSpeedKnots: 6.0,
  maxSpeedKnots: 7.5,
  sleeperCapacity: 6,
  hullType: 'monohull',
  hullColor: 'White',
};
