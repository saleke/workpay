import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Tenfo",
  title: {
    default: "Tenfo",
    template: "%s | Tenfo",
  },
  description: "Clear agreements for accountable professional work.",
  icons: {
    icon: [{ url: "/tenfo-mark.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/tenfo-mark.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Tenfo",
    title: "Tenfo",
    description: "Clear agreements for accountable professional work.",
  },
};

export const viewport: Viewport = {
  themeColor: "#174B35",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          "min-h-screen bg-[var(--wp-canvas)] text-[var(--wp-text-primary)] antialiased font-sans selection:bg-[var(--wp-accent-subtle)] selection:text-[var(--wp-text-primary)]",
          fontSans.variable,
          fontMono.variable,
        )}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
