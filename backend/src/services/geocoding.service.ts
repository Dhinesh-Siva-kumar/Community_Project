import { env } from '../config/env';

export interface GeocodeAddressParts {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
}

interface GoogleGeocodeResponse {
  status: string;
  results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
}

function buildQuery(parts: GeocodeAddressParts): string | null {
  const query = [parts.address, parts.city, parts.state, parts.country, parts.pincode]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(', ');
  return query.trim().length > 0 ? query : null;
}

/**
 * Resolves a business's free-text address into coordinates via Google's
 * Geocoding API — the same address fields that already power the
 * auto-generated `mapsLink`, just turned into a lat/lng pair instead of a
 * text-search URL. Never throws: returns `null` if the key isn't configured,
 * the address can't be resolved, or the request fails, so a business can
 * always still be created/updated without coordinates.
 */
export async function geocodeAddress(parts: GeocodeAddressParts): Promise<GeocodeResult | null> {
  if (!env.GOOGLE_MAPS_GEOCODING_API_KEY) {
    console.warn('[GeocodingService] GOOGLE_MAPS_GEOCODING_API_KEY not set — skipping geocoding.');
    return null;
  }

  const query = buildQuery(parts);
  if (!query) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${env.GOOGLE_MAPS_GEOCODING_API_KEY}`;
    const response = await fetch(url);
    const body = (await response.json()) as GoogleGeocodeResponse;

    if (body.status !== 'OK' || !body.results?.length) {
      if (body.status !== 'ZERO_RESULTS') {
        console.warn(`[GeocodingService] Geocoding failed for "${query}": ${body.status}`);
      }
      return null;
    }

    const location = body.results[0].geometry.location;
    return { latitude: location.lat, longitude: location.lng };
  } catch (err) {
    console.error('[GeocodingService] Error:', err);
    return null;
  }
}
