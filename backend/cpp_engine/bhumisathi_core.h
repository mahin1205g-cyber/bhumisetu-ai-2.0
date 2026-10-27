#ifndef BHUMISATHI_CORE_H
#define BHUMISATHI_CORE_H

#ifdef __cplusplus
extern "C" {
#endif

#ifdef _WIN32
  #define BHUMI_EXPORT __declspec(dllexport)
#else
  #define BHUMI_EXPORT __attribute__((visibility("default")))
#endif

/**
 * @brief Returns the version and build details of the C++ Core Engine.
 */
BHUMI_EXPORT const char* bhumi_version();

/**
 * @brief Computes UTF-8 aware Levenshtein distance & similarity score (0.0 to 100.0).
 * Handles Bengali unicode characters and English strings.
 */
BHUMI_EXPORT double bhumi_fuzzy_match(const char* s1, const char* s2);

/**
 * @brief Detects ownership cycles (cartel loops, A -> B -> C -> A),
 * double-sales, and rapid flip anomalies on a directed ownership transfer graph.
 * @param transfers_json JSON array of transfers: [{"seller": "...", "buyer": "...", "plot_id": "...", "sale_date": "...", "deed_no": "..."}]
 * @return JSON string containing detected anomalies, risk score, and execution time in microseconds.
 */
BHUMI_EXPORT const char* bhumi_detect_fraud_graph(const char* transfers_json);

/**
 * @brief Fast memory-indexed O(log N) binary search across land records.
 * @param records_json JSON array of records to search within.
 * @param query Search query string (plot_id, khatian_no, deed_no, mouza).
 * @param limit Maximum results to return.
 * @return JSON string of matching records with microsecond timing.
 */
BHUMI_EXPORT const char* bhumi_fast_search(const char* records_json, const char* query, int limit);

/**
 * @brief Runs an intense algorithmic benchmark in C++ and returns throughput and timing stats.
 * @param num_operations Number of iterations to execute.
 * @return JSON string with benchmark metrics.
 */
BHUMI_EXPORT const char* bhumi_run_benchmark(int num_operations);

/**
 * @brief Safely frees memory of strings returned by C++ functions.
 */
BHUMI_EXPORT void bhumi_free_string(char* ptr);

#ifdef __cplusplus
}
#endif

#endif // BHUMISATHI_CORE_H
