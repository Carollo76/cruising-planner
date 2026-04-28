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
  }
}

export const db = new CruisingPlannerDB();
