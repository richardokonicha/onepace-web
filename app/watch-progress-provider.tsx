"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readProgressMap,
  subscribeToProgress,
  type WatchProgress,
} from "@/lib/watch-progress";

const WatchProgressContext = createContext<Record<number, WatchProgress>>({});

/**
 * Shares the stored watch progress with the library.
 *
 * The progress lives in local storage, which the player writes while an
 * episode plays. The provider reads it once and keeps it in sync, so every
 * card sees the same state instead of reading the storage on its own.
 */
export function WatchProgressProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [progress, setProgress] = useState<Record<number, WatchProgress>>({});

  useEffect(() => {
    const update = () => setProgress(readProgressMap());
    update();
    return subscribeToProgress(update);
  }, []);

  const value = useMemo(() => progress, [progress]);

  return (
    <WatchProgressContext.Provider value={value}>
      {children}
    </WatchProgressContext.Provider>
  );
}

/**
 * The watch progress of every episode that has been started.
 */
export function useWatchProgressMap() {
  return useContext(WatchProgressContext);
}
