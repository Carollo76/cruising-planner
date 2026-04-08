export interface WeatherThresholds {
  wind: { go: number; caution: number; noGo: number };
  gusts: { go: number; caution: number; noGo: number };
  waves: { go: number; caution: number; noGo: number };
  visibility: { go: number; caution: number; noGo: number };
  thunderstormProbability: { go: number; caution: number; noGo: number };
}

export const DEFAULT_THRESHOLDS: WeatherThresholds = {
  wind: { go: 15, caution: 20, noGo: 25 },
  gusts: { go: 20, caution: 25, noGo: 30 },
  waves: { go: 3, caution: 5, noGo: 7 },
  visibility: { go: 5, caution: 2, noGo: 1 },
  thunderstormProbability: { go: 10, caution: 30, noGo: 50 },
};
