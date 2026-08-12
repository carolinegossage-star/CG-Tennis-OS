// ============================================================
// CG Tennis OS™ — WEATHER SERVICE
// Powers the Weather Alert slot on the Business Dashboard and any
// future location-aware features (e.g. Apex Tour Intelligence™
// tournament-location forecasts).
// © CG Tennis Academies. All Rights Reserved.
// ============================================================
//
// PROVIDER STRATEGY
// Primary:  WeatherAPI   — commercial backing, free tier (1M calls/month),
//                          chosen for launch reliability across coaches in
//                          different countries/timezones using the system
//                          for real-time feedback.
// Fallback: Open-Meteo    — no API key, blends 30+ national weather service
//                          models (including the relevant national met
//                          office per location). Used automatically if the
//                          primary call fails, errors, or times out — never
//                          surfaced as a downgrade to the person using it.
//
// Both providers are wrapped behind one interface (getForecast). Nothing
// elsewhere in the app — routes, frontend, future Tour Intelligence work —
// should ever call a provider's API directly. Swapping primary/fallback,
// or adding a third provider later, only ever means editing this file.

const { cache } = require('../config/database');
const logger = require('../utils/logger');

const WEATHERAPI_KEY = process.env.WEATHERAPI_KEY;
const WEATHERAPI_BASE_URL = 'https://api.weatherapi.com/v1';
const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes — forecasts don't need to be
                                    // fetched more often than this per location,
                                    // keeps both providers well inside free-tier
                                    // call limits even at scale.

// ─── Public Interface ──────────────────────────────────────────────────────────
// lat/lng required. locationLabel is optional, used only for logging/cache
// key readability (e.g. "Dorset, UK").
async function getForecast(lat, lng, locationLabel = '') {
  const cacheKey = `weather:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  let result;
  try {
    result = await fetchFromWeatherApi(lat, lng);
    result.provider = 'weatherapi';
  } catch (err) {
    logger.warn('WeatherAPI call failed — falling back to Open-Meteo', {
      error: err.message,
      location: locationLabel || `${lat},${lng}`,
    });
    try {
      result = await fetchFromOpenMeteo(lat, lng);
      result.provider = 'open-meteo';
    } catch (fallbackErr) {
      logger.error('Both weather providers failed', {
        weatherApiError: err.message,
        openMeteoError: fallbackErr.message,
        location: locationLabel || `${lat},${lng}`,
      });
      throw new Error('Weather forecast unavailable — both providers failed');
    }
  }

  await cache.set(cacheKey, result, CACHE_TTL_SECONDS);
  return { ...result, fromCache: false };
}

// ─── WeatherAPI (primary) ──────────────────────────────────────────────────────
async function fetchFromWeatherApi(lat, lng) {
  if (!WEATHERAPI_KEY) {
    throw new Error('WEATHERAPI_KEY not configured');
  }

  const url = `${WEATHERAPI_BASE_URL}/forecast.json?key=${WEATHERAPI_KEY}&q=${lat},${lng}&days=1&aqi=no&alerts=no`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

  if (!res.ok) {
    throw new Error(`WeatherAPI returned ${res.status}`);
  }

  const data = await res.json();
  return normaliseWeatherApiResponse(data);
}

function normaliseWeatherApiResponse(data) {
  const today = data.forecast?.forecastday?.[0];
  const hours = today?.hour || [];

  // Find the next 6 hours of hourly data from "now" for the alert-relevant window
  const now = new Date();
  const upcoming = hours.filter(h => new Date(h.time) >= now).slice(0, 6);

  return {
    locationName: data.location?.name,
    region: data.location?.region,
    country: data.location?.country,
    currentTempC: data.current?.temp_c,
    currentCondition: data.current?.condition?.text,
    willRain: upcoming.some(h => h.chance_of_rain >= 50 || h.will_it_rain === 1),
    maxChanceOfRain: Math.max(...upcoming.map(h => h.chance_of_rain || 0), 0),
    windKph: data.current?.wind_kph,
    hourly: upcoming.map(h => ({
      time: h.time,
      tempC: h.temp_c,
      chanceOfRain: h.chance_of_rain,
      condition: h.condition?.text,
      windKph: h.wind_kph,
    })),
  };
}

// ─── Open-Meteo (fallback) ─────────────────────────────────────────────────────
async function fetchFromOpenMeteo(lat, lng) {
  const url = `${OPEN_METEO_BASE_URL}?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m&forecast_days=1&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

  if (!res.ok) {
    throw new Error(`Open-Meteo returned ${res.status}`);
  }

  const data = await res.json();
  return normaliseOpenMeteoResponse(data);
}

function normaliseOpenMeteoResponse(data) {
  const times = data.hourly?.time || [];
  const temps = data.hourly?.temperature_2m || [];
  const rainChance = data.hourly?.precipitation_probability || [];
  const windSpeed = data.hourly?.windspeed_10m || [];
  const weatherCodes = data.hourly?.weathercode || [];

  const now = new Date();
  const upcomingIndices = times
    .map((t, i) => ({ time: t, index: i }))
    .filter(({ time }) => new Date(time) >= now)
    .slice(0, 6);

  const hourly = upcomingIndices.map(({ time, index }) => ({
    time,
    tempC: temps[index],
    chanceOfRain: rainChance[index],
    condition: weatherCodeToText(weatherCodes[index]),
    windKph: windSpeed[index],
  }));

  return {
    locationName: null, // Open-Meteo doesn't reverse-geocode; caller already has lat/lng context
    currentTempC: hourly[0]?.tempC ?? null,
    currentCondition: hourly[0]?.condition ?? null,
    willRain: hourly.some(h => (h.chanceOfRain || 0) >= 50),
    maxChanceOfRain: Math.max(...hourly.map(h => h.chanceOfRain || 0), 0),
    windKph: hourly[0]?.windKph ?? null,
    hourly,
  };
}

// Open-Meteo returns WMO weather codes (numeric) rather than text — map the
// common ones relevant to outdoor tennis sessions. Uncommon codes fall back
// to a generic label rather than failing.
const WMO_CODE_MAP = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};
function weatherCodeToText(code) {
  return WMO_CODE_MAP[code] || 'Unknown';
}

// ─── Alert-Relevant Helper ──────────────────────────────────────────────────────
// Used directly by the Business Dashboard's Weather Alert slot — answers the
// one question that slot actually needs: is there a disruption risk today,
// and if so, what should the alert say.
async function checkSessionWeatherRisk(lat, lng, locationLabel = '') {
  const forecast = await getForecast(lat, lng, locationLabel);

  if (!forecast.willRain) {
    return { atRisk: false };
  }

  const riskyHour = forecast.hourly.find(h => (h.chanceOfRain || 0) >= 50);

  return {
    atRisk: true,
    chanceOfRain: forecast.maxChanceOfRain,
    riskyTime: riskyHour?.time || null,
    condition: riskyHour?.condition || forecast.currentCondition,
    provider: forecast.provider,
  };
}

module.exports = {
  getForecast,
  checkSessionWeatherRisk,
};
