import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const fontChrome = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-chrome",
});

const fontVoice = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-voice",
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
          "min-h-screen bg-[var(--room)] text-[var(--room-text)] antialiased font-[family-name:var(--font-chrome)]",
          fontChrome.variable,
          fontVoice.variable,
        )}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
