"use client";

import { useCallback, useState } from "react";

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 100;

/**
 * Undo/redo state. `set(next)` records a step. For drags, use
 * `set(next, { transient: true })` while moving and `commit(before)` on release,
 * so a whole gesture is one undo step.
 */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] });

  const set = useCallback((update: T | ((prev: T) => T), opts?: { transient?: boolean }) => {
    setH((s) => {
      const next = typeof update === "function" ? (update as (p: T) => T)(s.present) : update;
      if (Object.is(next, s.present)) return s;
      if (opts?.transient) return { ...s, present: next };
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const commit = useCallback((before: T) => {
    setH((s) => (Object.is(before, s.present) ? s : { past: [...s.past, before].slice(-LIMIT), present: s.present, future: [] }));
  }, []);

  const undo = useCallback(() => {
    setH((s) => (s.past.length === 0 ? s : { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] }));
  }, []);

  const redo = useCallback(() => {
    setH((s) => (s.future.length === 0 ? s : { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) }));
  }, []);

  return { value: h.present, set, commit, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
