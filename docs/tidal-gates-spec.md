# Feature Spec: Tidal Gate Timing & Departure Solver

> Drop this in the repo as `docs/tidal-gates-spec.md` and point Claude Code at it:
> "Read docs/tidal-gates-spec.md and implement it. Plan first, show me the plan
> before writing code, then work in small commits."

---

## Context

This is the Well Adjusted cruising planner (welladjusted.us) — a Vite + React 19 +
TypeScript + Tailwind PWA using React Leaflet for charts, Zustand for state, and
Dexie (IndexedDB) for offline storage. It already supports building routes,
waypoint/leg tables with distance, bearing, time and fuel estimates, and exporting
routes as GPX.

The boat is a 2012 Beneteau Oceanis 37 based at Centerport Yacht Club on Long
Island Sound. Typical passages run east through Long Island Sound toward Block
Island.

## The problem to solve

Long Island Sound has a small number of narrow passages — "gates" — where tidal
current dominates passage planning. Plum Gut and The Race can run 4–5 knots. A
sailboat making 6 knots through the water arrives at a foul gate and makes 1–2
knots over ground, or fails to transit at all. The same gate on a fair current is
a 9-knot free ride.

Today the planner computes leg times assuming a constant boat speed and ignores
current entirely. That makes the ETAs wrong in exactly the places where being
wrong is expensive.

**Goal:** given a route and a departure window, tell the user what time to leave
so they hit each gate on a fair current.

---

## Scope

### 1. Gate definitions

Create a typed registry of tidal gates. Start with these, structured so more can
be added by data alone:

| Gate | NOAA current station | Notes |
|---|---|---|
| The Race | (look up via NOAA metadata API) | Strongest gate; between Fishers Island and Little Gull |
| Plum Gut | (look up) | Between Orient Point and Plum Island |
| Throgs Neck / Hell Gate | (look up) | Only relevant for westbound NYC passages |

Each gate record should carry:

```ts
interface TidalGate {
  id: string;
  name: string;
  position: LatLon;              // for matching against route legs
  stationId: string;             // NOAA current station
  bin?: number;                  // NOAA depth bin, if the station has several
  matchRadiusNm: number;         // how close a leg must pass to count as transiting
  // Which current direction is favorable, per transit heading:
  favorable: {
    eastbound: 'ebb' | 'flood';
    westbound: 'ebb' | 'flood';
  };
  cautionSpeedKn: number;        // above this, foul transit is impractical
}
```

Do not hardcode the favorable direction from assumption — derive it from the
NOAA station's reported flood/ebb direction (degrees true) compared to the
route's course over ground at that gate, and let the static config act as a
sanity check. Log a warning if they disagree.

### 2. NOAA data layer

Use the NOAA CO-OPS API. No API key required.

- **Station metadata:** the CO-OPS metadata API (`mdapi.tidesandcurrents.noaa.gov`),
  station type `currentpredictions`. Use it to resolve station IDs, bins, and
  flood/ebb directions rather than hardcoding them.
- **Predictions:** the CO-OPS data getter (`api.tidesandcurrents.noaa.gov`),
  `product=currents_predictions`.
  - `interval=MAX_SLACK` returns slack and max flood/ebb events — use this for
    the gate timeline and the solver.
  - `interval=6` returns a 6-minute speed series — use this for the detail graph.
  - Always request `time_zone=lst_ldt` and `units=english`, and store the
    resolved absolute timestamps, not local wall-clock strings.

Requirements:

- Wrap this in a `services/noaaCurrents.ts` module with a narrow interface. The
  rest of the app must not know NOAA's parameter names.
- **Verify the exact endpoint paths and parameter names against the current NOAA
  CO-OPS documentation before writing the client.** Do not guess. If a request
  shape is uncertain, write the smallest possible probe first and confirm the
  response.
- Handle CORS: if the browser cannot call NOAA directly, add a thin serverless
  proxy rather than embedding a third-party CORS relay.
- Retry with backoff on 5xx; surface a clear error state on 4xx.

### 3. Caching / offline

This is a PWA that has to work at anchor with no signal.

- Cache predictions in Dexie, keyed by `stationId + bin + date`.
- When a route is saved, prefetch predictions for every matched gate across the
  planned date ± 2 days.
- Show cache age in the UI. Data older than 30 days gets a staleness badge.
- All gate calculations must run correctly offline from cache; only fetching
  requires connectivity.

### 4. Gate matching

Given a route, determine which gates it transits:

- For each leg, find gates within `matchRadiusNm` of the leg's great-circle path.
- Compute the route's course over ground at the point of closest approach.
- Classify the transit as eastbound or westbound relative to the gate's
  flood/ebb axis.
- Return an ordered list of `GateTransit` records along the route.

### 5. ETA propagation

Extend the existing leg-time model:

- Walk the route from a candidate departure time, accumulating leg durations.
- At each gate, look up predicted current speed and direction at the arrival time.
- Apply the along-track component of current to speed over ground for the legs
  inside the gate's influence. Keep the model simple and honest — a scalar
  along-track projection is fine; do not pretend to model eddies.
- Iterate ETA once or twice, since a changed gate speed changes the arrival time
  at the *next* gate.

### 6. Departure solver

The headline feature.

Input: route, target date, earliest and latest acceptable departure, boat cruise
speed.

Process: sample candidate departure times across the window (10-minute
granularity is plenty), run ETA propagation for each, and score:

- **Hard fail** — arriving at a gate with foul current above `cautionSpeedKn`.
- **Penalty** — any foul current, scaled by speed.
- **Bonus** — fair current, scaled by speed.
- **Penalty** — total passage duration, and arrivals after dark.

Output: a ranked list of departure times with, for each, the ETA and current
condition at every gate. Show the top recommendation prominently and let the user
see the runners-up — the second-best option is often the one that fits real life.

### 7. UI

- **Gate timeline component**: a horizontal band per gate showing slack, max
  flood and max ebb across the day, with the projected arrival marked on it.
  Green for fair, amber for weak foul, red for hard foul. This should be
  readable at a glance on a phone in cockpit sunlight — high contrast, no thin
  gray text.
- **Departure recommendation card**: "Leave Centerport at 04:40 to carry the ebb
  through Plum Gut at 09:20 (2.9 kn fair)."
- **Manual override**: a departure-time slider that re-runs the projection live,
  so the user can explore rather than just accept the answer.
- Follow the existing Tailwind design language; do not introduce a new component
  library.

### 8. Warnings

Add a wind-against-tide check. If the app has wind forecast data available for
the gate's time window and the wind direction opposes the current axis with
sustained wind over ~15 kn, show a warning: steep standing waves are likely.
If wind data isn't available, say so rather than staying silent.

---

## Constraints

- TypeScript strict mode. No `any` in the new modules.
- Do not break existing GPX export or the current leg-table behavior. Existing
  route data in Dexie must migrate cleanly.
- Keep NOAA-specific types inside the service module.
- Unit-test the pure logic: gate matching, along-track current projection, and
  the solver's scoring. Fixture the NOAA responses; do not hit the network in
  tests.
- Timezone correctness is a first-class concern, not a detail. Store UTC
  internally, render in the boat's local zone, and write tests that cross a DST
  boundary.

## Acceptance criteria

1. Loading the existing Block Island route lists Plum Gut and The Race as
   detected gate transits, in the correct order.
2. Requesting a departure recommendation for a given date returns a ranked list
   whose top result puts the boat at both gates on a fair current, or explains
   why no such departure exists in the window.
3. Gate timelines render correct slack and max times cross-checked against the
   NOAA website for the same station and date.
4. With the device offline after a prefetch, gate timing still works from cache.
5. Existing tests pass; new logic has meaningful test coverage.

---

## 9. Multi-day itineraries

Passages are usually broken into overnight hops, not run in one push. A real
trip looks like:

```
Day 1  Centerport Yacht Club  ->  Port Jefferson      (overnight)
Day 2  Port Jefferson         ->  Stonington          (transits The Race)
Day 3  Stonington             ->  Montauk             (open crossing)
Day 4  Montauk                ->  Block Island
```

This must be a first-class model, not a workaround. A single-departure solve is
just the one-hop case.

### Data model

```ts
interface Itinerary {
  id: string;
  name: string;
  startDate: string;            // local date of Day 1 departure
  hops: Hop[];
}

interface Hop {
  id: string;
  routeId: string;              // an existing saved route
  fromStop: Stop;
  toStop: Stop;
  dayOffset: number;            // 0-based; allows layover days
  window: {
    earliestDeparture: string;  // local time-of-day
    latestArrival: string;      // local time-of-day
  };
  constraints: {
    daylightOnly: boolean;      // default true
    minHoursAtStop: number;     // rest between hops, default 10
  };
}

interface Stop {
  name: string;
  position: LatLon;
  kind: 'marina' | 'mooring' | 'anchorage' | 'home';
  notes?: string;               // launch hours, fuel dock, reservation info
}
```

### Solving

Solve **per hop**, then validate the chain:

1. For each hop in order, run the existing departure solver over that hop's
   window, on that hop's date.
2. Apply the chain constraint: a hop's earliest departure is the later of its
   own window and (previous hop's arrival + `minHoursAtStop`).
3. If `daylightOnly`, clamp the window to civil twilight for the stop's position
   and date. Compute sunrise/sunset locally — do not add a network dependency
   for it.
4. If a hop has **no feasible departure** — every option puts the boat at a gate
   on a hard-foul current, or arrives after dark — do not silently return the
   least-bad answer. Mark the hop infeasible, say which constraint broke it, and
   surface remedies: leave earlier, accept a night arrival, or split the hop.

### Alternative stops

When a hop is infeasible or unpleasant, the app should suggest breaking it
differently rather than leaving the user to re-plan by hand. Given a set of
candidate stops along the route corridor (Mattituck, Old Saybrook, Niantic,
Watch Hill, and so on), offer alternate splits that are feasible. Keep the
search small and explainable — this is a suggestion list, not a global optimizer.

### East-end routing choice

Leaving Long Island Sound eastbound, there are two doors, and they are different
gates with different timing:

- **The Race** — the northern route, toward Fishers Island Sound, Stonington,
  Watch Hill.
- **Plum Gut** — the southern route via Orient Point, toward Gardiners Bay,
  Montauk, Block Island.

The planner must treat these as alternative branches and be able to evaluate
both for a given hop, reporting which door gives the better transit that day.
Do not assume a route through one implies the other.

### UI

- Itinerary view: one row per day, each showing departure, ETA, distance,
  gates transited with their fair/foul status, and the overnight stop.
- Changing `startDate` re-solves the whole chain and shows what moved.
- Flag infeasible days in red at the itinerary level, so the problem is visible
  without opening the day.
- Each hop still opens into the single-hop gate timeline from section 7.

---

---

## 10. Sail / motor / motorsail recommendation per leg

For each leg of each hop, recommend whether to sail, motor, or motorsail — and
say why. This is the difference between a route planner and a passage planner.

### Inputs

- **Wind forecast** along the route for the projected time of each leg: true wind
  speed and direction, and gusts. Use a free, keyless source (Open-Meteo's marine
  and forecast APIs are a good fit for a PWA) as the default provider, behind the
  same narrow-service-module pattern as NOAA. If the user has a PredictWind
  subscription with API access, allow it as an alternate provider — the app
  already produces a PredictWind-formatted route summary, so keep the naming
  consistent.
- **Boat polar.** See "Polar sourcing" below. There is no manufacturer polar to
  fetch and no API — do not generate polar numbers from the model's own
  estimates under any circumstances.
- **Motoring parameters**: cruise RPM speed, fuel burn per hour, tank capacity —
  reuse whatever the existing fuel estimator already stores.
- **Gate deadlines** from sections 5 and 6, and daylight limits from section 9.

### Polar sourcing

This is the weakest link in the whole feature, so handle it explicitly.

Beneteau does not publish a machine-readable polar for the Oceanis 37, and no
manufacturer API exists. Polar data for this design comes from **ORC
certificates of individual certificated boats**, published through sources such
as ORC's own data, the community orc-data project, and boatpolars.com (CSV
export).

Requirements:

1. **Ship a seed polar as a checked-in data file**, not a runtime scrape. Store
   it as CSV or JSON at `src/data/polars/oceanis-37-<draft>.csv` with a header
   comment recording the source certificate, the boat it came from, the ORC VPP
   year, and the draft. Provenance is part of the data.
2. **Draft matters.** Oceanis 37s exist with roughly 1.41 m and 1.89 m keels, and
   their upwind numbers differ meaningfully. **This boat is the shoal keel at
   4.5 ft (~1.37 m), so use the 1.41 m certificate** — seed file
   `oceanis-37-shoal-1.41m.csv`. Keep the loader multi-file so a deep-draft
   polar can be added later, but ship the shoal one as the default selection.
3. **Never synthesize polar numbers.** If no seed file matches, the app disables
   sail/motor advice and says why. A fabricated polar produces confident,
   plausible, wrong recommendations at 0400 — worse than no feature.
4. **User-editable.** Expose the full TWA x TWS grid in settings for manual
   correction, with a reset-to-seed option.
5. **Label it honestly in the UI**: "ORC VPP estimate from a certificated sister
   ship — not measured from your boat."
6. **Design the storage for future fitting.** Keep the polar in a versioned
   record with a `source: 'seed' | 'user-edited' | 'fitted'` field, so a later
   pass can fit it from logged track and instrument data without a migration.
   That fitted polar is the one that will actually be worth trusting.

### Per-leg computation

1. Compute the leg's course over ground and the true wind angle at the projected
   time.
2. **Below the no-go band** (roughly 40 degrees TWA, tunable per polar): sailing
   the rhumb line is impossible. Either recommend motoring or, if the leg is long
   enough to be worth it, compute a two-tack solution with its VMG and the
   resulting extra distance and time — then let the recommendation compare that
   honestly against motoring.
3. **Light air**: below the polar's useful floor (typically around 5–6 knots true,
   less with a swell running), recommend motoring. Sailing at 2 knots into a
   left-over chop is not sailing.
4. **Above comfortable range**: flag reefing points from the polar's TWS bands and
   note when conditions exceed the crew comfort threshold set in settings.
5. **Required speed check**: compare polar boat speed against the speed needed to
   make the next gate window or the daylight arrival cutoff. If sailing does not
   make the deadline and motoring does, that is the recommendation — and the
   reason shown to the user is the deadline, not the wind.
6. **Motorsail** when sailing gets partway there: recommend it when polar speed is
   within roughly 1.5 knots of required speed, or when the wind angle is
   marginal. Estimate the fuel cost of the motorsailed portion.

### Output per leg

```ts
interface LegPropulsionAdvice {
  legId: string;
  recommendation: 'sail' | 'motor' | 'motorsail';
  reason: string;              // human sentence, shown verbatim in the UI
  trueWindAngle: number;
  trueWindSpeed: number;
  polarBoatSpeed: number;
  requiredSpeed: number | null; // null when no deadline binds this leg
  estimatedFuelGal: number;
  tackingOption?: {
    extraDistanceNm: number;
    extraTimeMin: number;
  };
  confidence: 'high' | 'medium' | 'low'; // degrade with forecast lead time
}
```

The `reason` string matters as much as the recommendation. "Motor — wind 4 kn
from 070, dead ahead, and you need 5.5 kn to make Plum Gut slack at 09:20" is
useful. "Motor" alone is not.

### Confidence and honesty

- Degrade `confidence` with forecast lead time. Beyond about three days, wind
  forecasts are a planning hint, not a schedule — say so in the UI rather than
  rendering a green "SAIL" badge with false authority.
- Show the fuel total for the itinerary under the recommended plan, and flag any
  hop where recommended motoring exceeds the range the tank supports.
- Never present polar output as measured performance. If the app later logs
  actual track data, a future pass can fit the polar to reality; until then it is
  a manufacturer-flavored guess.

### UI

Add a propulsion strip to the leg table: a small sail/motor/motorsail icon per
leg with the reason on tap. On the itinerary view, summarize per hop — for
example "Day 2: 31 NM, 22 sailing, 9 motoring through the light patch off
Mattituck, 3.1 gal."

---

## Explicitly out of scope for this pass

Full weather routing (optimizing the course itself for wind, rather than
advising propulsion along a fixed route), current modeling anywhere other than
the defined gates, and fitting polars from logged track data.

---

## A note to include in the UI

These are predictions, not observations. Real current varies with wind, runoff
and barometric pressure. Cross-check against NOAA before departure and treat the
recommendation as a plan, not an instrument.
