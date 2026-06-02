import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import ThemeScript from "@/components/theme/ThemeScript";
import Providers from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Admeasy Teacher",
  description: "Standalone Admeasy ERP teacher portal",
  appleWebApp: { capable: true, title: "Admeasy Teacher" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon-32x32.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

import MobileViewport from "@/components/MobileViewport";
import CapacitorApp from "@/components/CapacitorApp";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="bg-background text-foreground overflow-x-hidden">
        <MobileViewport />
        <CapacitorApp />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
