import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESP8266 Weather Hub &bull; Cloud Dashboard",
  description: "Real-time IoT Weather Station powered by ESP8266, DHT11 & LDR hosted on Vercel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-sky-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
