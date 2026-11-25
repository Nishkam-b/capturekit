import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

// next/font self-hosts the font at build time: no runtime requests to Google.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "CaptureKit — free screen recorder", template: "%s · CaptureKit" },
  description: "Free, open-source screen recorder that runs in your browser. Recordings never leave your device.",
};

/**
 * Privacy, enforced by the browser: the app may only load its own files and may
 * not send requests anywhere else (connect-src 'self'). Recordings are blob:/
 * mediastream: URLs. Inline scripts/styles are needed by the static export.
 * Production only: the dev server needs eval for hot reload.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob: mediastream:",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

// Explicit props (not Next's generated `LayoutProps`), so `tsc` works on a fresh checkout before any build.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>{process.env.NODE_ENV === "production" && <meta httpEquiv="Content-Security-Policy" content={CSP} />}</head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
