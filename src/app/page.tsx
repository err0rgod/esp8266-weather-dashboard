"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Sun, Moon, Cloud, CloudRain, CloudLightning, Droplets, 
  Thermometer, RefreshCw, ChevronDown, ChevronUp, Search, 
  Info, Clock
} from "lucide-react";

interface TelemetryData {
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

interface HistoryPoint {
  t: number;
  h: number;
  l: number;
  ts: number;
}

interface OpenMeteoData {
  temperature: number;
  humidity: number;
  feelsLike: number;
  precipitation: number;
  condition: string;
  code: number;
  location: string;
}

export default function WeatherDashboard() {
  const [unit, setUnit] = useState<"C" | "F">("C");
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [isLiveDevice, setIsLiveDevice] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeenSec, setLastSeenSec] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Live IST Clock
  const [istTimeStr, setIstTimeStr] = useState<string>("");
  const [istDateStr, setIstDateStr] = useState<string>("");

  // Regional weather comparison
  const [apiWeather, setApiWeather] = useState<OpenMeteoData | null>(null);
  const [searchCity, setSearchCity] = useState("New Delhi");
  const [apiLoading, setApiLoading] = useState(false);

  // Chart selection
  const [chartMetric, setChartMetric] = useState<"temp" | "hum" | "light">("temp");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formatTemp = (c: number | undefined | null) => {
    if (c === undefined || c === null || isNaN(c)) return "--";
    const val = unit === "C" ? c : (c * 9) / 5 + 32;
    return val.toFixed(1);
  };

  // Update live IST Time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      const timeFmt = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      const dateFmt = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
      });

      setIstTimeStr(timeFmt.format(now));
      setIstDateStr(dateFmt.format(now));
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Telemetry Fetcher
  const fetchTelemetry = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/telemetry", { cache: "no-store" });
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      if (data.success && data.telemetry) {
        setTelemetry(data.telemetry);
        setIsLiveDevice(data.isLiveDevice);
        setIsOnline(data.isOnline);
        setLastSeenSec(data.lastSeenSecondsAgo);
        if (data.history && Array.isArray(data.history)) {
          setHistory(data.history);
        }
      }
    } catch (err) {
      console.warn("Telemetry fetch error", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Open-Meteo Regional Weather Fetcher
  const fetchApiWeather = async (lat = 28.6139, lon = 77.2090, locName = "New Delhi") => {
    try {
      setApiLoading(true);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Weather API failed");
      const data = await res.json();
      const cur = data.current;

      let condName = "Clear";
      const code = cur.weather_code;
      if (code === 0) condName = "Clear Sky";
      else if (code <= 2) condName = "Partly Cloudy";
      else if (code === 3) condName = "Overcast";
      else if (code >= 51 && code <= 65) condName = "Rain";
      else if (code >= 80 && code <= 82) condName = "Rain Showers";
      else if (code >= 95) condName = "Thunderstorm";

      setApiWeather({
        temperature: cur.temperature_2m,
        humidity: cur.relative_humidity_2m,
        feelsLike: cur.apparent_temperature,
        precipitation: cur.precipitation,
        condition: condName,
        code: cur.weather_code,
        location: locName,
      });
    } catch (err) {
      console.warn("Open-Meteo failed", err);
    } finally {
      setApiLoading(false);
    }
  };

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCity.trim()) return;
    try {
      setApiLoading(true);
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchCity.trim())}&count=1&language=en&format=json`;
      const res = await fetch(geoUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const place = data.results[0];
          const name = `${place.name}${place.country_code ? `, ${place.country_code.toUpperCase()}` : ""}`;
          fetchApiWeather(place.latitude, place.longitude, name);
        }
      }
    } catch (err) {
      console.warn("Geocoding failed", err);
    } finally {
      setApiLoading(false);
    }
  };

  // Polling loop
  useEffect(() => {
    fetchTelemetry();
    fetchApiWeather();
    const interval = setInterval(fetchTelemetry, 6000);
    return () => clearInterval(interval);
  }, []);

  // Minimal Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    if (history.length < 2) {
      ctx.fillStyle = "#71717a";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Gathering live sensor history...", w / 2, h / 2);
      return;
    }

    const padLeft = 40;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 25;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const points = history.filter(p => p.t > 0 || p.h > 0 || p.l > 0);
    if (points.length < 2) return;

    let values: number[] = [];
    let color = "#38bdf8";
    let fillColor = "rgba(56, 189, 248, 0.06)";
    let unitLabel = "";

    if (chartMetric === "temp") {
      values = points.map(p => unit === "C" ? p.t : (p.t * 9) / 5 + 32);
      color = "#f97316";
      fillColor = "rgba(249, 115, 22, 0.06)";
      unitLabel = `°${unit}`;
    } else if (chartMetric === "hum") {
      values = points.map(p => p.h);
      color = "#0ea5e9";
      fillColor = "rgba(14, 165, 233, 0.06)";
      unitLabel = "%";
    } else {
      values = points.map(p => p.l);
      color = "#eab308";
      fillColor = "rgba(234, 179, 8, 0.06)";
      unitLabel = "%";
    }

    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (minVal === maxVal) {
      minVal -= 2;
      maxVal += 2;
    }
    const range = maxVal - minVal;

    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#71717a";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";

    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const val = minVal + (range * (steps - i)) / steps;
      const y = padTop + (plotH * i) / steps;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.fillText(`${val.toFixed(0)}${unitLabel}`, padLeft - 8, y + 3);
    }

    ctx.beginPath();
    points.forEach((_, idx) => {
      const x = padLeft + (idx / (points.length - 1)) * plotW;
      const y = padTop + plotH - ((values[idx] - minVal) / range) * plotH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    const lastX = padLeft + plotW;
    const lastY = padTop + plotH - ((values[values.length - 1] - minVal) / range) * plotH;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [history, chartMetric, unit]);

  const renderWeatherIcon = (condition = "", light = 50) => {
    const isDark = light < 15;
    const c = condition.toLowerCase();

    if (c.includes("thunder") || c.includes("lightning")) {
      return <CloudLightning className="w-9 h-9 text-amber-400 stroke-[1.5]" />;
    }
    if (c.includes("rain") || c.includes("drizzle")) {
      return <CloudRain className="w-9 h-9 text-sky-400 stroke-[1.5]" />;
    }
    if (c.includes("cloud") || c.includes("overcast")) {
      return <Cloud className="w-9 h-9 text-zinc-400 stroke-[1.5]" />;
    }
    if (isDark) {
      return <Moon className="w-9 h-9 text-zinc-300 stroke-[1.5]" />;
    }
    return <Sun className="w-9 h-9 text-amber-400 stroke-[1.5]" />;
  };

  const hasPhysicalSensor = telemetry?.dhtValid !== false;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-8 md:py-12">
      <div className="w-full max-w-3xl flex flex-col gap-6">

        {/* Minimal Header with Live IST Clock */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/60">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-zinc-100">Weather Station</h1>
              {isLiveDevice && isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Live ESP8266
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-900 text-zinc-400 border border-zinc-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  Standby
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {lastSeenSec !== null ? `Hardware pinged ${lastSeenSec}s ago` : "Waiting for telemetry"}
              {telemetry?.uptime && ` · Uptime ${telemetry.uptime}`}
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            {/* Live IST Time Badge */}
            {istTimeStr && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>{istTimeStr} <span className="text-zinc-500 font-sans text-[11px]">IST</span></span>
                <span className="text-zinc-600 hidden sm:inline">·</span>
                <span className="text-zinc-400 font-sans hidden sm:inline text-[11px]">{istDateStr}</span>
              </div>
            )}

            {/* C/F Switcher */}
            <div className="bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg flex text-xs">
              <button
                onClick={() => setUnit("C")}
                className={`px-2 py-1 rounded-md font-medium transition ${
                  unit === "C" ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                °C
              </button>
              <button
                onClick={() => setUnit("F")}
                className={`px-2 py-1 rounded-md font-medium transition ${
                  unit === "F" ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                °F
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchTelemetry}
              disabled={isRefreshing}
              title="Refresh telemetry"
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>

            {/* Info Drawer Toggle */}
            <button
              onClick={() => setShowSetup(!showSetup)}
              title="Architecture details"
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Primary Ambient Reading (Clean Apple-Weather Style) */}
        <section className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 md:p-8 flex flex-col gap-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/40 text-zinc-300">
                {renderWeatherIcon(telemetry?.condition, telemetry?.light)}
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-semibold text-zinc-100">
                  {telemetry?.condition || "Local Conditions"}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {hasPhysicalSensor ? "Real-time NodeMCU telemetry (Processed on Vercel)" : "Sensor calibrating..."}
                </p>
              </div>
            </div>

            {/* Main Temperature Display */}
            <div className="text-left md:text-right">
              <div className="text-5xl md:text-6xl font-light tracking-tight text-zinc-100">
                {hasPhysicalSensor ? formatTemp(telemetry?.temp) : "--"}
                <span className="text-2xl font-normal text-zinc-500 ml-1">°{unit}</span>
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                Feels like {hasPhysicalSensor ? formatTemp(telemetry?.heatIndex) : "--"}°{unit}
              </div>
            </div>
          </div>

          {/* Clean Human Weather Note */}
          <div className="pt-4 border-t border-zinc-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <p className="text-zinc-300 max-w-xl leading-relaxed">
              {telemetry?.advice || "Comfortable ambient indoor/outdoor climate conditions."}
            </p>
            {telemetry?.comfort && (
              <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 text-[11px] font-medium whitespace-nowrap self-start sm:self-auto">
                {telemetry.comfort}
              </span>
            )}
          </div>
        </section>

        {/* 4 Clean Core Metric Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Humidity */}
          <div className="bg-zinc-900/40 border border-zinc-800/70 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Humidity</span>
              <Droplets className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="my-2">
              <span className="text-2xl font-medium text-zinc-100">
                {hasPhysicalSensor ? telemetry?.humidity.toFixed(1) : "--"}
              </span>
              <span className="text-xs text-zinc-500 ml-1">%</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              Dew point: {hasPhysicalSensor ? formatTemp(telemetry?.dewPoint) : "--"}°
            </div>
          </div>

          {/* Ambient Light */}
          <div className="bg-zinc-900/40 border border-zinc-800/70 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Ambient Light</span>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="my-2">
              <span className="text-2xl font-medium text-zinc-100">
                {telemetry?.light !== undefined ? telemetry.light.toFixed(0) : "--"}
              </span>
              <span className="text-xs text-zinc-500 ml-1">%</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              {(telemetry?.light || 0) < 15 ? "Dark / Night" : (telemetry?.light || 0) > 60 ? "Bright Day" : "Dim / Ambient"}
            </div>
          </div>

          {/* Heat Index */}
          <div className="bg-zinc-900/40 border border-zinc-800/70 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Heat Index</span>
              <Thermometer className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div className="my-2">
              <span className="text-2xl font-medium text-zinc-100">
                {hasPhysicalSensor ? formatTemp(telemetry?.heatIndex) : "--"}
              </span>
              <span className="text-xs text-zinc-500 ml-1">°{unit}</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              Thermal impact index
            </div>
          </div>

          {/* Rain Probability */}
          <div className="bg-zinc-900/40 border border-zinc-800/70 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Rain Likelihood</span>
              <CloudRain className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="my-2">
              <span className="text-2xl font-medium text-zinc-100">
                {telemetry?.rainProb !== undefined ? telemetry.rainProb : "--"}
              </span>
              <span className="text-xs text-zinc-500 ml-1">%</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              Cloud-computed forecast
            </div>
          </div>
        </div>

        {/* Minimal Sensor Trend Line */}
        <section className="bg-zinc-900/40 border border-zinc-800/70 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Sensor Timeline
            </h3>
            <div className="bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg flex text-xs">
              <button
                onClick={() => setChartMetric("temp")}
                className={`px-2.5 py-1 rounded-md transition ${
                  chartMetric === "temp" ? "bg-zinc-800 text-orange-400 font-medium" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Temperature
              </button>
              <button
                onClick={() => setChartMetric("hum")}
                className={`px-2.5 py-1 rounded-md transition ${
                  chartMetric === "hum" ? "bg-zinc-800 text-sky-400 font-medium" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Humidity
              </button>
              <button
                onClick={() => setChartMetric("light")}
                className={`px-2.5 py-1 rounded-md transition ${
                  chartMetric === "light" ? "bg-zinc-800 text-amber-400 font-medium" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Light
              </button>
            </div>
          </div>

          <div className="relative w-full h-44">
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>
        </section>

        {/* Collapsible City Weather Comparison */}
        <section className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl overflow-hidden transition">
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="w-full p-4 flex justify-between items-center text-xs font-medium text-zinc-300 hover:text-zinc-100 transition"
          >
            <span>Compare with Regional Weather ({apiWeather?.location || "Open-Meteo"})</span>
            <div className="flex items-center gap-1.5 text-zinc-500">
              <span>{showComparison ? "Hide" : "Show"}</span>
              {showComparison ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {showComparison && (
            <div className="p-4 pt-0 border-t border-zinc-800/50 flex flex-col gap-4">
              <form onSubmit={handleCitySearch} className="flex gap-2 pt-3">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchCity}
                    onChange={(e) => setSearchCity(e.target.value)}
                    placeholder="Search city (e.g., Delhi, Mumbai, Bengaluru)..."
                    className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={apiLoading}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
                >
                  {apiLoading ? "..." : "Search"}
                </button>
              </form>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-lg p-3">
                  <div className="text-zinc-500 font-medium mb-1">Local NodeMCU Sensor</div>
                  <div className="text-base font-semibold text-zinc-100">
                    {hasPhysicalSensor ? formatTemp(telemetry?.temp) : "--"}°{unit}
                  </div>
                  <div className="text-zinc-400 mt-1">
                    Humidity: {hasPhysicalSensor ? telemetry?.humidity.toFixed(1) : "--"}%
                  </div>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-lg p-3">
                  <div className="text-zinc-500 font-medium mb-1">
                    {apiWeather?.location || "Regional Station"}
                  </div>
                  <div className="text-base font-semibold text-zinc-100">
                    {formatTemp(apiWeather?.temperature)}°{unit}
                  </div>
                  <div className="text-zinc-400 mt-1">
                    Humidity: {apiWeather?.humidity ?? "--"}% · {apiWeather?.condition}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Minimal Architecture Details */}
        {showSetup && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 text-xs">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-zinc-200">System Architecture</h4>
              <button onClick={() => setShowSetup(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              The ESP8266 runs in ultra-low power mode: its only job is reading DHT11 & LDR and transmitting raw telemetry to Vercel via HTTPS every 15 seconds. All thermal indexes, dew points, rain likelihood, and UI rendering are executed serverless on Vercel.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] text-zinc-400">
              <div>Hardware: <span className="text-zinc-200">NodeMCU ESP8266</span></div>
              <div>Sensors: <span className="text-zinc-200">DHT11 (D2), LDR (A0)</span></div>
              <div>Calculations: <span className="text-zinc-200">Vercel Serverless</span></div>
              <div>Timezone: <span className="text-zinc-200">Asia/Kolkata (IST)</span></div>
            </div>
          </div>
        )}

        {/* Minimal Footer */}
        <footer className="text-center text-[11px] text-zinc-600 py-2">
          ESP8266 IoT Weather Station · Hosted on Vercel
        </footer>

      </div>
    </main>
  );
}
