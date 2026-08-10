import Dexie, { type Table } from 'dexie';
import type { Trip, Route } from '../types/navigation';
import type { BoatConfig } from '../types/boat';
import type { WeatherForecast, TidePrediction } from '../types/weather';
import type { Destination, Review } from '../types/destination';
import type { Checklist, ChecklistRun, FloatPlan } from '../types/safety';
import type { CrewMember, WatchSchedule } from '../types/crew';
import type { ProvisionPlan } from '../types/provisioning';
import type { LogEntry } from '../types/logbook';
import type { BlogPost } from '../types/blog';
import type { WindyCacheEntry } from '../services/windy-weather';
import type { CurrentPredictionRecord } from '../types/currents';
import type { Itinerary } from '../features/passage-planning/model/itinerary';
import type { TideHeightRecord } from '../services/noaaTides';

export class CruisingPlannerDB extends Dexie {
  trips!: Table<Trip>;
  routes!: Table<Route>;
  destinations!: Table<Destination>;
  reviews!: Table<Review>;
  crewMembers!: Table<CrewMember>;
  checklists!: Table<Checklist>;
  checklistRuns!: Table<ChecklistRun>;
  floatPlans!: Table<FloatPlan>;
  watchSchedules!: Table<WatchSchedule>;
  provisionPlans!: Table<ProvisionPlan>;
  logEntries!: Table<LogEntry>;
  weatherCache!: Table<WeatherForecast>;
  tideCache!: Table<TidePrediction>;
  boatConfigs!: Table<BoatConfig>;
  blogPosts!: Table<BlogPost>;
  windyCache!: Table<WindyCacheEntry>;
  currentPredictions!: Table<CurrentPredictionRecord>;
  itineraries!: Table<Itinerary>;
  tideHeights!: Table<TideHeightRecord>;

  constructor() {
    super('CruisingPlannerDB');
    this.version(1).stores({
      trips: 'id, name, status, startDate',
      routes: 'id, tripId, name, createdAt',
      destinations: 'id, type, region, name, [type+region]',
      reviews: 'id, destinationId, rating, visitDate',
      crewMembers: 'id, name, role',
      checklists: 'id, category, isDefault',
      checklistRuns: 'id, checklistId, tripId, startedAt',
      floatPlans: 'id, tripId, generatedAt',
      watchSchedules: 'id, tripId',
      provisionPlans: 'id, tripId',
      logEntries: 'id, tripId, timestamp, entryType',
      weatherCache: 'id, forecastZoneId, fetchedAt',
      tideCache: 'stationId, fetchedAt',
      boatConfigs: 'id, name',
    });
    this.version(2).stores({
      blogPosts: 'id, slug, status, publishedAt',
    });
    this.version(3).stores({
      windyCache: 'key, expiresAt, fetchedAt',
    });
    // Tidal current predictions, cached per station/bin/interval/day so gate timing works
    // offline. Separate from tideCache, which stores water *heights* — the old code wrote
    // current speeds into tideCache's `height` field, which this replaces.
    this.version(4).stores({
      currentPredictions: 'key, stationId, dateKey, fetchedAt, [stationId+dateKey]',
    });
    // Multi-day cruises: an ordered chain of day hops between overnight stops.
    this.version(5).stores({
      itineraries: 'id, name, startDate, updatedAt',
    });
    // Predicted water level per station per day. Distinct from tideCache, which the old
    // tide client uses and which stores a whole multi-day blob keyed by station alone.
    this.version(6).stores({
      tideHeights: 'key, stationId, dateKey, fetchedAt',
    });
  }
}

export const db = new CruisingPlannerDB();
