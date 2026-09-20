"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Sun, Moon, Cloud, CloudRain, CloudLightning, Droplets, 
  Thermometer, RefreshCw, Search, Info, Clock, CheckCircle2,
  TrendingUp, ShieldCheck
} from "lucide-react";

interface TelemetryData {
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

  // Live IST Clock
  const [istTimeStr, setIstTimeStr] = useState<string>("");
  const [istDateStr, setIstDateStr] = useState<string>("");

  // Regional weather comparison
  const [apiWeather, setApiWeather] = useState<OpenMeteoData | null>(null);
  const [searchCity, setSearchCity] = useState("New Delhi");
  const [apiLoading, setApiLoading] = useState(false);

  // Chart selection (Default to "all" to show all 3 sensors on graph)
  const [chartMetric, setChartMetric] = useState<"all" | "temp" | "hum" | "light">("all");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formatTemp = (c: number | undefined | null) => {
    if (c === undefined || c === null || isNaN(c)) return "--";
    const val = unit === "C" ? c : (c * 9) / 5 + 32;
    return val.toFixed(1);
  };

  // Live IST Clock Updater (Asia/Kolkata)
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

  // Regional Weather Comparison Fetcher
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

  // Multi-Metric Canvas Rendering (Supports "all" or individual)
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

    const padLeft = 38;
    const padRight = chartMetric === "all" ? 38 : 20;
    const padTop = 18;
    const padBottom = 22;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const points = history.filter(p => p.t > 0 || p.h > 0 || p.l > 0);
    if (points.length < 2) return;

    const drawSeries = (
      vals: number[], 
      min: number, 
      rng: number, 
      strokeColor: string, 
      fillColor: string
    ) => {
      ctx.beginPath();
      points.forEach((_, idx) => {
        const x = padLeft + (idx / (points.length - 1)) * plotW;
        const y = padTop + plotH - ((vals[idx] - min) / rng) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();

      ctx.lineTo(padLeft + plotW, padTop + plotH);
      ctx.lineTo(padLeft, padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      const lastX = padLeft + plotW;
      const lastY = padTop + plotH - ((vals[vals.length - 1] - min) / rng) * plotH;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
    };

    if (chartMetric === "all") {
      // 1. Temperature range
      const temps = points.map(p => unit === "C" ? p.t : (p.t * 9) / 5 + 32);
      let minTemp = Math.min(...temps);
      let maxTemp = Math.max(...temps);
      if (minTemp === maxTemp) { minTemp -= 2; maxTemp += 2; }
      const tempRange = maxTemp - minTemp;

      // 2. Percentage range (for Humidity & Light)
      const hums = points.map(p => p.h);
      const lights = points.map(p => p.l);
      let minPct = Math.min(...hums, ...lights);
      let maxPct = Math.max(...hums, ...lights);
      minPct = Math.max(0, Math.floor(minPct / 10) * 10);
      maxPct = Math.min(100, Math.ceil(maxPct / 10) * 10);
      if (minPct === maxPct) { minPct = 0; maxPct = 100; }
      const pctRange = maxPct - minPct;

      // Subtle horizontal gridlines & dual Y-axis labels
      ctx.strokeStyle = "#27272a";
      ctx.lineWidth = 1;
      ctx.font = "10px sans-serif";

      const steps = 3;
      for (let i = 0; i <= steps; i++) {
        const y = padTop + (plotH * i) / steps;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();

        // Left Y-axis (Temp)
        const tVal = minTemp + (tempRange * (steps - i)) / steps;
        ctx.textAlign = "right";
        ctx.fillStyle = "#f97316";
        ctx.fillText(`${tVal.toFixed(0)}°`, padLeft - 6, y + 3);

        // Right Y-axis (%)
        const pVal = minPct + (pctRange * (steps - i)) / steps;
        ctx.textAlign = "left";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(`${pVal.toFixed(0)}%`, w - padRight + 6, y + 3);
      }

      // Draw all 3 series simultaneously
      drawSeries(lights, minPct, pctRange, "#eab308", "rgba(234, 179, 8, 0.04)");
      drawSeries(hums, minPct, pctRange, "#0ea5e9", "rgba(14, 165, 233, 0.05)");
      drawSeries(temps, minTemp, tempRange, "#f97316", "rgba(249, 115, 22, 0.05)");
    } else {
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
      if (minVal === maxVal) { minVal -= 2; maxVal += 2; }
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

      drawSeries(values, minVal, range, color, fillColor);
    }
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

  // Prediction Rate & Ground Truth Match Calculation
  const localTemp = telemetry?.temp ?? 0;
  const localHum = telemetry?.humidity ?? 0;
  const refTemp = apiWeather?.temperature ?? 0;
  const refHum = apiWeather?.humidity ?? 0;

  const tempDiff = Math.abs(localTemp - refTemp);
  const humDiff = Math.abs(localHum - refHum);

  // Prediction Match Score (0 - 100%)
  const tempAccuracy = Math.max(0, 100 - tempDiff * 5.5);
  const humAccuracy = Math.max(0, 100 - humDiff * 1.8);
  const predictionMatchRate = Math.min(99, Math.max(25, Math.round(tempAccuracy * 0.55 + humAccuracy * 0.45)));

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-8 md:py-12">
      <div className="w-full max-w-3xl flex flex-col gap-6">

        {/* Header with Live IST Clock */}
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

            {/* Architecture Details Toggle */}
            <button
              onClick={() => setShowSetup(!showSetup)}
              title="Architecture details"
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* GitHub Profile */}
            <a
              href="https://github.com/err0rgod"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub: @err0rgod"
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition flex items-center justify-center"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
            </a>
          </div>
        </header>

        {/* Primary Ambient Reading */}
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
                  {hasPhysicalSensor ? "Real-time NodeMCU physical telemetry" : "Sensor calibrating..."}
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

          {/* Rain Sensor & Likelihood */}
          <div className="bg-zinc-900/40 border border-zinc-800/70 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Rain Status</span>
              <CloudRain className={`w-3.5 h-3.5 ${telemetry?.rainDetected ? "text-sky-400 animate-pulse" : "text-zinc-500"}`} />
            </div>
            <div className="my-2">
              {telemetry?.rainDetected ? (
                <span className="text-xl font-semibold text-sky-400">
                  Raining
                </span>
              ) : (
                <>
                  <span className="text-2xl font-medium text-zinc-100">
                    {telemetry?.rainProb !== undefined ? telemetry.rainProb : "--"}
                  </span>
                  <span className="text-xs text-zinc-500 ml-1">% chance</span>
                </>
              )}
            </div>
            <div className="text-[11px] text-zinc-400">
              {telemetry?.rainDetected ? "🌧️ Active water detected" : "FC-37 sensor: Dry"}
            </div>
          </div>
        </div>

        {/* Prediction Rate vs Real Weather Forecast Card */}
        <section className="bg-zinc-900/40 border border-zinc-800/70 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Forecast Prediction Match
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Comparing local ESP8266 telemetry with official regional weather ({apiWeather?.location || "New Delhi"})
              </p>
            </div>

            {/* City Search Bar */}
            <form onSubmit={handleCitySearch} className="flex gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  placeholder="Change city..."
                  className="pl-7 pr-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 w-36 sm:w-44"
                />
              </div>
              <button
                type="submit"
                disabled={apiLoading}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
              >
                {apiLoading ? "..." : "Set"}
              </button>
            </form>
          </div>

          {/* Prediction Rate & Metric Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] items-center gap-4 pt-1">
            {/* Accuracy Match Badge */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
              <div className="flex flex-col">
                <span className="text-[11px] text-zinc-400 uppercase tracking-wide">Match Rate</span>
                <span className="text-3xl font-bold text-emerald-400 tracking-tight">
                  {hasPhysicalSensor ? `${predictionMatchRate}%` : "--"}
                </span>
                <span className="text-[10px] text-zinc-500 mt-0.5">High sensor correlation</span>
              </div>
              <div className="h-10 w-[1px] bg-zinc-800 mx-1" />
              <div className="text-xs space-y-1 text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Temp &Delta;: <b className="text-zinc-200">{tempDiff.toFixed(1)}°C</b></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Humidity &Delta;: <b className="text-zinc-200">{humDiff.toFixed(1)}%</b></span>
                </div>
              </div>
            </div>

            {/* Side-by-Side Comparison Box */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-3">
                <div className="text-zinc-500 text-[11px] font-medium mb-1">Local ESP8266 Sensor</div>
                <div className="text-base font-semibold text-zinc-100">
                  {hasPhysicalSensor ? formatTemp(telemetry?.temp) : "--"}°{unit}
                </div>
                <div className="text-zinc-400 text-[11px] mt-0.5">
                  {hasPhysicalSensor ? `${telemetry?.humidity.toFixed(1)}% hum` : "--"} · {telemetry?.condition}
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-3">
                <div className="text-zinc-500 text-[11px] font-medium mb-1 truncate">
                  Forecast ({apiWeather?.location || "Regional"})
                </div>
                <div className="text-base font-semibold text-zinc-100">
                  {formatTemp(apiWeather?.temperature)}°{unit}
                </div>
                <div className="text-zinc-400 text-[11px] mt-0.5 truncate">
                  {apiWeather?.humidity ?? "--"}% hum · {apiWeather?.condition}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Sensor Timeline Chart (Shows All 3 Sensors or Individual) */}
        <section className="bg-zinc-900/40 border border-zinc-800/70 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Sensor Timeline Graph
              </h3>
              <p className="text-[11px] text-zinc-500">
                {chartMetric === "all" 
                  ? "Plotting Temperature (°C), Humidity (%), and Ambient Light (%) together"
                  : `Plotting ${chartMetric.toUpperCase()} trend`}
              </p>
            </div>

            {/* Chart Metric Selector */}
            <div className="bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg flex text-xs self-start sm:self-auto">
              <button
                onClick={() => setChartMetric("all")}
                className={`px-2.5 py-1 rounded-md transition font-medium ${
                  chartMetric === "all" ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All 3 Metrics
              </button>
              <button
                onClick={() => setChartMetric("temp")}
                className={`px-2.5 py-1 rounded-md transition ${
                  chartMetric === "temp" ? "bg-zinc-800 text-orange-400 font-medium" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Temp
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

          {/* Canvas Chart Area */}
          <div className="relative w-full h-48">
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>

          {/* Chart Legend */}
          <div className="flex items-center gap-4 text-xs text-zinc-400 pt-1 border-t border-zinc-800/40">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>Temperature (°{unit})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              <span>Humidity (%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Light (%)</span>
            </div>
          </div>
        </section>

        {/* Minimal Architecture Details */}
        {showSetup && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 text-xs">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-zinc-200">System Architecture</h4>
              <button onClick={() => setShowSetup(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              The ESP8266 runs in ultra-low power mode: its only job is reading DHT11, LDR, and Rain Sensor pins and transmitting raw telemetry via HTTPS every 15 seconds. All thermal indexes, dew points, rain likelihood, and UI rendering are executed serverless.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] text-zinc-400">
              <div>Hardware: <span className="text-zinc-200">NodeMCU ESP8266</span></div>
              <div>OLED: <span className="text-zinc-200">{telemetry?.oledActive ? "Active (SSD1306)" : "Auto-Ready"}</span></div>
              <div>Rain Sensor: <span className="text-zinc-200">FC-37 (D6)</span></div>
              <div>Timezone: <span className="text-zinc-200">Asia/Kolkata (IST)</span></div>
            </div>
          </div>
        )}

        {/* Minimal Footer */}
        <footer className="text-center text-xs text-zinc-500 py-3 flex items-center justify-center gap-1.5 flex-wrap">
          <span>ESP8266 IoT Weather Station · Built by</span>
          <a
            href="https://github.com/err0rgod"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-zinc-300 hover:text-white font-medium underline underline-offset-4 decoration-zinc-700 hover:decoration-zinc-400 transition"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            @err0rgod
          </a>
        </footer>

      </div>
    </main>
  );
}
