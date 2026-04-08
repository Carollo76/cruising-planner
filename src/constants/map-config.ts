export const MAP_CONFIG = {
  defaultCenter: { lat: 38.0, lng: -76.0 } as const,
  defaultZoom: 9,
  minZoom: 3,
  maxZoom: 18,
  tiles: {
    base: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      maxZoom: 19,
    },
    seamark: {
      url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://openseamap.org">OpenSeaMap</a> contributors',
      maxZoom: 18,
    },
  },
} as const;
