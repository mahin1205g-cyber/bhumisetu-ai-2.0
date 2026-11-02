import assert from 'node:assert/strict';
import test from 'node:test';
import {
  choosePerformanceProfile,
  createAdaptivePerformanceMonitor,
  summarizeFrameIntervals,
} from '../frontend/src/utils/adaptivePerformance.js';

const capableDevice = { deviceMemory: 8, hardwareConcurrency: 12, saveData: false };
const steadyIntervals = (intervalMs, count = 90) => Array.from({ length: count }, () => intervalMs);

test('estimates observed rendering cadence without calling it display refresh rate', () => {
  for (const cadence of [75, 90, 120, 144, 165, 240, 360]) {
    const stats = summarizeFrameIntervals(steadyIntervals(1000 / cadence));
    assert.equal(Math.round(stats.estimatedRenderCadenceHz), cadence);
    assert.equal(stats.longFrameRatio, 0);
  }

  assert.equal(summarizeFrameIntervals(steadyIntervals(8.33)).medianFrameIntervalMs, 8.33);
});

test('does not classify a steady 60Hz or 30Hz cadence as poor performance', () => {
  for (const interval of [16.67, 33.33]) {
    const stats = summarizeFrameIntervals(steadyIntervals(interval));
    assert.equal(choosePerformanceProfile({ capabilities: capableDevice, frameStats: stats }).profile, 'balanced');
  }
});

test('selects high only when capable hardware and stable high observed cadence agree', () => {
  let highCadenceStats;
  for (const cadence of [75, 90, 120, 144, 165, 240]) {
    const stats = summarizeFrameIntervals(steadyIntervals(1000 / cadence));
    highCadenceStats = stats;
    assert.equal(choosePerformanceProfile({ capabilities: capableDevice, frameStats: stats }).profile, 'high');
  }
  assert.equal(choosePerformanceProfile({
    capabilities: { deviceMemory: 4, hardwareConcurrency: 4 },
    frameStats: highCadenceStats,
  }).profile, 'balanced');
});

test('selects power saver for data saver, low resource devices, and sustained long frames', () => {
  const stats = summarizeFrameIntervals(steadyIntervals(16.67));
  assert.equal(choosePerformanceProfile({ capabilities: { ...capableDevice, saveData: true }, frameStats: stats }).profile, 'power_saver');
  assert.equal(choosePerformanceProfile({ capabilities: { deviceMemory: 2, hardwareConcurrency: 8 }, frameStats: stats }).profile, 'power_saver');
  assert.equal(choosePerformanceProfile({ capabilities: capableDevice, frameStats: stats, slowSampleStreak: 2 }).profile, 'power_saver');
});

class FakeEventTarget {
  listeners = new Map();

  addEventListener(type, listener) {
    const group = this.listeners.get(type) || new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

test('pauses sampling while hidden and resumes when visible', () => {
  const documentObject = Object.assign(new FakeEventTarget(), { visibilityState: 'hidden' });
  const windowEvents = new FakeEventTarget();
  let nextId = 0;
  const animationFrames = new Map();
  const timers = new Map();
  const windowObject = Object.assign(windowEvents, {
    document: documentObject,
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) {
      nextId += 1;
      animationFrames.set(nextId, callback);
      return nextId;
    },
    cancelAnimationFrame(id) { animationFrames.delete(id); },
    setTimeout(callback) {
      nextId += 1;
      timers.set(nextId, callback);
      return nextId;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  const monitor = createAdaptivePerformanceMonitor({ windowObject, documentObject, sampleDurationMs: 10 });
  const unsubscribe = monitor.subscribe(() => {});

  assert.equal(monitor.getSnapshot().isVisible, false);
  assert.equal(animationFrames.size, 0);

  documentObject.visibilityState = 'visible';
  documentObject.dispatch('visibilitychange');
  const startTimer = [...timers.entries()][0];
  timers.delete(startTimer[0]);
  startTimer[1]();
  assert.equal(animationFrames.size, 1);

  documentObject.visibilityState = 'hidden';
  documentObject.dispatch('visibilitychange');
  assert.equal(animationFrames.size, 0);
  assert.equal(monitor.getSnapshot().isSampling, false);

  unsubscribe();
  monitor.dispose();
});
