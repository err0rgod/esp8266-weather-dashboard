# 🌤️ ESP8266 Weather Dashboard (Next.js 15 on Vercel)

The cloud frontend and serverless meteorological computation engine for the **ESP8266 IoT Weather Station**, developed at **Galgotias College of Engineering & Technology**.

---

## 🌐 Live Production Deployment
👉 **[https://esp8266-weather-dashboard.vercel.app](https://esp8266-weather-dashboard.vercel.app)**

---

## 🚀 Key Features

* **Real-Time Edge Telemetry**: Receives live JSON sensor data from NodeMCU ESP8266 (DHT11, LDR, FC-37 Rain Sensor).
* **Serverless Meteorological Engine**: Computes NOAA Heat Index, Magnus-Tetens Dew Point, Rain Probability, and human biometeorological comfort indices serverless on Vercel Edge.
* **Live IST Clock**: Displays active Indian Standard Time (`Asia/Kolkata`) updating every second.
* **Forecast Prediction Match Rate**: Real-time ground truth verification against Open-Meteo regional weather forecasts.
* **Unified 3-Metric Sensor Timeline**: Native HTML5 Canvas graph plotting Temperature, Humidity, and Ambient Light simultaneously with dual Y-axis scaling.
* **Apple-Weather Aesthetic**: Modern dark zinc palette (`#09090b`), generous whitespace, and uncluttered typography.

---

## 🛠️ Tech Stack

* **Framework**: Next.js 15 (App Router)
* **Language**: TypeScript
* **Styling**: Tailwind CSS
* **Icons**: Lucide React
* **Hosting**: Vercel Serverless & Edge CDN

---

## 💻 Local Development

```bash
# Clone the repository
git clone https://github.com/err0rgod/esp8266-weather-dashboard.git
cd esp8266-weather-dashboard

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Endpoints

* `GET /api/telemetry`: Retrieves latest device telemetry and 60-point rolling history.
* `POST /api/telemetry`: Ingests raw telemetry from ESP8266 with `x-api-key: weather123`.

---

## 📜 License
MIT License. Galgotias College of Engineering & Technology.
