import { NextResponse } from "next/server";

export interface TelemetryData {
  temp: number;
  humidity: number;
  light: number;
  rawAdc?: number;
  dhtValid?: boolean;
  heatIndex: number;
  dewPoint: number;
  rainProb: number;
  condition: string;
  comfort: string;
  advice: string;
  uptime?: string;
  timestamp: number;
}

// Global in-memory cache on Vercel Serverless instance
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

export async function GET() {
  const now = Date.now();
  const isOnline = globalStore.latest !== null && (now - globalStore.lastSeen < 60000);

  // If no data received yet, return sample/demo state with indicator
  if (!globalStore.latest) {
    const demoData: TelemetryData = {
      temp: 26.4,
      humidity: 52.0,
      light: 65.0,
      rawAdc: 610,
      dhtValid: true,
      heatIndex: 27.2,
      dewPoint: 15.8,
      rainProb: 8,
      condition: "Sunny & Clear",
      comfort: "Pleasantly Balanced",
      advice: "Waiting for ESP8266 first check-in. Showing preview telemetry.",
      uptime: "00:00:00",
      timestamp: now,
    };

    return NextResponse.json({
      success: true,
      isLiveDevice: false,
      isOnline: false,
      message: "No live ESP8266 ping received yet. Showing standby preview.",
      telemetry: demoData,
      history: [
        { t: 25.8, h: 54.0, l: 60.0, ts: now - 30000 },
        { t: 26.1, h: 53.0, l: 62.0, ts: now - 20000 },
        { t: 26.4, h: 52.0, l: 65.0, ts: now - 10000 },
      ],
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
    const data: TelemetryData = {
      temp: Number(body.temp) || 0,
      humidity: Number(body.humidity) || 0,
      light: Number(body.light) || 0,
      rawAdc: body.rawAdc !== undefined ? Number(body.rawAdc) : undefined,
      dhtValid: body.dhtValid !== undefined ? Boolean(body.dhtValid) : true,
      heatIndex: Number(body.heatIndex) || Number(body.temp) || 0,
      dewPoint: Number(body.dewPoint) || 0,
      rainProb: Number(body.rainProb) || 0,
      condition: String(body.condition || "Clear"),
      comfort: String(body.comfort || "Pleasantly Balanced"),
      advice: String(body.advice || "Sensors reading normally."),
      uptime: body.uptime ? String(body.uptime) : undefined,
      timestamp: now,
    };

    globalStore.latest = data;
    globalStore.lastSeen = now;

    // Append to rolling history (max 80 points)
    globalStore.history.push({
      t: data.temp,
      h: data.humidity,
      l: data.light,
      ts: now,
    });
    if (globalStore.history.length > 80) {
      globalStore.history.shift();
    }

    return NextResponse.json({
      success: true,
      timestamp: now,
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
