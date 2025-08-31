// Geocoding utilities for converting addresses to GPS coordinates
export interface GeocodeResult {
  latitude: string;
  longitude: string;
  formattedAddress?: string;
}

// Using a free geocoding service (Nominatim by OpenStreetMap)
export async function geocodeAddress(address: {
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}): Promise<GeocodeResult | null> {
  try {
    // Build the search query from address components
    const parts = [
      address.streetAddress,
      address.city,
      address.state,
      address.zipCode
    ].filter(Boolean);
    
    if (parts.length === 0) {
      return null;
    }
    
    const searchQuery = parts.join(', ');
    console.log("Geocoding address:", searchQuery);
    
    // Use Nominatim (free OpenStreetMap geocoding service)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&countrycodes=us`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Retitree-Job-Market-Insights/1.0 (contact@example.com)'
      }
    });
    
    if (!response.ok) {
      console.error("Geocoding API error:", response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.log("No geocoding results found for:", searchQuery);
      return null;
    }
    
    const result = data[0];
    
    return {
      latitude: result.lat,
      longitude: result.lon,
      formattedAddress: result.display_name
    };
    
  } catch (error) {
    console.error("Error geocoding address:", error);
    return null;
  }
}

// Get current location using browser geolocation API
export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

// This will be used on the frontend
export function getCurrentLocation(): Promise<LocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000 // Cache for 1 minute
      }
    );
  });
}

// Calculate distance between two GPS coordinates (in miles)
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}