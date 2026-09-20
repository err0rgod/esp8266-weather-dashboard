import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESP8266 Weather Station · by @err0rgod",
  description: "Real-time IoT Weather Station powered by ESP8266, DHT11, LDR & Rain Sensor · Developed by @err0rgod",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-zinc-700 selection:text-white">
        {children}
      </body>
    </html>
  );
}
