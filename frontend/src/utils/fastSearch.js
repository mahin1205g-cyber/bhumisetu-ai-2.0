/**
 * Binary Search and LRU cache helpers for sorted in-memory records.
 *
 * Binary search is O(log N) over the supplied sorted array; cache lookup is O(1).
 */

/**
 * Ultra-Fast High-Concurrency LRU Memory Cache
 * Prevents redundant computations under massive traffic loads.
 */
class FastLRUCache {
  constructor(capacity = 2000) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const val = this.cache.get(key);
    // Refresh position to mark as recently used
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Evict oldest item (first item in Map)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

// Global query cache for repeated search inputs
export const queryCache = new FastLRUCache(2000);

/**
 * In-Flight Request Deduplicator
 * Merges concurrent identical search requests to prevent network and thread flooding.
 */
const inFlightRequests = new Map();

export async function deduplicateRequest(key, fetcher) {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  const promise = fetcher().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Standard Binary Search for exact matches on a sorted array.
 * @param {Array} sortedArr - Array sorted by keyFn
 * @param {string|number} target - The value to search for
 * @param {Function} keyFn - Accessor function returning comparable value
 * @returns {{ item: any|null, index: number, comparisons: number, timeMs: number }}
 */
export function binarySearch(sortedArr, target, keyFn = (x) => x) {
  const startTime = performance.now();
  if (!sortedArr || sortedArr.length === 0) {
    return { item: null, index: -1, comparisons: 0, timeMs: 0 };
  }

  let comparisons = 0;
  let low = 0;
  let high = sortedArr.length - 1;
  const targetStr = String(target || '').toLowerCase().trim();

  // O(1) Cache Check
  const cacheKey = `bs_exact_${targetStr}`;
  const cached = queryCache.get(cacheKey);
  if (cached) {
    return { ...cached, timeMs: Number((performance.now() - startTime).toFixed(3)) };
  }

  while (low <= high) {
    comparisons++;
    const mid = (low + high) >> 1; // Bitwise fast integer division
    const midVal = String(keyFn(sortedArr[mid]) || '').toLowerCase().trim();

    if (midVal === targetStr) {
      const timeMs = Number((performance.now() - startTime).toFixed(3));
      const result = { item: sortedArr[mid], index: mid, comparisons, timeMs };
      queryCache.set(cacheKey, result);
      return result;
    } else if (midVal < targetStr) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const timeMs = Number((performance.now() - startTime).toFixed(3));
  return { item: null, index: -1, comparisons, timeMs };
}

/**
 * Prefix Binary Search: Finds all elements whose key starts with prefix in O(log N + K) time.
 * @param {Array} sortedArr - Array sorted by keyFn
 * @param {string} prefix - The prefix string
 * @param {Function} keyFn - Accessor function
 * @returns {{ results: Array, comparisons: number, timeMs: number }}
 */
export function binarySearchPrefix(sortedArr, prefix, keyFn = (x) => x) {
  const startTime = performance.now();
  if (!sortedArr || sortedArr.length === 0 || !prefix) {
    return { results: sortedArr || [], comparisons: 0, timeMs: 0 };
  }

  const p = String(prefix).toLowerCase().trim();
  const cacheKey = `bs_prefix_${p}`;
  const cached = queryCache.get(cacheKey);
  if (cached) {
    return { ...cached, timeMs: Number((performance.now() - startTime).toFixed(3)) };
  }

  let comparisons = 0;

  // 1. Find lower bound using binary search (O(log N))
  let low = 0;
  let high = sortedArr.length - 1;
  let firstIdx = -1;

  while (low <= high) {
    comparisons++;
    const mid = (low + high) >> 1;
    const midVal = String(keyFn(sortedArr[mid]) || '').toLowerCase().trim();

    if (midVal.startsWith(p)) {
      firstIdx = mid;
      high = mid - 1; // keep searching left for earliest occurrence
    } else if (midVal < p) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (firstIdx === -1) {
    const timeMs = Number((performance.now() - startTime).toFixed(3));
    const result = { results: [], comparisons, timeMs };
    queryCache.set(cacheKey, result);
    return result;
  }

  // 2. Collect consecutive matching prefix elements (max 50 to prevent DOM thrashing)
  const results = [];
  for (let i = firstIdx; i < sortedArr.length && results.length < 50; i++) {
    comparisons++;
    const val = String(keyFn(sortedArr[i]) || '').toLowerCase().trim();
    if (val.startsWith(p)) {
      results.push(sortedArr[i]);
    } else {
      break;
    }
  }

  const timeMs = Number((performance.now() - startTime).toFixed(3));
  const result = { results, comparisons, timeMs };
  queryCache.set(cacheKey, result);
  return result;
}

/**
 * Multi-field fast indexer for in-memory records.
 * Creates sorted indices across multiple fields for instantaneous O(log N) queries.
 */
export class FastRecordIndex {
  constructor(records = [], fields = ['plot_id', 'deed_no', 'khatian_no', 'mouza']) {
    this.raw = records;
    this.fields = fields;
    this.indices = {};
    this.buildIndices();
  }

  buildIndices() {
    this.fields.forEach((field) => {
      this.indices[field] = [...this.raw].sort((a, b) => {
        const valA = String(a[field] || '').toLowerCase();
        const valB = String(b[field] || '').toLowerCase();
        return valA.localeCompare(valB, undefined, { numeric: true });
      });
    });
  }

  updateRecords(newRecords) {
    this.raw = newRecords;
    queryCache.clear();
    this.buildIndices();
  }

  search(query, preferredField = null) {
    if (!query || !query.trim()) {
      return { results: this.raw, timeMs: 0, comparisons: 0, algorithm: 'All Records' };
    }

    const q = query.trim().toLowerCase();
    const cacheKey = `idx_search_${q}_${preferredField || 'all'}`;
    const cached = queryCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const startTime = performance.now();
    let totalComparisons = 0;
    const matchedMap = new Map();

    const fieldsToSearch = preferredField && this.indices[preferredField]
      ? [preferredField]
      : this.fields;

    fieldsToSearch.forEach((field) => {
      const sorted = this.indices[field];
      if (!sorted) return;

      const { results, comparisons } = binarySearchPrefix(sorted, q, (item) => item[field]);
      totalComparisons += comparisons;

      results.forEach((item) => {
        const id = item.id || item.plot_id || item.deed_no || item.tracking_no;
        if (!matchedMap.has(id)) {
          matchedMap.set(id, item);
        }
      });
    });

    let finalResults = Array.from(matchedMap.values());
    if (finalResults.length === 0) {
      const limit = Math.min(this.raw.length, 3000);
      for (let i = 0; i < limit; i++) {
        totalComparisons++;
        const item = this.raw[i];
        const match = fieldsToSearch.some((f) =>
          String(item[f] || '').toLowerCase().includes(q)
        );
        if (match) {
          finalResults.push(item);
          if (finalResults.length >= 25) break;
        }
      }
    }

    const timeMs = Number((performance.now() - startTime).toFixed(3));
    const result = {
      results: finalResults,
      timeMs,
      comparisons: totalComparisons,
      algorithm: 'Binary Search O(log N) + LRU'
    };
    queryCache.set(cacheKey, result);
    return result;
  }
}

/**
 * Debounce helper to prevent rapid re-rendering during user typing.
 */
export function debounce(fn, delay = 180) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
