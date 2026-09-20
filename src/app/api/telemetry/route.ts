import { NextResponse } from "next/server";

export interface TelemetryData {
  temp: number;
  humidity: number;
  light: number;
  rawAdc?: number;
  dhtValid?: boolean;
  rainDetected?: boolean;
  oledActive?: boolean;
  heatIndex: number;
  dewPoint: number;
  rainProb: number;
  condition: string;
  comfort: string;
  advice: string;
  uptime?: string;
  timestamp: number;
}

interface GlobalTelemetryStore {
  latest: TelemetryData | null;
  history: Array<{ t: number; h: number; l: number; ts: number }>;
  lastSeen: number;
}

const globalStore: GlobalTelemetryStore = (global as unknown as { _weatherStore?: GlobalTelemetryStore })._weatherStore || {
  latest: null,
  history: [],
  lastSeen: 0,
};

(global as unknown as { _weatherStore?: GlobalTelemetryStore })._weatherStore = globalStore;

const DEFAULT_API_KEY = "weather123";

// =========================================================================
// METEOROLOGICAL & THERMAL COMPUTATION ENGINE (OFFLOADED TO VERCEL)
// =========================================================================

function computeHeatIndex(tC: number, rh: number): number {
  const tF = (tC * 9) / 5 + 32;
  if (tF < 80.0) {
    return tC;
  }
  let hiF = 0.5 * (tF + 61.0 + (tF - 68.0) * 1.2 + rh * 0.094);
  if (hiF > 79.0) {
    hiF = -42.379 + 2.04901523 * tF + 10.14333127 * rh
      - 0.22475541 * tF * rh - 0.00683783 * tF * tF
      - 0.05481717 * rh * rh + 0.00122874 * tF * tF * rh
      + 0.00085282 * tF * rh * rh - 0.00000199 * tF * tF * rh * rh;
  }
  const hiC = ((hiF - 32) * 5) / 9;
  return Number(hiC.toFixed(2));
}

function computeDewPoint(tC: number, rh: number): number {
  const a = 17.27;
  const b = 237.7;
  const safeRh = Math.max(1, Math.min(100, rh));
  const alpha = ((a * tC) / (b + tC)) + Math.log(safeRh / 100.0);
  const dp = (b * alpha) / (a - alpha);
  return Number(dp.toFixed(2));
}

function computeRainProbability(tC: number, rh: number, lightPct: number, dewPoint: number, rainDetected: boolean): number {
  if (rainDetected) return 100;

  let prob = 6;
  if (rh > 85) prob += 38;
  else if (rh > 70) prob += 24;
  else if (rh > 55) prob += 12;

  const spread = tC - dewPoint;
  if (spread < 2.5) prob += 30;
  else if (spread < 5.0) prob += 18;
  else if (spread < 7.5) prob += 8;

  if (lightPct < 30 && rh > 65) prob += 10;
  return Math.min(95, Math.max(5, Math.round(prob)));
}

function evaluateConditionAndAdvice(
  tC: number,
  rh: number,
  lightPct: number,
  heatIndex: number,
  rainProb: number,
  dhtValid: boolean,
  rainDetected: boolean
): { condition: string; comfort: string; advice: string } {
  if (!dhtValid) {
    return {
      condition: "Sensor Standby",
      comfort: "Check DHT Connection",
      advice: "DHT11 sensor reading unavailable. Check physical wiring on D5/D2.",
    };
  }

  if (rainDetected) {
    return {
      condition: "Rain Detected",
      comfort: "Active Precipitation",
      advice: "Rain sensor is detecting moisture. Keep electronics covered and take umbrella.",
    };
  }

  const isNight = lightPct < 15;

  let condition = isNight ? "Clear Night" : "Clear & Sunny";
  if (rainProb > 65) {
    condition = "Rain Expected";
  } else if (rh > 80) {
    condition = isNight ? "Humid Night" : "Humid & Overcast";
  } else if (lightPct < 40 && !isNight) {
    condition = "Partly Cloudy";
  }

  let comfort = "Pleasantly Balanced";
  let advice = "Comfortable ambient indoor/outdoor climate conditions.";

  if (heatIndex >= 40) {
    comfort = "Hot & Oppressive";
    advice = "High heat caution: stay hydrated and ensure good ventilation.";
  } else if (heatIndex >= 33) {
    comfort = "Warm & Humid";
    advice = "Warm conditions: light clothing and indoor airflow recommended.";
  } else if (heatIndex >= 22 && heatIndex < 28 && rh >= 40 && rh <= 65) {
    comfort = "Ideal & Balanced";
    advice = "Optimum comfort zone with balanced temperature and humidity.";
  } else if (tC < 18) {
    comfort = "Cool & Crisp";
    advice = "Cooler ambient air: light outerwear recommended for outdoors.";
  } else if (rh < 30) {
    comfort = "Dry Air";
    advice = "Low humidity: consider hydration or an indoor humidifier.";
  }

  return { condition, comfort, advice };
}

// =========================================================================
// API HANDLERS
// =========================================================================

export async function GET() {
  const now = Date.now();
  const isOnline = globalStore.latest !== null && (now - globalStore.lastSeen < 60000);

  if (!globalStore.latest) {
    const demoData: TelemetryData = {
      temp: 26.4,
      humidity: 52.0,
      light: 65.0,
      rawAdc: 358,
      dhtValid: true,
      rainDetected: false,
      oledActive: false,
      heatIndex: 27.2,
      dewPoint: 15.8,
      rainProb: 8,
      condition: "Sunny & Clear",
      comfort: "Pleasantly Balanced",
      advice: "Waiting for ESP8266 check-in. Showing initial calibration state.",
      uptime: "00:00:00",
      timestamp: now,
    };

    return NextResponse.json({
      success: true,
      isLiveDevice: false,
      isOnline: false,
      message: "No live ESP8266 ping received yet. Showing standby preview.",
      telemetry: demoData,
      history: [],
      lastSeenSecondsAgo: null,
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, max-age=0",
      }
    });
  }

  const secondsAgo = Math.round((now - globalStore.lastSeen) / 1000);

  return NextResponse.json({
    success: true,
    isLiveDevice: true,
    isOnline,
    telemetry: globalStore.latest,
    history: globalStore.history,
    lastSeenSecondsAgo: secondsAgo,
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0",
    }
  });
}

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("key");
    if (apiKey && apiKey !== DEFAULT_API_KEY && process.env.WEATHER_API_KEY && apiKey !== process.env.WEATHER_API_KEY) {
      return NextResponse.json({ error: "Unauthorized: Invalid API Key" }, { status: 401 });
    }

    const body = await req.json();
    const now = Date.now();

    const rawTemp = body.temp !== undefined ? Number(body.temp) : (body.t !== undefined ? Number(body.t) : 0);
    const rawHum = body.humidity !== undefined ? Number(body.humidity) : (body.h !== undefined ? Number(body.h) : 0);
    const rawAdc = body.rawAdc !== undefined ? Number(body.rawAdc) : (body.adc !== undefined ? Number(body.adc) : 0);
    const dhtValid = body.dhtValid !== undefined ? Boolean(body.dhtValid) : (body.valid !== undefined ? Boolean(body.valid) : true);
    const rainDetected = body.rainDetected !== undefined ? Boolean(body.rainDetected) : (body.rain !== undefined ? Boolean(body.rain) : false);
    const oledActive = body.oledActive !== undefined ? Boolean(body.oledActive) : false;

    let light = body.light !== undefined ? Number(body.light) : (body.l !== undefined ? Number(body.l) : 0);
    if (body.light === undefined && body.l === undefined && rawAdc !== undefined) {
      const clampedAdc = Math.max(0, Math.min(1023, rawAdc));
      light = 100 - Number(((clampedAdc / 1023) * 100).toFixed(0));
    }

    const heatIndex = body.heatIndex !== undefined ? Number(body.heatIndex) : computeHeatIndex(rawTemp, rawHum);
    const dewPoint = body.dewPoint !== undefined ? Number(body.dewPoint) : computeDewPoint(rawTemp, rawHum);
    const rainProb = body.rainProb !== undefined ? Number(body.rainProb) : computeRainProbability(rawTemp, rawHum, light, dewPoint, rainDetected);

    const { condition, comfort, advice } = evaluateConditionAndAdvice(rawTemp, rawHum, light, heatIndex, rainProb, dhtValid, rainDetected);

    const data: TelemetryData = {
      temp: rawTemp,
      humidity: rawHum,
      light,
      rawAdc,
      dhtValid,
      rainDetected,
      oledActive,
      heatIndex,
      dewPoint,
      rainProb,
      condition: body.condition || condition,
      comfort: body.comfort || comfort,
      advice: body.advice || advice,
      uptime: body.uptime ? String(body.uptime) : undefined,
      timestamp: now,
    };

    globalStore.latest = data;
    globalStore.lastSeen = now;

    if (dhtValid && rawTemp > 0) {
      globalStore.history.push({
        t: rawTemp,
        h: rawHum,
        l: light,
        ts: now,
      });
      if (globalStore.history.length > 60) {
        globalStore.history.shift();
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now,
      calculatedOnVercel: true,
      rainDetected,
      pointsCount: globalStore.history.length,
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to parse telemetry", details: message }, { status: 400 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    },
  });
}
