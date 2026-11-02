import { useSyncExternalStore } from 'react';
import { adaptivePerformanceMonitor } from '../utils/adaptivePerformance';

export function useAdaptivePerformance() {
  return useSyncExternalStore(
    adaptivePerformanceMonitor.subscribe,
    adaptivePerformanceMonitor.getSnapshot,
    adaptivePerformanceMonitor.getSnapshot
  );
}

