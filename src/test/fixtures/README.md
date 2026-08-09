# Test fixtures

Real data captured once and checked in, so tests never hit the network.

- `*.gpx` — routes exported from the app, used to test gate matching and ETA
  propagation against waypoints the boat actually sails.
- `noaa-*.json` — literal NOAA CO-OPS responses, captured from the live API.

Nothing here is synthesised. If a fixture needs new data, capture it from the
real source rather than hand-writing plausible numbers.
