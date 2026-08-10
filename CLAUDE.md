# Cruising Planner

Offline-first PWA for planning sailing cruises on a Beneteau Oceanis 37 out of Centerport Yacht Club, Northport Harbor, NY. Family cruising (3-4 crew) on Long Island Sound and beyond.

## Quick Start

```bash
npm run dev      # Dev server at http://localhost:5173
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

## Tech Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** (`@tailwindcss/vite` plugin) — dark navy theme (`bg-slate-950`, `sea-400` accents)
- **React Router v7** — client-side routing
- **Zustand** — state management with localStorage persistence
- **Dexie.js** — IndexedDB wrapper, all data is local (no backend server)
- **Leaflet + react-leaflet** — maps with OpenStreetMap + OpenSeaMap nautical overlay
- **Lucide React** — icons
- **React Hook Form** — forms
- **date-fns** — date formatting
- **vite-plugin-pwa** — PWA with Workbox service worker (offline tile/API caching)

## Architecture

### No Backend

All data lives in the browser's IndexedDB via Dexie. No server, no cloud, no accounts. Privacy-first — GPS positions, crew medical info, and float plans never leave the device unless explicitly shared.

### Data Flow

```
User Input → React Components → Zustand Stores (ephemeral state)
                               → Dexie/IndexedDB (persistent data)
                               → Windy/NOAA APIs (weather, tides, currents)
```

### External APIs

| API | Auth | Purpose | Rate Limit |
|-----|------|---------|------------|
| **Windy Point Forecast** | API key (user's, stored in localStorage) | Wind, gusts, waves, temp, pressure | 1,000 calls/day (free tier) |
| **NOAA Weather** (`api.weather.gov`) | None (User-Agent header) | Marine forecasts, alerts | No hard limit |
| **NOAA Tides** (`tidesandcurrents.noaa.gov`) | None | Tide predictions (hi/lo) | No hard limit |
| **NOAA Currents** (`tidesandcurrents.noaa.gov`) | None | Tidal current predictions | No hard limit |
| **OpenStreetMap** tiles | None | Base map tiles | Tile usage policy |
| **OpenSeaMap** tiles | None | Nautical chart overlay (buoys, depths) | Tile usage policy |

### Critical: Weather Data Integrity

- **All Windy API responses are cached for 30 minutes.** Pressing the same button twice MUST return the same results. See `src/services/windy-weather.ts` cache implementation.
- **Wave data fetch failures must be visible, never silent.** If `gfsWave` fails, set `waveDataUnavailable: true` and show a red warning. NEVER treat missing wave data as 0 ft waves.
- **Forecast confidence is enforced by lead time:** 0-3 days = high (reliable), 3-7 days = moderate (trends only), 7-10 days = low (general patterns), 10+ days = blocked (no assessment allowed).
- This was a real bug that produced dangerous contradictory results — see `memory/feedback_weather_consistency.md`.

## Project Structure

```
src/
├── main.tsx                          # Entry point, seeds DB
├── App.tsx                           # Router (all routes)
│
├── components/
│   ├── layout/                       # AppShell, BottomNav, Header, OfflineIndicator
│   └── map/                          # NauticalMap (Leaflet), DestinationMarkers
│
├── features/                         # Feature modules (self-contained)
│   ├── route-planning/
│   │   ├── pages/                    # ChartPage, RouteListPage, RoutePlannerPage,
│   │   │                            # RouteDetailPage, TripListPage, TripDetailPage,
│   │   │                            # TripEditPage, BoatConfigPage, MorePage
│   │   ├── components/               # WaypointEditor, DestinationPicker,
│   │   │                            # HomePortEditor, ApiKeysEditor
│   │   └── utils/                    # gpx.ts (GPX import/export),
│   │                                # predictwind-export.ts (text format)
│   ├── weather/
│   │   ├── pages/                    # WeatherDashboard, TripAssessmentPage
│   │   └── utils/                    # assessment-engine.ts (Go/No-Go engine)
│   ├── destinations/
│   │   └── pages/                    # DestinationListPage, DetailPage, EditPage
│   ├── safety/
│   │   └── pages/                    # SafetyDashboard, ChecklistListPage,
│   │                                # ChecklistRunnerPage, ChecklistEditorPage,
│   │                                # FloatPlanPage, MOBPage
│   ├── crew/pages/                   # CrewListPage
│   ├── logbook/pages/                # LogbookPage
│   ├── provisioning/pages/           # ProvisioningPage
│   └── watch-schedule/pages/         # WatchSchedulePage
│
├── db/
│   ├── database.ts                   # Dexie DB class, 14 tables
│   ├── seed.ts                       # Seeds destinations + checklists on first run
│   └── destinations-long-island-sound.ts  # 32+ LI Sound destinations
│
├── services/
│   ├── windy-weather.ts              # Windy Point Forecast API (CACHED, with retry)
│   ├── noaa-weather.ts               # NOAA Weather API
│   ├── noaa-tides.ts                 # NOAA Tide Predictions
│   └── noaa-currents.ts              # NOAA Tidal Currents (7 LI Sound stations)
│
├── stores/
│   ├── app-store.ts                  # Online status, active trip
│   └── settings-store.ts             # Boat config, home port, API keys,
│                                     # weather thresholds, theme, units
│
├── hooks/
│   ├── useOnlineStatus.ts            # Syncs navigator.onLine to store
│   └── useGeolocation.ts             # GPS with watch mode
│
├── types/                            # TypeScript interfaces per domain
│   ├── navigation.ts                 # Position, Waypoint, Route, RouteLeg, Trip
│   ├── boat.ts                       # BoatConfig
│   ├── weather.ts                    # WeatherForecast, TidePrediction, GoNoGo
│   ├── destination.ts                # Destination, Amenities, Marina/Anchorage/Mooring details
│   ├── safety.ts                     # Checklist, FloatPlan, EmergencyContact
│   ├── crew.ts                       # CrewMember, WatchSchedule
│   ├── provisioning.ts               # ProvisionPlan, MealPlan, GroceryItem
│   └── logbook.ts                    # LogEntry, TripSummary
│
├── utils/
│   ├── navigation-math.ts            # Haversine, bearings, magnetic variation, ETA, fuel
│   └── unit-conversion.ts            # NM/km, knots/mph, F/C, gal/liters
│
└── constants/
    ├── boat-defaults.ts              # Beneteau Oceanis 37 specs
    ├── map-config.ts                 # Tile URLs, default viewport
    ├── weather-thresholds.ts         # Go/Caution/No-Go limits (configurable)
    └── noaa-config.ts                # API base URLs
```

## Database (Dexie/IndexedDB)

Defined in `src/db/database.ts`. 14 tables:

| Table | Primary Key | Indexes |
|-------|------------|---------|
| trips | id | name, status, startDate |
| routes | id | tripId, name, createdAt |
| destinations | id | type, region, name, [type+region] |
| reviews | id | destinationId, rating |
| crewMembers | id | name, role |
| checklists | id | category, isDefault |
| checklistRuns | id | checklistId, tripId, startedAt |
| floatPlans | id | tripId, generatedAt |
| watchSchedules | id | tripId |
| provisionPlans | id | tripId |
| logEntries | id | tripId, timestamp, entryType |
| weatherCache | id | forecastZoneId, fetchedAt |
| tideCache | stationId | fetchedAt |
| boatConfigs | id | name |

### Seed Data

`src/db/seed.ts` runs on every app load. Uses a `SEED_VERSION` (currently 3) stored in localStorage. When version bumps, all non-user-added destinations are refreshed (preserving user reviews). Includes:

- **32+ Long Island Sound destinations** (Centerport, Northport, Huntington, Oyster Bay, Port Jefferson, Greenport, Shelter Island, Sag Harbor, Block Island, Montauk, plus CT coast: Stamford, Norwalk, Milford, Bridgeport, Branford, New Haven, Guilford, Clinton, Essex, Saybrook, Niantic, New London, Stonington, Mystic)
- **6 Chesapeake Bay destinations** (Annapolis, St. Michaels, Oxford, Solomons, Rock Hall, Annapolis YC)
- **4 default checklists:** Pre-Departure (24 items), Underway (8), Arrival (10), Heavy Weather (11)

## Key Features

### Go/No-Go Assessment Engine (`assessment-engine.ts`)

The core safety feature. For a given route + departure time:

1. Fetches Windy forecasts at 3+ sample points along the route (wind, gust, temp, pressure)
2. Fetches wave data from gfsWave model at route midpoint
3. Fetches NOAA tidal current predictions for any critical passages within 5 NM
4. Steps through the voyage hour-by-hour, computing the boat's position via interpolation
5. At each hour: rates wind/gust/wave/current against configurable thresholds
6. Detects wind-against-tide conditions (standing wave risk)
7. Produces overall GO / CAUTION / NO-GO verdict
8. Identifies bailout harbors within 15 NM (grouped by early/mid/late voyage segments)
9. Builds transit plans for critical passages (Hell Gate, The Race, Plum Gut) with slack water timing

### Critical Tidal Current Stations

Defined in `src/services/noaa-currents.ts`. Stations marked `critical: true` generate warnings:

- **Hell Gate** (`NYH1924`, bin **9** @ 6 ft) — up to 5 kt
- **The Race** (`LIS1001`, bin **13** @ 6 ft) — 3+ kt
- **Plum Gut** (`LIS1012`, bin **21** @ 25 ft) — 3+ kt, standing waves on ebb
- **Throgs Neck Bridge** (`LIS1038`, bin **15** @ 14 ft)

> **NOAA numbers current bins bottom-up: bin 1 is the DEEPEST reading, not the surface.**
> At Plum Gut bin 1 is 158 ft down and peaks at 1.6 kn on the ebb, while bin 21 at 25 ft
> peaks at 2.9 kn. Selecting a bin by number understates the current a keel actually meets,
> in the flattering direction. Choose by `depthFt` — `defaultBin()` does this.

> The IDs above were corrected in Aug 2026. `noaa-currents.ts` had `ACT4531`/`ACT4576`
> for The Race and Plum Gut, which are not the current-prediction stations for those
> passages — the Go/No-Go engine was querying the wrong places. Resolve station IDs from
> the bundled catalogue (`src/data/current-stations.json`, regenerated by
> `scripts/build-current-stations.mjs`) rather than hand-copying them.

### Weather Window Finder

Scans the next 7 days at 2-hour intervals, evaluates each potential departure time against the same threshold engine, and ranks results by safety score. Uses a single round of API calls (cached), then evaluates locally.

### Checklist System

- 4 default checklists (pre-departure, underway, heavy-weather, arrival)
- Interactive runner with large checkboxes (designed for wet hands on a moving boat)
- Items grouped by category with collapsible sections
- Per-item notes
- Auto-links to active trip
- **Auto-creates a logbook entry** on completion with timestamp, items checked, skipped items, and notes
- Custom checklist creation and editing

### Float Plan Generator

Auto-populates from trip/route/crew/boat data. Supports:
- Share via Web Share API (or clipboard fallback)
- Print via popup window with clean white-background layout
- Save to IndexedDB

### Route Planning

- Interactive map with tap-to-add waypoints, drag-to-move
- Color-coded waypoint types (departure, waypoint, destination, anchorage, hazard)
- Leg table with distance (NM), magnetic bearing, ETA, fuel consumption
- Water consumption calculator (per crew per day)
- GPX import/export (compatible with Navionics, OpenCPN, Garmin, etc.)
- PredictWind text export (copy to clipboard or download .txt)
- Destination picker (add marinas/anchorages as waypoints)
- Routes can be created from within a Trip page and auto-linked

## Boat Configuration Defaults

Beneteau Oceanis 37 (all editable in settings):
- LOA: 36.8 ft, Beam: 12.1 ft, Draft: 5.9 ft
- Engine: 40 HP diesel, 1.5 GPH at cruising RPM
- Fuel: 32 gal, Water: 66 gal, Holding: 26 gal
- Cruising speed: 6.0 kt
- Home port: Centerport Yacht Club (40.9014°N, 73.3530°W) — Northport Harbor, NY

## User Preferences (localStorage)

Persisted via Zustand `persist` middleware under key `cruising-planner-settings`:
- Boat config
- Home port (lat, lng, zoom, name)
- Weather thresholds (wind, gusts, waves, visibility, thunderstorm probability)
- API keys (Windy — stored locally, never in code)
- Theme (dark/light)
- Units (imperial/metric)

## PWA / Offline

- Service worker via `vite-plugin-pwa` with Workbox
- Map tiles cached CacheFirst (30 days) — OSM + OpenSeaMap
- NOAA weather cached NetworkFirst (6 hours)
- NOAA tides cached CacheFirst (30 days — deterministic predictions)
- All user data in IndexedDB — always available offline
- Windy responses cached in-memory for 2 hours (GFS updates every 6h)

## Routes (React Router)

```
/                          ChartPage (nautical map with destination markers)
/routes                    RouteListPage
/routes/new                RoutePlannerPage (create, accepts ?tripId=)
/routes/:id                RouteDetailPage
/routes/:id/edit           RoutePlannerPage (edit)
/trips                     TripListPage
/trips/new                 TripEditPage
/trips/:id                 TripDetailPage
/trips/:id/edit            TripEditPage
/trips/:id/assess          TripAssessmentPage (Go/No-Go)
/weather                   WeatherDashboard (location-switchable NOAA forecasts)
/destinations              DestinationListPage (search, filter, sort by distance)
/destinations/new          DestinationEditPage (with map pin picker)
/destinations/:id          DestinationDetailPage
/destinations/:id/edit     DestinationEditPage
/safety                    SafetyDashboard
/safety/checklists         ChecklistListPage
/safety/checklists/new     ChecklistEditorPage
/safety/checklists/:id/run ChecklistRunnerPage
/safety/checklists/:id/edit ChecklistEditorPage
/safety/float-plan         FloatPlanPage (accepts ?tripId=)
/safety/mob                MOBPage (Man Overboard procedure)
/more                      MorePage (links to secondary features)
/boat                      BoatConfigPage (vessel specs, home port, API keys)
/crew                      CrewListPage
/watch                     WatchSchedulePage
/provisioning              ProvisioningPage
/logbook                   LogbookPage
```

## UI Conventions

- Dark navy theme: `bg-slate-950` body, `bg-slate-900` cards, `text-slate-100` primary text
- Accent color: `sea-400` (#40c1d0) / `sea-600` for buttons
- Safety colors: `go` = green-400, `caution` = amber-400, `no-go` = red-400
- Bottom tab navigation (6 tabs: Chart, Routes, Weather, Places, Safety, More)
- Leaflet popups/controls styled dark to match theme (see `index.css`)
- Large touch targets for boat use (checkboxes 28px, buttons minimum 44px)
- Font: 16-18px base for readability on moving boat

## Deployment (Vercel)

- Deploys automatically on push to `main` (GitHub integration). Live at `www.sailwelladjusted.us`.
- **`vercel.json` is required — do not delete it.** It supplies the SPA fallback rewrite. Vercel's
  Vite preset does *not* add one, so without this file every path except `/` returns a hard 404
  from the edge (deep links, reloads, and shared URLs all break). This was removed once in
  `a72ef29` and went unnoticed for months, because the first load lands on `/`, all later
  navigation is client-side, and the service worker's `navigateFallback` masks ordinary reloads —
  only a *hard* reload exposes the 404.
- Use `rewrites`, never the legacy `routes` array. Rewrites are evaluated *after* the filesystem
  check, so `/assets`, `/photos`, `sw.js` and the manifest keep serving themselves. Earlier
  `routes`-based configs kept shadowing static assets (`fa0b29b`, `86a8645`).
- Verify a deploy with deep links, not just the home page:
  `curl -o /dev/null -w '%{http_code}' https://www.sailwelladjusted.us/planner/trips/new`

## Development Notes

- `npm install --legacy-peer-deps` needed for vite-plugin-pwa (peer dep mismatch with Vite 8)
- Seed version in `src/db/seed.ts` — bump `SEED_VERSION` when changing seed destination data
- Windy API key is NOT in code — user enters it in Boat Config → Weather API Keys
- NOAA APIs require `User-Agent` header but no API key
- Leaflet CSS imported in `NauticalMap.tsx` via `import 'leaflet/dist/leaflet.css'`

## Remaining Phases (from original plan)

- **Crew Management** — add/edit crew members with roles, medical info, dietary restrictions
- **Watch Schedule** — overnight watch rotation planner with visual timeline
- **Provisioning** — meal planner, water/fuel calculators, grocery list generator
- **Digital Logbook** — GPS-enabled log entries with photos, trip summaries
- **Offline Tile Downloader** — pre-cache chart tiles for a region before departure
