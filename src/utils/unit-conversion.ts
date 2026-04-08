export function nmToKm(nm: number): number {
  return nm * 1.852;
}

export function kmToNm(km: number): number {
  return km / 1.852;
}

export function knotsToMph(knots: number): number {
  return knots * 1.15078;
}

export function mphToKnots(mph: number): number {
  return mph / 1.15078;
}

export function knotsToKmh(knots: number): number {
  return knots * 1.852;
}

export function feetToMeters(feet: number): number {
  return feet * 0.3048;
}

export function metersToFeet(meters: number): number {
  return meters / 0.3048;
}

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

export function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

export function gallonsToLiters(gal: number): number {
  return gal * 3.785;
}

export function litersToGallons(liters: number): number {
  return liters / 3.785;
}
