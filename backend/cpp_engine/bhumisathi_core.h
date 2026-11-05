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

BHUMI_EXPORT const char* bhumi_version();

/* Returns a normalized UTF-8 Levenshtein similarity from 0 to 100.
 * Empty or invalid inputs return 0; this is a similarity signal, not identity proof.
 */
BHUMI_EXPORT double bhumi_fuzzy_match(const char* s1, const char* s2);

/* Analyze only transfers with a stable parcel_id or complete location + plot key.
 * The legacy entry point uses a documented 30-day rapid-transfer window.
 */
BHUMI_EXPORT const char* bhumi_detect_fraud_graph(const char* transfers_json);
BHUMI_EXPORT const char* bhumi_detect_fraud_graph_with_options(
    const char* transfers_json, int rapid_transfer_window_days);

/* Linear scan over supplied records; never claims index or O(log N) behavior.
 * Searchable keys: plot_id, khatian_no, deed_no, mouza.
 */
BHUMI_EXPORT const char* bhumi_fast_search(
    const char* records_json, const char* query, int limit);

/* Repeated fuzzy matching benchmark. This measures algorithm work only. */
BHUMI_EXPORT const char* bhumi_run_fuzzy_benchmark(int num_operations);
BHUMI_EXPORT const char* bhumi_run_benchmark(int num_operations);

/* Free every allocated string returned by this library. */
BHUMI_EXPORT void bhumi_free_string(char* ptr);

#ifdef __cplusplus
}
#endif

#endif  // BHUMISATHI_CORE_H
