import { db } from './database';
import type { Destination } from '../types/destination';
import type { Checklist } from '../types/safety';
import { LONG_ISLAND_SOUND_DESTINATIONS } from './destinations-long-island-sound';

const CHESAPEAKE_DESTINATIONS: Destination[] = [
  {
    id: 'ches-annapolis-harbor',
    name: 'Annapolis City Marina',
    type: 'marina',
    position: { lat: 38.9780, lng: -76.4847 },
    region: 'chesapeake',
    description: 'Historic marina in downtown Annapolis, walking distance to restaurants and USNA.',
    vhfChannel: '16/09',
    phone: '410-268-0660',
    amenities: {
      fuel: true, water: true, electric: true, pumpout: true, showers: true,
      laundry: true, wifi: true, restaurant: true, groceries: false, repairs: false,
      dinghyDock: true, pool: false, ice: true, propane: false,
    },
    details: {
      type: 'marina',
      slipCount: 60,
      maxLOA: 60,
      maxDraft: 10,
      pricePerFoot: 4.50,
      transientSlips: true,
      reservationRequired: true,
    },
    reviews: [],
    isUserAdded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'ches-st-michaels',
    name: 'St. Michaels Harbour Inn Marina',
    type: 'marina',
    position: { lat: 38.7849, lng: -76.2213 },
    region: 'chesapeake',
    description: 'Full-service marina on the scenic Miles River, adjacent to Chesapeake Bay Maritime Museum.',
    vhfChannel: '16/09',
    phone: '410-745-9001',
    amenities: {
      fuel: true, water: true, electric: true, pumpout: true, showers: true,
      laundry: true, wifi: true, restaurant: true, groceries: false, repairs: false,
      dinghyDock: true, pool: true, ice: true, propane: false,
    },
    details: {
      type: 'marina',
      slipCount: 45,
      maxLOA: 120,
      maxDraft: 8,
      pricePerFoot: 4.00,
      transientSlips: true,
      reservationRequired: true,
    },
    reviews: [],
    isUserAdded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'ches-oxford',
    name: 'Oxford Town Dock',
    type: 'town-dock',
    position: { lat: 38.6857, lng: -76.1711 },
    region: 'chesapeake',
    description: 'Charming town dock in historic Oxford. Free day tie-up, overnight limited.',
    amenities: {
      fuel: false, water: true, electric: false, pumpout: false, showers: false,
      laundry: false, wifi: false, restaurant: true, groceries: true, repairs: false,
      dinghyDock: true, pool: false, ice: false, propane: false,
    },
    details: {
      type: 'marina',
      slipCount: 6,
      transientSlips: true,
      reservationRequired: false,
    },
    reviews: [],
    isUserAdded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'ches-solomons',
    name: 'Solomons Island Anchorage',
    type: 'anchorage',
    position: { lat: 38.3317, lng: -76.4527 },
    region: 'chesapeake',
    description: 'Popular protected anchorage at the mouth of the Patuxent River. Good holding in mud.',
    amenities: {
      fuel: false, water: false, electric: false, pumpout: false, showers: false,
      laundry: false, wifi: false, restaurant: false, groceries: false, repairs: false,
      dinghyDock: true, pool: false, ice: false, propane: false,
    },
    details: {
      type: 'anchorage',
      holdingQuality: 'good',
      bottomType: 'mud',
      protectionFrom: ['N', 'NE', 'E', 'SE'],
      exposedTo: ['SW', 'W'],
      typicalDepthFeet: 10,
      maxDepthFeet: 15,
      swingRoomFeet: 150,
      maxBoats: 50,
    },
    reviews: [],
    isUserAdded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'ches-rock-hall',
    name: 'Rock Hall Harbor',
    type: 'mooring',
    position: { lat: 39.1390, lng: -76.2411 },
    region: 'chesapeake',
    description: 'Town moorings in protected harbor. Walking distance to restaurants and shops.',
    vhfChannel: '16/09',
    amenities: {
      fuel: true, water: true, electric: false, pumpout: true, showers: true,
      laundry: false, wifi: true, restaurant: true, groceries: true, repairs: true,
      dinghyDock: true, pool: false, ice: true, propane: false,
    },
    details: {
      type: 'mooring',
      mooringCount: 12,
      pricePerNight: 35,
      maxLOA: 50,
      dinghyDock: true,
      launchService: false,
      reservationRequired: false,
      operator: 'Rock Hall Harbor',
    },
    reviews: [],
    isUserAdded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'ches-annapolis-yc',
    name: 'Annapolis Yacht Club',
    type: 'yacht-club',
    position: { lat: 38.9769, lng: -76.4861 },
    region: 'chesapeake',
    description: 'Prestigious yacht club at mouth of Spa Creek. Reciprocal privileges with other recognized clubs.',
    vhfChannel: '16/09',
    phone: '410-263-9279',
    amenities: {
      fuel: false, water: true, electric: true, pumpout: true, showers: true,
      laundry: false, wifi: true, restaurant: true, groceries: false, repairs: false,
      dinghyDock: true, pool: true, ice: true, propane: false,
    },
    details: {
      type: 'marina',
      transientSlips: true,
      reservationRequired: true,
    },
    reviews: [],
    isUserAdded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const DEFAULT_CHECKLISTS: Checklist[] = [
  {
    id: 'pre-departure-default',
    name: 'Pre-Departure',
    category: 'pre-departure',
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [
      { id: 'pd-1', text: 'Check weather forecast and marine warnings', category: 'Planning', isRequired: true, sortOrder: 1 },
      { id: 'pd-2', text: 'File float plan with shore contact', category: 'Planning', isRequired: true, sortOrder: 2 },
      { id: 'pd-3', text: 'Check tides and currents for route', category: 'Planning', isRequired: true, sortOrder: 3 },
      { id: 'pd-4', text: 'Verify VHF radio operation (Ch 16 radio check)', category: 'Communication', isRequired: true, sortOrder: 4 },
      { id: 'pd-5', text: 'Test navigation lights', category: 'Electrical', isRequired: true, sortOrder: 5 },
      { id: 'pd-6', text: 'Check engine oil, coolant, belts', category: 'Engine', isRequired: true, sortOrder: 6 },
      { id: 'pd-7', text: 'Check fuel level and fill if needed', category: 'Engine', isRequired: true, sortOrder: 7 },
      { id: 'pd-8', text: 'Check water tank level', category: 'Systems', isRequired: true, sortOrder: 8 },
      { id: 'pd-9', text: 'Pump out holding tank', category: 'Systems', isRequired: false, sortOrder: 9 },
      { id: 'pd-10', text: 'Confirm bilge pump operation', category: 'Systems', isRequired: true, sortOrder: 10 },
      { id: 'pd-11', text: 'Life jackets: one per person, accessible', category: 'Safety', isRequired: true, sortOrder: 11 },
      { id: 'pd-12', text: 'Fire extinguishers charged and accessible', category: 'Safety', isRequired: true, sortOrder: 12 },
      { id: 'pd-13', text: 'First aid kit checked and stocked', category: 'Safety', isRequired: true, sortOrder: 13 },
      { id: 'pd-14', text: 'Flares in date and accessible', category: 'Safety', isRequired: true, sortOrder: 14 },
      { id: 'pd-15', text: 'Horn / sound signaling device working', category: 'Safety', isRequired: true, sortOrder: 15 },
      { id: 'pd-16', text: 'Anchor ready to deploy', category: 'Ground Tackle', isRequired: true, sortOrder: 16 },
      { id: 'pd-17', text: 'Charts and cruising guides aboard', category: 'Navigation', isRequired: true, sortOrder: 17 },
      { id: 'pd-18', text: 'Handheld GPS with fresh batteries', category: 'Navigation', isRequired: false, sortOrder: 18 },
      { id: 'pd-19', text: 'Crew briefed on safety procedures', category: 'Crew', isRequired: true, sortOrder: 19 },
      { id: 'pd-20', text: 'Everyone knows location of safety gear', category: 'Crew', isRequired: true, sortOrder: 20 },
      { id: 'pd-21', text: 'Provisions and drinking water stowed', category: 'Provisions', isRequired: true, sortOrder: 21 },
      { id: 'pd-22', text: 'Lines and fenders ready', category: 'Deck', isRequired: true, sortOrder: 22 },
      { id: 'pd-23', text: 'Secure loose items below and on deck', category: 'Deck', isRequired: true, sortOrder: 23 },
      { id: 'pd-24', text: 'Cell phones charged', category: 'Communication', isRequired: false, sortOrder: 24 },
    ],
  },
  {
    id: 'underway-default',
    name: 'Underway',
    category: 'underway',
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [
      { id: 'uw-1', text: 'Log position, course, speed (hourly)', category: 'Navigation', isRequired: true, sortOrder: 1 },
      { id: 'uw-2', text: 'Monitor VHF Ch 16', category: 'Communication', isRequired: true, sortOrder: 2 },
      { id: 'uw-3', text: 'Check engine gauges (temp, oil, voltage)', category: 'Engine', isRequired: true, sortOrder: 3 },
      { id: 'uw-4', text: 'Check bilge for water', category: 'Systems', isRequired: true, sortOrder: 4 },
      { id: 'uw-5', text: 'Scan horizon for traffic and hazards', category: 'Navigation', isRequired: true, sortOrder: 5 },
      { id: 'uw-6', text: 'Update weather forecast', category: 'Weather', isRequired: true, sortOrder: 6 },
      { id: 'uw-7', text: 'Life jackets worn at night or in rough seas', category: 'Safety', isRequired: true, sortOrder: 7 },
      { id: 'uw-8', text: 'Watch schedule observed', category: 'Crew', isRequired: true, sortOrder: 8 },
    ],
  },
  {
    id: 'arrival-default',
    name: 'Arrival',
    category: 'arrival',
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [
      { id: 'ar-1', text: 'Contact marina/harbormaster on VHF', category: 'Communication', isRequired: true, sortOrder: 1 },
      { id: 'ar-2', text: 'Prepare dock lines and fenders', category: 'Deck', isRequired: true, sortOrder: 2 },
      { id: 'ar-3', text: 'Brief crew on docking plan', category: 'Crew', isRequired: true, sortOrder: 3 },
      { id: 'ar-4', text: 'Check current, wind, other boats', category: 'Navigation', isRequired: true, sortOrder: 4 },
      { id: 'ar-5', text: 'Secure boat to dock / set anchor', category: 'Deck', isRequired: true, sortOrder: 5 },
      { id: 'ar-6', text: 'Shut down engine (cool down first)', category: 'Engine', isRequired: true, sortOrder: 6 },
      { id: 'ar-7', text: 'Turn off instruments, lights', category: 'Electrical', isRequired: true, sortOrder: 7 },
      { id: 'ar-8', text: 'Close seacocks not in use', category: 'Systems', isRequired: false, sortOrder: 8 },
      { id: 'ar-9', text: 'Update logbook with arrival', category: 'Navigation', isRequired: true, sortOrder: 9 },
      { id: 'ar-10', text: 'Notify shore contact of arrival', category: 'Communication', isRequired: true, sortOrder: 10 },
    ],
  },
  {
    id: 'heavy-weather-default',
    name: 'Heavy Weather',
    category: 'heavy-weather',
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [
      { id: 'hw-1', text: 'Everyone don life jackets AND harnesses', category: 'Safety', isRequired: true, sortOrder: 1 },
      { id: 'hw-2', text: 'Jackline rigged, clip in on deck', category: 'Safety', isRequired: true, sortOrder: 2 },
      { id: 'hw-3', text: 'Reef sails early — reef before you need to', category: 'Sails', isRequired: true, sortOrder: 3 },
      { id: 'hw-4', text: 'Close companionway hatch boards', category: 'Below', isRequired: true, sortOrder: 4 },
      { id: 'hw-5', text: 'Secure all loose items below', category: 'Below', isRequired: true, sortOrder: 5 },
      { id: 'hw-6', text: 'Prepare storm tactics plan (heave-to, run off, sea anchor)', category: 'Tactics', isRequired: true, sortOrder: 6 },
      { id: 'hw-7', text: 'Monitor VHF weather and DSC alerts', category: 'Communication', isRequired: true, sortOrder: 7 },
      { id: 'hw-8', text: 'Check nearest safe harbor and bailout points', category: 'Navigation', isRequired: true, sortOrder: 8 },
      { id: 'hw-9', text: 'Crew hydration and seasickness meds', category: 'Crew', isRequired: true, sortOrder: 9 },
      { id: 'hw-10', text: 'EPIRB accessible, phone in dry bag', category: 'Emergency', isRequired: true, sortOrder: 10 },
      { id: 'hw-11', text: 'Life raft accessible', category: 'Emergency', isRequired: true, sortOrder: 11 },
    ],
  },
];

/** Bump this number when seed data is corrected so existing installs re-sync.
 *  Only NON-user-added destinations are refreshed; user's custom places and reviews are preserved. */
const SEED_VERSION = 7;

export async function seedDatabase() {
  const storedVersion = Number(localStorage.getItem('cruisingPlanner.seedVersion') ?? '0');
  const needsRefresh = storedVersion < SEED_VERSION;

  const allSeed = [...LONG_ISLAND_SOUND_DESTINATIONS, ...CHESAPEAKE_DESTINATIONS];

  if (needsRefresh) {
    // Pull current rows so we can preserve any reviews users added to seeded entries
    const existingByIdArray = await db.destinations.bulkGet(allSeed.map((d) => d.id));
    const merged = allSeed.map((seedDest, i) => {
      const existing = existingByIdArray[i];
      return {
        ...seedDest,
        // Preserve user-written reviews on seeded destinations
        reviews: existing?.reviews ?? seedDest.reviews,
      };
    });
    await db.destinations.bulkPut(merged);
    localStorage.setItem('cruisingPlanner.seedVersion', String(SEED_VERSION));
  } else {
    // Normal path: just add any new seed entries we don't have yet
    const existingIds = new Set((await db.destinations.toCollection().primaryKeys()) as string[]);
    const missing = allSeed.filter((d) => !existingIds.has(d.id));
    if (missing.length > 0) {
      await db.destinations.bulkAdd(missing);
    }
  }

  const existingChecklists = await db.checklists.count();
  if (existingChecklists === 0) {
    await db.checklists.bulkAdd(DEFAULT_CHECKLISTS);
  }
}
