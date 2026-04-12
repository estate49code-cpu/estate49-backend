// services/nearby.js
const axios = require('axios');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// 5 km radius
const SEARCH_RADIUS = 5000;

const CATEGORY_CONFIG = [
  {
    key: 'schools',
    label: 'Schools',
    query: `
      node(around:RADIUS,LAT,LON)["amenity"="school"];
      way(around:RADIUS,LAT,LON)["amenity"="school"];
      relation(around:RADIUS,LAT,LON)["amenity"="school"];
    `
  },
  {
    key: 'colleges',
    label: 'Colleges',
    query: `
      node(around:RADIUS,LAT,LON)["amenity"~"^(college|university)$"];
      way(around:RADIUS,LAT,LON)["amenity"~"^(college|university)$"];
      relation(around:RADIUS,LAT,LON)["amenity"~"^(college|university)$"];
    `
  },
  {
    key: 'hospitals',
    label: 'Hospitals',
    query: `
      node(around:RADIUS,LAT,LON)["amenity"="hospital"];
      way(around:RADIUS,LAT,LON)["amenity"="hospital"];
      relation(around:RADIUS,LAT,LON)["amenity"="hospital"];
    `
  },
  {
    key: 'clinics',
    label: 'Clinics',
    query: `
      node(around:RADIUS,LAT,LON)["amenity"="clinic"];
      way(around:RADIUS,LAT,LON)["amenity"="clinic"];
      relation(around:RADIUS,LAT,LON)["amenity"="clinic"];
    `
  },
  {
    key: 'pharmacies',
    label: 'Pharmacies',
    query: `
      node(around:RADIUS,LAT,LON)["amenity"="pharmacy"];
      way(around:RADIUS,LAT,LON)["amenity"="pharmacy"];
      relation(around:RADIUS,LAT,LON)["amenity"="pharmacy"];
    `
  },
  {
    key: 'busStops',
    label: 'Bus Stops',
    query: `
      node(around:RADIUS,LAT,LON)["highway"="bus_stop"];
      node(around:RADIUS,LAT,LON)["amenity"="bus_station"];
      node(around:RADIUS,LAT,LON)["public_transport"="station"];
      way(around:RADIUS,LAT,LON)["amenity"="bus_station"];
      relation(around:RADIUS,LAT,LON)["amenity"="bus_station"];
    `
  },
  {
    key: 'railMetro',
    label: 'Metro / Rail',
    query: `
      node(around:RADIUS,LAT,LON)["railway"="station"];
      node(around:RADIUS,LAT,LON)["railway"="halt"];
      node(around:RADIUS,LAT,LON)["station"="subway"];
      node(around:RADIUS,LAT,LON)["railway"="subway_entrance"];
      node(around:RADIUS,LAT,LON)["public_transport"="station"];
      way(around:RADIUS,LAT,LON)["railway"="station"];
      relation(around:RADIUS,LAT,LON)["railway"="station"];
    `
  },
  {
    key: 'supermarkets',
    label: 'Supermarkets',
    query: `
      node(around:RADIUS,LAT,LON)["shop"~"^(supermarket|convenience|department_store|mall)$"];
      way(around:RADIUS,LAT,LON)["shop"~"^(supermarket|convenience|department_store|mall)$"];
      relation(around:RADIUS,LAT,LON)["shop"~"^(supermarket|convenience|department_store|mall)$"];
    `
  },
  {
    key: 'parks',
    label: 'Parks',
    query: `
      node(around:RADIUS,LAT,LON)["leisure"="park"];
      way(around:RADIUS,LAT,LON)["leisure"="park"];
      relation(around:RADIUS,LAT,LON)["leisure"="park"];
    `
  },
  {
    key: 'banks',
    label: 'Banks',
    query: `
      node(around:RADIUS,LAT,LON)["amenity"~"^(bank|atm)$"];
      way(around:RADIUS,LAT,LON)["amenity"="bank"];
      relation(around:RADIUS,LAT,LON)["amenity"="bank"];
    `
  },
  {
    key: 'restaurants',
    label: 'Restaurants',
    query: `
      node(around:RADIUS,LAT,LON)["amenity"~"^(restaurant|cafe|fast_food|food_court)$"];
      way(around:RADIUS,LAT,LON)["amenity"~"^(restaurant|cafe|fast_food|food_court)$"];
      relation(around:RADIUS,LAT,LON)["amenity"~"^(restaurant|cafe|fast_food|food_court)$"];
    `
  }
];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildCategoryQuery(lat, lon, radius) {
  const blocks = CATEGORY_CONFIG.map(item =>
    item.query
      .replaceAll('LAT', String(lat))
      .replaceAll('LON', String(lon))
      .replaceAll('RADIUS', String(radius))
  ).join('\n');

  return `
    [out:json][timeout:25];
    (
      ${blocks}
    );
    out center tags;
  `;
}

function getElementLatLon(el) {
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;
  return { lat, lon };
}

function distanceInKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function detectCategories(tags = {}) {
  const matched = [];

  if (tags.amenity === 'school') matched.push('schools');
  if (tags.amenity === 'college' || tags.amenity === 'university') matched.push('colleges');
  if (tags.amenity === 'hospital') matched.push('hospitals');
  if (tags.amenity === 'clinic') matched.push('clinics');
  if (tags.amenity === 'pharmacy') matched.push('pharmacies');

  if (
    tags.highway === 'bus_stop' ||
    tags.amenity === 'bus_station' ||
    tags.public_transport === 'station'
  ) {
    matched.push('busStops');
  }

  if (
    tags.railway === 'station' ||
    tags.railway === 'halt' ||
    tags.station === 'subway' ||
    tags.railway === 'subway_entrance'
  ) {
    matched.push('railMetro');
  }

  if (
    tags.shop === 'supermarket' ||
    tags.shop === 'convenience' ||
    tags.shop === 'department_store' ||
    tags.shop === 'mall'
  ) {
    matched.push('supermarkets');
  }

  if (tags.leisure === 'park') matched.push('parks');

  if (tags.amenity === 'bank' || tags.amenity === 'atm') matched.push('banks');

  if (
    tags.amenity === 'restaurant' ||
    tags.amenity === 'cafe' ||
    tags.amenity === 'fast_food' ||
    tags.amenity === 'food_court'
  ) {
    matched.push('restaurants');
  }

  return [...new Set(matched)];
}

function createEmptySummary() {
  const summary = {
    radius_meters: SEARCH_RADIUS,
    total_places_found: 0,
    categories_found: 0
  };

  for (const item of CATEGORY_CONFIG) {
    summary[item.key] = [];
    summary[`${item.key}_count`] = 0;
    summary[`nearest_${item.key}`] = null;
  }

  return summary;
}

function normalizeElements(elements, originLat, originLon) {
  const seen = new Set();
  const byCategory = {};

  for (const item of CATEGORY_CONFIG) {
    byCategory[item.key] = [];
  }

  for (const el of elements || []) {
    const tags = el.tags || {};
    const { lat, lon } = getElementLatLon(el);
    if (lat == null || lon == null) continue;

    const name =
      tags.name ||
      tags.operator ||
      tags.brand ||
      tags.official_name ||
      'Unnamed place';

    const distance_km = distanceInKm(originLat, originLon, lat, lon);
    if (!Number.isFinite(distance_km)) continue;

    const uniqueKey = `${name}-${lat}-${lon}`;
    const matchedCategories = detectCategories(tags);

    for (const category of matchedCategories) {
      const scopedKey = `${category}-${uniqueKey}`;
      if (seen.has(scopedKey)) continue;
      seen.add(scopedKey);

      byCategory[category].push({
        name,
        lat,
        lon,
        distance_km: Number(distance_km.toFixed(2)),
        tags
      });
    }
  }

  for (const item of CATEGORY_CONFIG) {
    byCategory[item.key].sort((a, b) => a.distance_km - b.distance_km);
  }

  return byCategory;
}

async function fetchNearbyPlaces(lat, lon) {
  const parsedLat = toNumber(lat);
  const parsedLon = toNumber(lon);

  if (parsedLat == null || parsedLon == null) {
    return {
      ...createEmptySummary(),
      error: 'Missing or invalid property coordinates.'
    };
  }

  try {
    const query = buildCategoryQuery(parsedLat, parsedLon, SEARCH_RADIUS);

    const response = await axios.post(OVERPASS_URL, query, {
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'Estate49NearbyService/1.0'
      },
      timeout: 30000
    });

    const elements = response.data?.elements || [];
    const grouped = normalizeElements(elements, parsedLat, parsedLon);
    const summary = createEmptySummary();

    let total = 0;
    let categoriesFound = 0;

    for (const item of CATEGORY_CONFIG) {
      const places = grouped[item.key] || [];
      const topPlaces = places.slice(0, 5);

      summary[item.key] = topPlaces;
      summary[`${item.key}_count`] = places.length;
      summary[`nearest_${item.key}`] = places.length ? places[0] : null;

      total += places.length;
      if (places.length > 0) categoriesFound += 1;
    }

    summary.total_places_found = total;
    summary.categories_found = categoriesFound;

    return summary;
  } catch (error) {
    return {
      ...createEmptySummary(),
      error: error.response?.data || error.message || 'Nearby places lookup failed.'
    };
  }
}

function shortNearestText(label, item) {
  if (!item) return null;
  return `${label}: ${item.name} (${item.distance_km} km)`;
}

function buildNearbyAdvice(summary) {
  if (!summary || summary.error) {
    return 'Nearby data is temporarily unavailable right now.';
  }

  const highlights = [
    shortNearestText('School', summary.nearest_schools),
    shortNearestText('College', summary.nearest_colleges),
    shortNearestText('Hospital', summary.nearest_hospitals),
    shortNearestText('Clinic', summary.nearest_clinics),
    shortNearestText('Pharmacy', summary.nearest_pharmacies),
    shortNearestText('Bus stop', summary.nearest_busStops),
    shortNearestText('Metro/Rail', summary.nearest_railMetro),
    shortNearestText('Supermarket', summary.nearest_supermarkets),
    shortNearestText('Park', summary.nearest_parks),
    shortNearestText('Bank/ATM', summary.nearest_banks)
  ].filter(Boolean);

  if (highlights.length === 0) {
    return 'Limited nearby place data found within 5 km.';
  }

  const priorityNotes = [];

  if (summary.nearest_hospitals) priorityNotes.push(`hospital ${summary.nearest_hospitals.distance_km} km away`);
  if (summary.nearest_schools) priorityNotes.push(`school ${summary.nearest_schools.distance_km} km away`);
  if (summary.nearest_supermarkets) priorityNotes.push(`shopping ${summary.nearest_supermarkets.distance_km} km away`);
  if (summary.nearest_railMetro) priorityNotes.push(`metro/rail ${summary.nearest_railMetro.distance_km} km away`);
  else if (summary.nearest_busStops) priorityNotes.push(`bus access ${summary.nearest_busStops.distance_km} km away`);

  const intro =
    priorityNotes.length > 0
      ? `Nearby essentials available, including ${priorityNotes.slice(0, 3).join(', ')}.`
      : 'Some useful nearby places were found within 5 km.';

  return `${intro} ${highlights.slice(0, 4).join(' • ')}`;
}

module.exports = {
  fetchNearbyPlaces,
  buildNearbyAdvice
};