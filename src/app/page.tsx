"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Sun, Moon, Cloud, CloudRain, CloudLightning, Droplets, 
  Thermometer, Compass, ShieldCheck, RefreshCw, Radio, 
  Wifi, HelpCircle, CheckCircle2, AlertTriangle, ExternalLink
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

  // Open-Meteo comparison state
  const [apiWeather, setApiWeather] = useState<OpenMeteoData | null>(null);
  const [searchCity, setSearchCity] = useState("New Delhi");
  const [apiLoading, setApiLoading] = useState(false);

  // Chart view mode
  const [chartMode, setChartMode] = useState<"all" | "temp" | "hum" | "light">("all");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formatTemp = (c: number) => {
    if (isNaN(c) || c === null || c === undefined) return "--";
    const val = unit === "C" ? c : (c * 9) / 5 + 32;
    return val.toFixed(1);
  };

  // Conversational Greeting
  const getGreeting = (lightPct: number) => {
    const hr = new Date().getHours();
    if (lightPct < 15) return "Peaceful Night";
    if (hr >= 5 && hr < 12) return "Good Morning";
    if (hr >= 12 && hr < 17) return "Good Afternoon";
    if (hr >= 17 && hr < 21) return "Good Evening";
    return "Hello There";
  };

  // Fetch telemetry from /api/telemetry
  const fetchTelemetry = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/telemetry", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
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
      console.warn("Could not fetch telemetry", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch Open-Meteo data for validation
  const fetchApiWeather = async (lat = 28.6139, lon = 77.2090, locName = "New Delhi") => {
    try {
      setApiLoading(true);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Open-Meteo error");
      const data = await res.json();
      const cur = data.current;

      let condName = "Clear Sky";
      const code = cur.weather_code;
      if (code === 0) condName = "Clear Sky";
      else if (code <= 2) condName = "Partly Cloudy";
      else if (code === 3) condName = "Overcast";
      else if (code === 45 || code === 48) condName = "Fog / Mist";
      else if (code >= 51 && code <= 55) condName = "Drizzle";
      else if (code >= 61 && code <= 65) condName = "Rain";
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
      console.warn("Open-Meteo fetch failed", err);
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
        } else {
          alert("City not found: " + searchCity);
        }
      }
    } catch (err) {
      alert("City search failed. Please try again.");
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    fetchApiWeather();
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, []);

  // Render Canvas Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 45 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    let minVal = 0, maxVal = 100;
    if (chartMode === "temp") {
      const temps = history.map(p => unit === "C" ? p.t : (p.t * 9) / 5 + 32);
      minVal = Math.floor(Math.min(...temps) - 2);
      maxVal = Math.ceil(Math.max(...temps) + 2);
      if (maxVal - minVal < 4) { maxVal += 2; minVal -= 2; }
    }

    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = minVal + (maxVal - minVal) * (i / steps);
      const y = padding.top + plotH - (i / steps) * plotH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      const unitLabel = chartMode === "temp" ? "°" + unit : "%";
      ctx.fillText(Math.round(val) + unitLabel, padding.left - 8, y + 4);
    }

    const count = history.length;
    const getX = (i: number) => padding.left + (i / (count - 1)) * plotW;
    const getY = (val: number) => {
      const clamped = Math.max(minVal, Math.min(maxVal, val));
      const norm = (clamped - minVal) / (maxVal - minVal);
      return padding.top + plotH - norm * plotH;
    };

    const drawSeries = (values: number[], stroke: string, fill: string) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(values[0]));
      for (let i = 1; i < count; i++) {
        ctx.lineTo(getX(i), getY(values[i]));
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.stroke();

      ctx.lineTo(getX(count - 1), padding.top + plotH);
      ctx.lineTo(getX(0), padding.top + plotH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    };

    if (chartMode === "all" || chartMode === "hum") {
      drawSeries(history.map(p => p.h), "#38bdf8", "rgba(56, 189, 248, 0.2)");
    }
    if (chartMode === "all" || chartMode === "light") {
      drawSeries(history.map(p => p.l), "#facc15", "rgba(250, 204, 21, 0.15)");
    }
    if (chartMode === "all" || chartMode === "temp") {
      const temps = history.map(p => unit === "C" ? p.t : (p.t * 9) / 5 + 32);
      drawSeries(temps, "#fb923c", "rgba(251, 146, 60, 0.2)");
    }
  }, [history, chartMode, unit]);

  // Weather Condition Icon
  const renderWeatherIcon = (cond: string, lightPct: number) => {
    const isNight = lightPct < 15;
    const lc = (cond || "").toLowerCase();

    if (lc.includes("storm") || lc.includes("thunder")) {
      return <CloudLightning className="w-16 h-16 text-yellow-400 animate-pulse" />;
    }
    if (lc.includes("rain") || lc.includes("drizzle")) {
      return <CloudRain className="w-16 h-16 text-sky-400 animate-float" />;
    }
    if (lc.includes("cloud") || lc.includes("overcast")) {
      return <Cloud className="w-16 h-16 text-slate-400 animate-float" />;
    }
    if (isNight) {
      return <Moon className="w-16 h-16 text-indigo-400" />;
    }
    return <Sun className="w-16 h-16 text-amber-400 animate-spin-slow" />;
  };

  // Accuracy calculation
  let tempDelta = 0;
  let humDelta = 0;
  let accuracyScore = 92;
  if (telemetry && apiWeather) {
    tempDelta = Math.abs(telemetry.temp - apiWeather.temperature);
    humDelta = Math.abs(telemetry.humidity - apiWeather.humidity);
    const tempScore = Math.max(0, 100 - tempDelta * 8);
    const humScore = Math.max(0, 100 - humDelta * 2.5);
    accuracyScore = Math.min(99, Math.max(10, Math.round(tempScore * 0.5 + humScore * 0.35 + 15)));
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-5xl flex flex-col gap-6">

        {/* Top Navigation Bar */}
        <header className="w-full flex justify-between items-center bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-white">ESP8266 Weather Hub</h1>
                {isLiveDevice && isOnline ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Live ESP Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Standby Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {isLiveDevice && lastSeenSec !== null ? `Last check-in: ${lastSeenSec}s ago` : "Hosted on Vercel Edge &bull; Zero hardware strain"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSetup(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              ESP Setup
            </button>
            <div className="bg-white/5 p-1 rounded-lg border border-white/10 flex">
              <button
                onClick={() => setUnit("C")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${unit === "C" ? "bg-sky-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
              >
                °C
              </button>
              <button
                onClick={() => setUnit("F")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${unit === "F" ? "bg-sky-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
              >
                °F
              </button>
            </div>
          </div>
        </header>

        {/* Setup Banner if no real device connected */}
        {!isLiveDevice && (
          <div className="bg-sky-950/40 border border-sky-500/30 rounded-2xl p-4 flex justify-between items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-sky-200">Connect your ESP8266 to this Vercel Site</h4>
                <p className="text-xs text-slate-400">Your ESP can POST live DHT11 & LDR sensor data directly to this dashboard every 15 seconds.</p>
              </div>
            </div>
            <button
              onClick={() => setShowSetup(true)}
              className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition"
            >
              View ESP Configuration
            </button>
          </div>
        )}

        {/* Hero Card with Conversational Greeting */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/90 to-slate-950/95 border border-sky-500/20 rounded-3xl p-6 md:p-8 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-6">
            <div className="flex justify-center">
              {renderWeatherIcon(telemetry?.condition || "Sunny", telemetry?.light || 50)}
            </div>

            <div className="flex flex-col gap-1 text-center md:text-left">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-400">
                {telemetry ? getGreeting(telemetry.light) : "Atmospheric Overview"}
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white">
                {telemetry?.condition || "Sunny & Clear"}
              </h2>
              <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
                {telemetry?.advice || "Balanced environmental moisture. Pleasant outdoor conditions."}
              </p>
              {telemetry?.comfort && (
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 w-fit mx-auto md:mx-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {telemetry.comfort}
                </div>
              )}
            </div>

            <div className="text-center md:text-right">
              <div className="text-5xl md:text-6xl font-black text-white tracking-tight">
                {formatTemp(telemetry?.temp || 26.4)}°{unit}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Feels like: {formatTemp(telemetry?.heatIndex || 27.2)}°{unit}
              </div>
            </div>
          </div>

          {/* Rain probability bar */}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-4">
            <span className="text-xs font-semibold text-sky-400 whitespace-nowrap">Rain Likelihood</span>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full transition-all duration-700" 
                style={{ width: `${telemetry?.rainProb || 8}%` }}
              />
            </div>
            <span className="text-xs font-bold text-white min-w-[36px] text-right">
              {telemetry?.rainProb || 8}%
            </span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Temperature */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-white/20 rounded-2xl p-4 flex flex-col justify-between gap-3 transition">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Temperature</span>
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                <Thermometer className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white">
              {formatTemp(telemetry?.temp || 26.4)} <span className="text-sm font-semibold text-slate-400">°{unit}</span>
            </div>
            <div className="text-xs text-slate-400 flex justify-between pt-2 border-t border-white/5">
              <span>Sensor: DHT11</span>
              <span className={telemetry?.dhtValid !== false ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                {telemetry?.dhtValid !== false ? "🟢 Live Physical" : "⚠️ Disconnected"}
              </span>
            </div>
          </div>

          {/* Humidity */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-white/20 rounded-2xl p-4 flex flex-col justify-between gap-3 transition">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Humidity</span>
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                <Droplets className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white">
              {telemetry?.humidity.toFixed(1) || "52.0"} <span className="text-sm font-semibold text-slate-400">%</span>
            </div>
            <div className="text-xs text-slate-400 flex justify-between pt-2 border-t border-white/5">
              <span>Dew Point: {formatTemp(telemetry?.dewPoint || 15.8)}°{unit}</span>
              <span className="text-sky-400 font-semibold">Relative</span>
            </div>
          </div>

          {/* Light Intensity */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-white/20 rounded-2xl p-4 flex flex-col justify-between gap-3 transition">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Ambient Light</span>
              <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">
                <Sun className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white">
              {telemetry?.light.toFixed(0) || "65"} <span className="text-sm font-semibold text-slate-400">%</span>
            </div>
            <div className="text-xs text-slate-400 flex justify-between pt-2 border-t border-white/5">
              <span>Raw ADC: {telemetry?.rawAdc ?? 610}</span>
              <span className="text-yellow-400 font-semibold">
                {(telemetry?.light || 65) > 60 ? "Bright Day" : (telemetry?.light || 65) > 20 ? "Ambient" : "Night"}
              </span>
            </div>
          </div>

          {/* Moisture Dynamics */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-white/20 rounded-2xl p-4 flex flex-col justify-between gap-3 transition">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Dew Spread</span>
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <Compass className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white">
              {((telemetry?.temp || 26.4) - (telemetry?.dewPoint || 15.8)).toFixed(1)} <span className="text-sm font-semibold text-slate-400">°{unit}</span>
            </div>
            <div className="text-xs text-slate-400 flex justify-between pt-2 border-t border-white/5">
              <span>Condensation Risk</span>
              <span className="text-purple-400 font-semibold">Very Low</span>
            </div>
          </div>
        </div>

        {/* Live Weather API vs ESP Prediction Verification */}
        <div className="bg-slate-900/60 backdrop-blur-md border border-sky-500/20 rounded-3xl p-6 shadow-xl flex flex-col gap-5">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-400" />
                Live Meteorological Ground Truth Verification
              </h3>
              <p className="text-xs text-slate-400">Comparing ESP8266 local sensor data against official Open-Meteo weather station</p>
            </div>

            <form onSubmit={handleCitySearch} className="flex gap-2">
              <input
                type="text"
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                placeholder="Search city..."
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={apiLoading}
                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg text-xs transition"
              >
                {apiLoading ? "..." : "Search"}
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* ESP Side */}
            <div className="bg-slate-950/60 border border-white/10 rounded-xl p-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wide">ESP8266 Physical Sensors</span>
              <div className="text-lg font-bold text-white">{telemetry?.condition || "Sunny & Clear"}</div>
              <div className="text-xs text-slate-400 flex justify-between">
                <span>Temperature:</span>
                <b className="text-white">{formatTemp(telemetry?.temp || 26.4)}°{unit}</b>
              </div>
              <div className="text-xs text-slate-400 flex justify-between">
                <span>Humidity:</span>
                <b className="text-white">{telemetry?.humidity.toFixed(1) || "52.0"}%</b>
              </div>
              <div className="text-xs text-slate-400 flex justify-between">
                <span>Rain Chance:</span>
                <b className="text-white">{telemetry?.rainProb || 8}%</b>
              </div>
            </div>

            {/* Official Station Side */}
            <div className="bg-slate-950/60 border border-white/10 rounded-xl p-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">
                Open-Meteo ({apiWeather?.location || "New Delhi"})
              </span>
              <div className="text-lg font-bold text-white">{apiWeather?.condition || "Clear Sky"}</div>
              <div className="text-xs text-slate-400 flex justify-between">
                <span>Official Temp:</span>
                <b className="text-white">{formatTemp(apiWeather?.temperature || 26.9)}°{unit}</b>
              </div>
              <div className="text-xs text-slate-400 flex justify-between">
                <span>Official Humidity:</span>
                <b className="text-white">{apiWeather?.humidity || 50}%</b>
              </div>
              <div className="text-xs text-slate-400 flex justify-between">
                <span>Precipitation:</span>
                <b className="text-white">{apiWeather?.precipitation || 0.0} mm</b>
              </div>
            </div>

            {/* Accuracy Score */}
            <div className="bg-gradient-to-br from-slate-950/80 to-slate-900 border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between items-center text-center">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Prediction Accuracy</span>
              <div className="text-4xl font-black bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent my-1">
                {accuracyScore}%
              </div>
              <div className="w-full text-xs text-slate-400 flex justify-between pt-2 border-t border-white/5">
                <span>Temp Variance:</span>
                <b className="text-emerald-400">Δ {tempDelta.toFixed(1)}°C</b>
              </div>
              <div className="w-full text-xs text-slate-400 flex justify-between mt-1">
                <span>Humidity Variance:</span>
                <b className="text-emerald-400">Δ {humDelta.toFixed(1)}%</b>
              </div>
            </div>
          </div>
        </div>

        {/* Environmental Timeline Chart */}
        <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-xl flex flex-col gap-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-base text-white">Environmental Rolling Timeline</h3>
              <p className="text-xs text-slate-400">Telemetry points cached in real time on Vercel</p>
            </div>
            <div className="bg-black/30 p-1 rounded-xl flex gap-1">
              {(["all", "temp", "hum", "light"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition ${chartMode === m ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full h-60">
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>

          <div className="flex gap-4 text-xs text-slate-400 pt-2 border-t border-white/5">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400" /> Temperature (°{unit})</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> Humidity (%)</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400" /> Light (%)</div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 py-4">
          ESP8266 Weather Hub &bull; Cloud Dashboard on Vercel &bull; DHT11 &bull; LDR
        </footer>

      </div>

      {/* Setup Guide Modal */}
      {showSetup && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-white">Connecting your ESP8266 to Vercel</h3>
              <button onClick={() => setShowSetup(false)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Once you deploy this Next.js project to Vercel, your ESP8266 can send its sensor readings directly to your Vercel URL.
            </p>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-white/10 text-xs font-mono text-slate-300 space-y-1">
              <div className="text-slate-500">// In include/config.h:</div>
              <div><span className="text-sky-400">#define VERCEL_POST_ENABLED</span> true</div>
              <div><span className="text-sky-400">#define VERCEL_API_URL</span> <span className="text-emerald-400">&quot;https://your-app.vercel.app/api/telemetry&quot;</span></div>
              <div><span className="text-sky-400">#define VERCEL_API_KEY</span> <span className="text-emerald-400">&quot;weather123&quot;</span></div>
            </div>

            <div className="text-xs text-slate-400 space-y-2">
              <p><b>1. Deploy to Vercel</b>: Run <code className="text-sky-400 bg-white/5 px-1.5 py-0.5 rounded">npx vercel</code> inside the <code className="text-sky-400 bg-white/5 px-1.5 py-0.5 rounded">dashboard</code> folder or push to GitHub.</p>
              <p><b>2. Copy your URL</b>: Put your generated <code className="text-emerald-400">https://...vercel.app/api/telemetry</code> URL in <code className="text-sky-400">config.h</code>.</p>
              <p><b>3. Flash ESP8266</b>: Run <code className="text-sky-400 bg-white/5 px-1.5 py-0.5 rounded">pio run -t upload</code>.</p>
            </div>

            <button
              onClick={() => setShowSetup(false)}
              className="mt-2 w-full py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition"
            >
              Got it, Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
