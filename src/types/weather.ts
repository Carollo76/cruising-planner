import type { Position } from './navigation';

export interface WeatherForecast {
  id: string;
  position: Position;
  forecastZoneId: string;
  forecastOffice: string;
  fetchedAt: number;
  periods: ForecastPeriod[];
}

export interface ForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: 'F' | 'C';
  windSpeed: string;
  windSpeedMin?: number;
  windSpeedMax?: number;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  probabilityOfPrecipitation?: number;
}

export interface TideStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state: string;
}

export interface TidePrediction {
  stationId: string;
  stationName: string;
  predictions: TideDataPoint[];
  fetchedAt: number;
}

export interface TideDataPoint {
  timestamp: string;
  height: number;
  type?: 'H' | 'L';
}

export interface CurrentPrediction {
  stationId: string;
  stationName: string;
  predictions: CurrentDataPoint[];
  fetchedAt: number;
}

export interface CurrentDataPoint {
  timestamp: string;
  speed: number;
  direction: number;
  type?: 'flood' | 'ebb' | 'slack';
}

export interface GoNoGoAssessment {
  routeId: string;
  assessedAt: number;
  overallRating: 'go' | 'caution' | 'no-go';
  factors: GoNoGoFactor[];
}

export interface GoNoGoFactor {
  category: 'wind' | 'waves' | 'visibility' | 'precipitation' | 'thunderstorm' | 'tide';
  rating: 'go' | 'caution' | 'no-go';
  value: string;
  threshold: string;
  details: string;
}
