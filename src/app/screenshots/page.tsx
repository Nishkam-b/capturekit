import type { Metadata } from "next";
import { ScreenshotLibrary } from "@/components/screenshots/library";

export const metadata: Metadata = { title: "Screenshots" };

export default function ScreenshotsPage() {
  return <ScreenshotLibrary />;
}
