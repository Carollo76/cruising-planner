export const NOAA_CONFIG = {
  weather: {
    baseUrl: 'https://api.weather.gov',
    userAgent: 'CruisingPlanner/1.0',
    cacheDurationMs: 6 * 60 * 60 * 1000, // 6 hours
  },
  tides: {
    baseUrl: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
    cacheDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
} as const;
