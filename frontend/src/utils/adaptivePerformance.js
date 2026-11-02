const DEFAULT_SAMPLE_DURATION_MS = 1000;
const DEFAULT_RECHECK_INTERVAL_MS = 30000;

const DEFAULT_SNAPSHOT = Object.freeze({
  profile: 'balanced',
  reason: 'awaiting-render-sample',
  estimatedRenderCadenceHz: null,
  medianFrameIntervalMs: null,
  p95FrameIntervalMs: null,
  longFrameRatio: 0,
  sampleFrameCount: 0,
  isSampling: false,
  isVisible: true,
  reducedMotion: false,
});

const medianOf = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

export function summarizeFrameIntervals(intervals = []) {
  const samples = intervals.filter((value) => Number.isFinite(value) && value >= 1 && value <= 10000);
  if (!samples.length) {
    return {
      estimatedRenderCadenceHz: null,
      medianFrameIntervalMs: null,
      p95FrameIntervalMs: null,
      longFrameRatio: 0,
      sampleFrameCount: 0,
    };
  }

  // Use the central cadence to estimate how often this page was rendered. It is
  // not a measurement of the panel's physical refresh rate or maximum capability.
  const baselineSamples = samples.filter((value) => value <= 100);
  const medianFrameIntervalMs = medianOf(baselineSamples.length ? baselineSamples : samples);
  const sortedSamples = [...samples].sort((a, b) => a - b);
  const p95FrameIntervalMs = sortedSamples[Math.min(
    sortedSamples.length - 1,
    Math.ceil(sortedSamples.length * 0.95) - 1
  )];
  const longFrameThresholdMs = medianFrameIntervalMs * 1.75;
  const longFrameCount = samples.filter((value) => value > longFrameThresholdMs).length;

  return {
    estimatedRenderCadenceHz: Math.round((1000 / medianFrameIntervalMs) * 10) / 10,
    medianFrameIntervalMs: Math.round(medianFrameIntervalMs * 100) / 100,
    p95FrameIntervalMs: Math.round(p95FrameIntervalMs * 100) / 100,
    longFrameRatio: Math.round((longFrameCount / samples.length) * 1000) / 1000,
    sampleFrameCount: samples.length,
  };
}

export function choosePerformanceProfile({
  capabilities = {},
  frameStats = null,
  slowSampleStreak = 0,
} = {}) {
  const lowHardware =
    (Number.isFinite(capabilities.deviceMemory) && capabilities.deviceMemory <= 2) ||
    (Number.isFinite(capabilities.hardwareConcurrency) && capabilities.hardwareConcurrency <= 2);

  if (capabilities.saveData || lowHardware) {
    return {
      profile: 'power_saver',
      reason: capabilities.saveData ? 'data-saver-enabled' : 'limited-device-resources',
    };
  }

  if (slowSampleStreak >= 2) {
    return { profile: 'power_saver', reason: 'sustained-long-frames' };
  }

  const highHardware =
    Number.isFinite(capabilities.deviceMemory) && capabilities.deviceMemory >= 8 &&
    Number.isFinite(capabilities.hardwareConcurrency) && capabilities.hardwareConcurrency >= 8;
  const stableHighCadence = frameStats &&
    frameStats.sampleFrameCount >= 45 &&
    frameStats.estimatedRenderCadenceHz >= 75 &&
    frameStats.longFrameRatio <= 0.12;

  if (highHardware && stableHighCadence) {
    return { profile: 'high', reason: 'capable-device-and-stable-rendering' };
  }

  return { profile: 'balanced', reason: 'conservative-default' };
}

function readCapabilities(navigatorObject, reducedMotionQuery) {
  const connection = navigatorObject?.connection || navigatorObject?.mozConnection || navigatorObject?.webkitConnection;
  return {
    deviceMemory: Number.isFinite(navigatorObject?.deviceMemory) ? navigatorObject.deviceMemory : null,
    hardwareConcurrency: Number.isFinite(navigatorObject?.hardwareConcurrency) ? navigatorObject.hardwareConcurrency : null,
    saveData: connection?.saveData === true,
    reducedMotion: reducedMotionQuery?.matches === true,
  };
}

export function createAdaptivePerformanceMonitor(options = {}) {
  const windowObject = options.windowObject ?? (typeof window !== 'undefined' ? window : null);
  const documentObject = options.documentObject ?? windowObject?.document ?? (typeof document !== 'undefined' ? document : null);
  const navigatorObject = options.navigatorObject ?? windowObject?.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const sampleDurationMs = options.sampleDurationMs ?? DEFAULT_SAMPLE_DURATION_MS;
  const recheckIntervalMs = options.recheckIntervalMs ?? DEFAULT_RECHECK_INTERVAL_MS;

  let snapshot = DEFAULT_SNAPSHOT;
  let listeners = new Set();
  let started = false;
  let frameRequestId = null;
  let recheckTimerId = null;
  let frameIntervals = [];
  let sampleStartedAt = null;
  let previousFrameAt = null;
  let slowSampleStreak = 0;
  let mediaQuery = null;
  let connection = null;

  const getSnapshot = () => snapshot;
  const notify = () => listeners.forEach((listener) => listener());
  const setSnapshot = (nextValues) => {
    snapshot = Object.freeze({ ...snapshot, ...nextValues });
    notify();
  };

  const getProfileUpdate = (frameStats = snapshot) => {
    const capabilities = readCapabilities(navigatorObject, mediaQuery);
    const decision = choosePerformanceProfile({ capabilities, frameStats, slowSampleStreak });
    return { ...decision, reducedMotion: capabilities.reducedMotion };
  };

  const updateProfile = (frameStats = snapshot) => setSnapshot(getProfileUpdate(frameStats));

  const clearRecheckTimer = () => {
    if (recheckTimerId !== null) {
      windowObject?.clearTimeout(recheckTimerId);
      recheckTimerId = null;
    }
  };

  const stopSampling = () => {
    if (frameRequestId !== null) {
      windowObject?.cancelAnimationFrame?.(frameRequestId);
      frameRequestId = null;
    }
    frameIntervals = [];
    sampleStartedAt = null;
    previousFrameAt = null;
    if (snapshot.isSampling) setSnapshot({ isSampling: false });
  };

  const scheduleSample = (delay = 0) => {
    clearRecheckTimer();
    if (!started || documentObject?.visibilityState === 'hidden') return;
    recheckTimerId = windowObject?.setTimeout(() => {
      recheckTimerId = null;
      beginSample();
    }, delay) ?? null;
  };

  const finishSample = () => {
    frameRequestId = null;
    const frameStats = summarizeFrameIntervals(frameIntervals);
    const sustainedJank = frameStats.sampleFrameCount >= 24 &&
      frameStats.longFrameRatio >= 0.35 &&
      frameStats.medianFrameIntervalMs > 0 &&
      frameStats.p95FrameIntervalMs / frameStats.medianFrameIntervalMs >= 2.25;
    slowSampleStreak = sustainedJank ? slowSampleStreak + 1 : 0;
    setSnapshot({ ...getProfileUpdate(frameStats), ...frameStats, isSampling: false, isVisible: true });
    scheduleSample(recheckIntervalMs);
  };

  const collectFrame = (timestamp) => {
    frameRequestId = null;
    if (!started || documentObject?.visibilityState === 'hidden') return;

    if (sampleStartedAt === null) sampleStartedAt = timestamp;
    if (previousFrameAt !== null) frameIntervals.push(timestamp - previousFrameAt);
    previousFrameAt = timestamp;

    if (timestamp - sampleStartedAt >= sampleDurationMs) {
      finishSample();
      return;
    }
    frameRequestId = windowObject.requestAnimationFrame(collectFrame);
  };

  function beginSample() {
    if (!started || documentObject?.visibilityState === 'hidden' || !windowObject?.requestAnimationFrame) return;
    if (frameRequestId !== null || snapshot.isSampling) return;
    frameIntervals = [];
    sampleStartedAt = null;
    previousFrameAt = null;
    setSnapshot({ isSampling: true, isVisible: true });
    frameRequestId = windowObject.requestAnimationFrame(collectFrame);
  }

  const handleVisibilityChange = () => {
    if (documentObject?.visibilityState === 'hidden') {
      clearRecheckTimer();
      stopSampling();
      setSnapshot({ isVisible: false });
      return;
    }
    setSnapshot({ isVisible: true });
    scheduleSample(0);
  };

  const handlePageHide = () => {
    clearRecheckTimer();
    stopSampling();
    setSnapshot({ isVisible: false });
  };

  const handleCapabilityChange = () => {
    updateProfile();
    if (documentObject?.visibilityState !== 'hidden') scheduleSample(0);
  };

  const start = () => {
    if (started) return;
    started = true;
    mediaQuery = windowObject?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    connection = navigatorObject?.connection || navigatorObject?.mozConnection || navigatorObject?.webkitConnection || null;
    updateProfile();

    documentObject?.addEventListener?.('visibilitychange', handleVisibilityChange);
    windowObject?.addEventListener?.('pageshow', handleVisibilityChange);
    windowObject?.addEventListener?.('pagehide', handlePageHide);
    connection?.addEventListener?.('change', handleCapabilityChange);
    if (mediaQuery?.addEventListener) mediaQuery.addEventListener('change', handleCapabilityChange);
    else mediaQuery?.addListener?.(handleCapabilityChange);

    if (documentObject?.visibilityState === 'hidden') setSnapshot({ isVisible: false });
    else scheduleSample(0);
  };

  const stop = () => {
    if (!started) return;
    started = false;
    clearRecheckTimer();
    stopSampling();
    documentObject?.removeEventListener?.('visibilitychange', handleVisibilityChange);
    windowObject?.removeEventListener?.('pageshow', handleVisibilityChange);
    windowObject?.removeEventListener?.('pagehide', handlePageHide);
    connection?.removeEventListener?.('change', handleCapabilityChange);
    if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener('change', handleCapabilityChange);
    else mediaQuery?.removeListener?.(handleCapabilityChange);
    connection = null;
    mediaQuery = null;
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    if (listeners.size === 1) start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  };

  return {
    subscribe,
    getSnapshot,
    dispose() {
      stop();
      listeners = new Set();
    },
  };
}

export const adaptivePerformanceMonitor = createAdaptivePerformanceMonitor();
