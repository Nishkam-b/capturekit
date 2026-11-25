"use client";

import { useSyncExternalStore } from "react";
import { detectCapabilities, type RecorderCapabilities } from "@/engines/recorder/capabilities";

let cached: RecorderCapabilities | null = null;
const subscribe = () => () => undefined;
const getSnapshot = () => (cached ??= detectCapabilities());
const getServerSnapshot = () => null;

/** Browser capabilities; `null` during server render / before hydration. */
export function useCapabilities(): RecorderCapabilities | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
