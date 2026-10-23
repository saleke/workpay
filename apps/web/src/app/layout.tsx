import type { Metadata } from "next";
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
  title: "WorkPay",
  description: "Money follows proof. Bounded economic execution.",
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
