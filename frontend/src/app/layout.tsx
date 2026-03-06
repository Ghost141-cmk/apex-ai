import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APEX AI Trading Platform",
  description: "Institutional-grade AI trading",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
