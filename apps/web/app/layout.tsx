import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Geist, IBM_Plex_Mono } from "next/font/google";
import Disclaimer from "@/components/disclaimer";
import "./globals.css";
import "./theatre.css";
import "./theatre-system.css";

const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

/**
 * The display face: an angular technical sans with cut corners. It reads as
 * instrumentation rather than editorial, which is what the HUD needs, and it
 * carries the uppercase tracked labels without turning into a novelty.
 */
const display = Chakra_Petch({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  preload: false,
});

/**
 * The data face. Plex Mono is a working instrument's typeface: legible at
 * small sizes, tabular, and square enough to sit in a readout without shouting.
 */
const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Manava — Drug Journey Simulator",
  description:
    "See how a drug moves through the body over time — simulated with standard pharmacokinetic models, not advice.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3e7ce" },
    { media: "(prefers-color-scheme: dark)", color: "#f3e7ce" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Disclaimer />
      </body>
    </html>
  );
}
