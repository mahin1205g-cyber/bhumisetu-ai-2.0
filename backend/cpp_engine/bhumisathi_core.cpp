#include "bhumisathi_core.h"
#include "bhumisathi_json.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

namespace {

const std::size_t MAX_FUZZY_INPUT_BYTES = 4096;
const std::size_t MAX_QUERY_BYTES = 512;
const int MAX_SEARCH_RESULTS = 100;
const std::size_t MAX_REPORTED_ANOMALIES = 500;
const std::size_t MAX_REPORTED_CYCLES = 100;

char* duplicate_string(const std::string& value) {
    char* copy = static_cast<char*>(std::malloc(value.size() + 1));
    if (copy) std::memcpy(copy, value.c_str(), value.size() + 1);
    return copy;
}

std::size_t bounded_length(const char* value, std::size_t max_length) {
    if (!value) return max_length + 1;
    for (std::size_t i = 0; i <= max_length; ++i) {
        if (value[i] == '\0') return i;
    }
    return max_length + 1;
}

bool is_unicode_space(std::uint32_t cp) {
    return cp == 0x20 || (cp >= 0x09 && cp <= 0x0D) || (cp >= 0x1C && cp <= 0x1F) || cp == 0x85 || cp == 0xA0 ||
           (cp >= 0x2000 && cp <= 0x200A) || cp == 0x2028 || cp == 0x2029 ||
           cp == 0x202F || cp == 0x205F || cp == 0x3000;
}

bool valid_utf8_bytes(const char* text, std::size_t size) {
    for (std::size_t i = 0; i < size;) {
        const unsigned char first = static_cast<unsigned char>(text[i]);
        std::uint32_t cp = 0;
        std::size_t length = 0;
        std::uint32_t minimum = 0;
        if (first <= 0x7F) { cp = first; length = 1; }
        else if ((first & 0xE0) == 0xC0) { cp = first & 0x1F; length = 2; minimum = 0x80; }
        else if ((first & 0xF0) == 0xE0) { cp = first & 0x0F; length = 3; minimum = 0x800; }
        else if ((first & 0xF8) == 0xF0) { cp = first & 0x07; length = 4; minimum = 0x10000; }
        else return false;
        if (i + length > size) return false;
        for (std::size_t j = 1; j < length; ++j) {
            const unsigned char next = static_cast<unsigned char>(text[i + j]);
            if ((next & 0xC0) != 0x80) return false;
            cp = (cp << 6) | (next & 0x3F);
        }
        if ((length > 1 && cp < minimum) || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return false;
        i += length;
    }
    return true;
}

bool decode_and_normalize_utf8(const char* text, std::size_t size, std::vector<std::uint32_t>& out) {
    out.clear();
    out.reserve(size);
    bool pending_space = false;
    for (std::size_t i = 0; i < size;) {
        const unsigned char first = static_cast<unsigned char>(text[i]);
        std::uint32_t cp = 0;
        std::size_t length = 0;
        std::uint32_t minimum = 0;
        if (first <= 0x7F) { cp = first; length = 1; minimum = 0; }
        else if ((first & 0xE0) == 0xC0) { cp = first & 0x1F; length = 2; minimum = 0x80; }
        else if ((first & 0xF0) == 0xE0) { cp = first & 0x0F; length = 3; minimum = 0x800; }
        else if ((first & 0xF8) == 0xF0) { cp = first & 0x07; length = 4; minimum = 0x10000; }
        else return false;
        if (i + length > size) return false;
        for (std::size_t j = 1; j < length; ++j) {
            const unsigned char next = static_cast<unsigned char>(text[i + j]);
            if ((next & 0xC0) != 0x80) return false;
            cp = (cp << 6) | (next & 0x3F);
        }
        if (cp < minimum || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return false;
        i += length;

        if (is_unicode_space(cp)) {
            if (!out.empty()) pending_space = true;
            continue;
        }
        if (pending_space) {
            out.push_back(static_cast<std::uint32_t>(' '));
            pending_space = false;
        }
        if (cp >= 'A' && cp <= 'Z') cp += 32;
        if (cp >= 0x09E6 && cp <= 0x09EF) cp = static_cast<std::uint32_t>('0') + (cp - 0x09E6);
        out.push_back(cp);
    }
    return true;
}

unsigned int levenshtein_distance(const std::vector<std::uint32_t>& left,
                                  const std::vector<std::uint32_t>& right) {
    if (left.empty()) return static_cast<unsigned int>(right.size());
    if (right.empty()) return static_cast<unsigned int>(left.size());
    const std::vector<std::uint32_t>* rows = &left;
    const std::vector<std::uint32_t>* columns = &right;
    if (rows->size() < columns->size()) std::swap(rows, columns);
    std::vector<unsigned int> distance(columns->size() + 1);
    for (std::size_t j = 0; j <= columns->size(); ++j) distance[j] = static_cast<unsigned int>(j);
    for (std::size_t i = 1; i <= rows->size(); ++i) {
        unsigned int previous_diagonal = distance[0];
        distance[0] = static_cast<unsigned int>(i);
        for (std::size_t j = 1; j <= columns->size(); ++j) {
            const unsigned int previous_row = distance[j];
            if ((*rows)[i - 1] == (*columns)[j - 1]) {
                distance[j] = previous_diagonal;
            } else {
                distance[j] = 1U + std::min(std::min(distance[j], distance[j - 1]), previous_diagonal);
            }
            previous_diagonal = previous_row;
        }
    }
    return distance[columns->size()];
}

std::string lower_ascii(std::string value) {
    for (std::string::iterator it = value.begin(); it != value.end(); ++it) {
        const unsigned char c = static_cast<unsigned char>(*it);
        if (c >= 'A' && c <= 'Z') *it = static_cast<char>(c + ('a' - 'A'));
    }
    return value;
}

std::string trim_ascii(const std::string& value) {
    std::size_t first = 0;
    std::size_t last = value.size();
    while (first < last && (value[first] == ' ' || value[first] == '\t' || value[first] == '\r' || value[first] == '\n')) ++first;
    while (last > first && (value[last - 1] == ' ' || value[last - 1] == '\t' || value[last - 1] == '\r' || value[last - 1] == '\n')) --last;
    return value.substr(first, last - first);
}

std::string member_string(const bhumi_json::Value& value, const char* key) {
    return bhumi_json::as_string(bhumi_json::get(value, key));
}

std::string first_member_string(const bhumi_json::Value& value,
                                const char* first,
                                const char* second) {
    std::string result = member_string(value, first);
    return result.empty() ? member_string(value, second) : result;
}

std::string length_prefixed(const std::string& value) {
    std::ostringstream out;
    out << value.size() << ':' << value;
    return out.str();
}

struct TransferRecord {
    std::string seller;
    std::string seller_id;
    std::string buyer;
    std::string buyer_id;
    std::string parcel_id;
    std::string parcel_key;
    std::string plot_id;
    std::string sale_date;
    std::string deed_no;
    std::string transfer_id;
    std::string reference;
    std::size_t input_index;
};

std::string make_parcel_key(const bhumi_json::Value& input, const std::string& explicit_id,
                            const std::string& plot_id) {
    if (!explicit_id.empty()) return "parcel:" + length_prefixed(explicit_id);
    if (plot_id.empty()) return std::string();
    const std::string district = first_member_string(input, "district_id", "district");
    const std::string upazila = first_member_string(input, "upazila_id", "upazila");
    const std::string mouza = first_member_string(input, "mouza_id", "mouza");
    if (district.empty() || upazila.empty() || mouza.empty()) return std::string();
    const std::string division = first_member_string(input, "division_id", "division");
    return "location:" + length_prefixed(division) + length_prefixed(district) +
           length_prefixed(upazila) + length_prefixed(mouza) + length_prefixed(plot_id);
}

std::string party_key(const std::string& id, const std::string& name) {
    if (!id.empty()) return "id:" + length_prefixed(id);
    if (!name.empty()) return "name:" + length_prefixed(name);
    return std::string();
}

std::string transfer_reference(const TransferRecord& transfer) {
    if (!transfer.transfer_id.empty()) return transfer.transfer_id;
    if (!transfer.deed_no.empty()) return transfer.deed_no;
    std::ostringstream out;
    out << "input[" << transfer.input_index << ']';
    return out.str();
}

bool parse_transfers(const std::string& json, std::vector<TransferRecord>& result) {
    bhumi_json::Value root;
    if (!bhumi_json::parse(json, root) || root.type != bhumi_json::Value::Array) return false;
    if (root.array_value.size() > bhumi_json::MAX_CONTAINER_ITEMS) return false;
    result.clear();
    result.reserve(root.array_value.size());
    for (std::size_t i = 0; i < root.array_value.size(); ++i) {
        const bhumi_json::Value& item = root.array_value[i];
        if (item.type != bhumi_json::Value::Object) return false;
        TransferRecord transfer;
        transfer.seller = member_string(item, "seller");
        transfer.seller_id = member_string(item, "seller_id");
        transfer.buyer = member_string(item, "buyer");
        transfer.buyer_id = member_string(item, "buyer_id");
        transfer.parcel_id = member_string(item, "parcel_id");
        transfer.plot_id = member_string(item, "plot_id");
        transfer.sale_date = member_string(item, "sale_date");
        transfer.deed_no = member_string(item, "deed_no");
        transfer.transfer_id = member_string(item, "transfer_id");
        transfer.input_index = i;
        transfer.reference = transfer_reference(transfer);
        transfer.parcel_key = make_parcel_key(item, transfer.parcel_id, transfer.plot_id);
        if (transfer.seller.size() > 1024 || transfer.buyer.size() > 1024 ||
            transfer.parcel_key.size() > 2048 || transfer.sale_date.size() > 32 ||
            transfer.reference.size() > 1024) return false;
        result.push_back(transfer);
    }
    return true;
}

struct CalendarDate {
    int year;
    int month;
    int day;
    long long days_since_epoch;
};

bool is_leap_year(int year) {
    return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
}

bool parse_iso_date(const std::string& value, CalendarDate& date) {
    if (value.size() != 10 || value[4] != '-' || value[7] != '-') return false;
    const int positions[] = {0, 1, 2, 3, 5, 6, 8, 9};
    for (std::size_t i = 0; i < sizeof(positions) / sizeof(positions[0]); ++i) {
        const char c = value[positions[i]];
        if (c < '0' || c > '9') return false;
    }
    date.year = std::atoi(value.substr(0, 4).c_str());
    date.month = std::atoi(value.substr(5, 2).c_str());
    date.day = std::atoi(value.substr(8, 2).c_str());
    if (date.year < 1 || date.month < 1 || date.month > 12 || date.day < 1) return false;
    static const int month_days[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    int maximum_day = month_days[date.month - 1];
    if (date.month == 2 && is_leap_year(date.year)) maximum_day = 29;
    if (date.day > maximum_day) return false;

    int adjusted_year = date.year - (date.month <= 2 ? 1 : 0);
    const int era = (adjusted_year >= 0 ? adjusted_year : adjusted_year - 399) / 400;
    const unsigned int year_of_era = static_cast<unsigned int>(adjusted_year - era * 400);
    const unsigned int adjusted_month = static_cast<unsigned int>(date.month + (date.month > 2 ? -3 : 9));
    const unsigned int day_of_year = (153 * adjusted_month + 2) / 5 + static_cast<unsigned int>(date.day - 1);
    const unsigned int day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    date.days_since_epoch = static_cast<long long>(era) * 146097 + day_of_era;
    return true;
}

struct Anomaly {
    std::string type;
    std::string parcel_id;
    std::string explanation;
    std::vector<std::string> evidence_refs;
    std::string identity_basis;
};

struct Edge {
    int destination;
    std::string reference;
};

struct DfsFrame {
    int node;
    std::size_t next_edge;
    std::string parent_reference;
};

void detect_cycles_for_parcel(const std::string& parcel_key,
                              const std::vector<TransferRecord>& records,
                              std::vector<std::string>& cycles,
                              std::vector<Anomaly>& anomalies,
                              std::set<std::string>& seen_cycles) {
    std::map<std::string, int> ids;
    std::vector<std::string> labels;
    std::vector<std::vector<Edge> > adjacency;
    bool all_parties_have_ids = true;
    for (std::vector<TransferRecord>::const_iterator it = records.begin(); it != records.end(); ++it) {
        const std::string from = party_key(it->seller_id, it->seller);
        const std::string to = party_key(it->buyer_id, it->buyer);
        if (from.empty() || to.empty()) continue;
        if (it->seller_id.empty() || it->buyer_id.empty()) all_parties_have_ids = false;
        if (ids.find(from) == ids.end()) {
            const int id = static_cast<int>(labels.size());
            ids[from] = id; labels.push_back(it->seller); adjacency.push_back(std::vector<Edge>());
        }
        if (ids.find(to) == ids.end()) {
            const int id = static_cast<int>(labels.size());
            ids[to] = id; labels.push_back(it->buyer); adjacency.push_back(std::vector<Edge>());
        }
        if (from == to) continue;
        Edge edge;
        edge.destination = ids[to]; edge.reference = it->reference;
        adjacency[ids[from]].push_back(edge);
    }

    std::vector<int> state(labels.size(), 0);
    for (std::size_t start = 0; start < labels.size() && cycles.size() < MAX_REPORTED_CYCLES; ++start) {
        if (state[start] != 0) continue;
        std::vector<DfsFrame> frames;
        DfsFrame first; first.node = static_cast<int>(start); first.next_edge = 0; first.parent_reference.clear();
        frames.push_back(first); state[start] = 1;
        while (!frames.empty() && cycles.size() < MAX_REPORTED_CYCLES) {
            DfsFrame& frame = frames.back();
            if (frame.next_edge >= adjacency[frame.node].size()) {
                state[frame.node] = 2;
                frames.pop_back();
                continue;
            }
            const Edge edge = adjacency[frame.node][frame.next_edge++];
            if (state[edge.destination] == 0) {
                DfsFrame child; child.node = edge.destination; child.next_edge = 0; child.parent_reference = edge.reference;
                state[edge.destination] = 1;
                frames.push_back(child);
            } else if (state[edge.destination] == 1) {
                std::size_t cycle_start = 0;
                while (cycle_start < frames.size() && frames[cycle_start].node != edge.destination) ++cycle_start;
                if (cycle_start == frames.size()) continue;
                std::ostringstream description;
                std::ostringstream signature;
                std::vector<std::string> refs;
                for (std::size_t k = cycle_start; k < frames.size(); ++k) {
                    const std::string& label = labels[frames[k].node];
                    if (k > cycle_start) { description << " -> "; signature << "|"; }
                    description << label; signature << label;
                    if (k > cycle_start && !frames[k].parent_reference.empty()) refs.push_back(frames[k].parent_reference);
                }
                description << " -> " << labels[edge.destination];
                signature << "|" << labels[edge.destination];
                refs.push_back(edge.reference);
                const std::string signature_key = parcel_key + "#" + signature.str();
                if (seen_cycles.insert(signature_key).second) {
                    cycles.push_back(description.str());
                    if (anomalies.size() < MAX_REPORTED_ANOMALIES) {
                        Anomaly anomaly;
                        anomaly.type = "POTENTIAL_OWNERSHIP_CYCLE";
                        anomaly.parcel_id = parcel_key;
                        anomaly.explanation = "Name or party identifiers form a directed cycle for this parcel; review the referenced transfers. This is an anomaly signal, not a fraud finding.";
                        anomaly.evidence_refs = refs;
                        anomaly.identity_basis = all_parties_have_ids ? "party_id" : "name_only";
                        anomalies.push_back(anomaly);
                    }
                }
            }
        }
    }
}

std::string serialize_string_array(const std::vector<std::string>& values) {
    std::ostringstream out;
    out << '[';
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i) out << ',';
        out << bhumi_json::quote(values[i]);
    }
    out << ']';
    return out.str();
}

std::string serialize_anomalies(const std::vector<Anomaly>& anomalies) {
    std::ostringstream out;
    out << '[';
    for (std::size_t i = 0; i < anomalies.size(); ++i) {
        if (i) out << ',';
        const Anomaly& item = anomalies[i];
        out << "{\"type\":" << bhumi_json::quote(item.type)
            << ",\"parcel_id\":" << bhumi_json::quote(item.parcel_id)
            << ",\"explanation\":" << bhumi_json::quote(item.explanation)
            << ",\"identity_basis\":" << bhumi_json::quote(item.identity_basis)
            << ",\"evidence_refs\":" << serialize_string_array(item.evidence_refs) << '}';
    }
    out << ']';
    return out.str();
}

std::string graph_error(const char* error, int window_days) {
    std::ostringstream out;
    out << "{\"error\":" << bhumi_json::quote(error)
        << ",\"has_cycle\":false,\"cycle_count\":0,\"cycles\":[],\"double_sales\":[],"
        << "\"rapid_transfers\":[],\"anomalies\":[],\"fraud_risk_score\":null,"
        << "\"risk_score_status\":\"NOT_CALCULATED\",\"rapid_transfer_window_days\":"
        << window_days << ",\"execution_time_us\":0}";
    return out.str();
}

std::string detect_graph(const char* input, int configured_window) {
    const std::chrono::steady_clock::time_point started = std::chrono::steady_clock::now();
    const int window_days = std::max(0, std::min(configured_window, 3650));
    const std::size_t length = bounded_length(input, bhumi_json::MAX_DOCUMENT_BYTES);
    if (length > bhumi_json::MAX_DOCUMENT_BYTES) return graph_error("null, oversized, or unterminated input", window_days);
    std::vector<TransferRecord> transfers;
    if (!parse_transfers(std::string(input, length), transfers)) return graph_error("invalid transfer JSON", window_days);

    std::map<std::string, std::vector<TransferRecord> > by_parcel;
    std::map<std::pair<std::string, std::string>, std::vector<TransferRecord> > by_seller_and_parcel;
    std::set<std::string> parties;
    std::size_t unscoped_count = 0;
    for (std::vector<TransferRecord>::const_iterator it = transfers.begin(); it != transfers.end(); ++it) {
        const std::string seller = party_key(it->seller_id, it->seller);
        const std::string buyer = party_key(it->buyer_id, it->buyer);
        if (!seller.empty()) parties.insert(seller);
        if (!buyer.empty()) parties.insert(buyer);
        if (it->parcel_key.empty()) { ++unscoped_count; continue; }
        by_parcel[it->parcel_key].push_back(*it);
        if (!seller.empty() && !buyer.empty()) by_seller_and_parcel[std::make_pair(it->parcel_key, seller)].push_back(*it);
    }

    std::vector<std::string> cycles;
    std::vector<std::string> double_sales;
    std::vector<std::string> rapid_transfers;
    std::vector<Anomaly> anomalies;
    std::set<std::string> seen_cycles;

    for (std::map<std::string, std::vector<TransferRecord> >::const_iterator parcel = by_parcel.begin(); parcel != by_parcel.end(); ++parcel) {
        detect_cycles_for_parcel(parcel->first, parcel->second, cycles, anomalies, seen_cycles);
        if (cycles.size() >= MAX_REPORTED_CYCLES) break;
    }

    for (std::map<std::pair<std::string, std::string>, std::vector<TransferRecord> >::const_iterator group = by_seller_and_parcel.begin();
         group != by_seller_and_parcel.end(); ++group) {
        std::map<std::string, std::vector<TransferRecord> > by_buyer;
        for (std::vector<TransferRecord>::const_iterator it = group->second.begin(); it != group->second.end(); ++it)
            by_buyer[party_key(it->buyer_id, it->buyer)].push_back(*it);
        if (by_buyer.size() < 2) continue;
        const TransferRecord& sample = group->second.front();
        std::vector<std::string> buyer_names;
        std::vector<std::string> refs;
        for (std::map<std::string, std::vector<TransferRecord> >::const_iterator buyer = by_buyer.begin(); buyer != by_buyer.end(); ++buyer) {
            if (!buyer->second.empty()) buyer_names.push_back(buyer->second.front().buyer);
            for (std::vector<TransferRecord>::const_iterator it = buyer->second.begin(); it != buyer->second.end(); ++it) refs.push_back(it->reference);
        }
        std::ostringstream description;
        description << "Seller '" << sample.seller << "' has transfer records for parcel '"
                    << sample.plot_id << "' to multiple buyers (";
        for (std::size_t i = 0; i < buyer_names.size(); ++i) {
            if (i) description << ", ";
            description << buyer_names[i];
        }
        description << "); review chronology, cancellation, and title sequence.";
        double_sales.push_back(description.str());
        if (anomalies.size() < MAX_REPORTED_ANOMALIES) {
            Anomaly anomaly;
            anomaly.type = "POTENTIAL_DOUBLE_SALE";
            anomaly.parcel_id = group->first.first;
            anomaly.explanation = "The same seller is recorded with multiple buyers for one parcel. Verify the deed sequence and any cancellation before drawing conclusions.";
            anomaly.evidence_refs = refs;
            anomaly.identity_basis = sample.seller_id.empty() ? "seller_name" : "seller_id";
            anomalies.push_back(anomaly);
        }
    }

    if (window_days > 0) {
        for (std::map<std::string, std::vector<TransferRecord> >::const_iterator parcel = by_parcel.begin(); parcel != by_parcel.end(); ++parcel) {
            struct DatedTransfer { CalendarDate date; TransferRecord transfer; };
            std::vector<DatedTransfer> dated;
            for (std::vector<TransferRecord>::const_iterator it = parcel->second.begin(); it != parcel->second.end(); ++it) {
                CalendarDate parsed;
                if (parse_iso_date(it->sale_date, parsed)) {
                    DatedTransfer item; item.date = parsed; item.transfer = *it; dated.push_back(item);
                }
            }
            std::sort(dated.begin(), dated.end(), [](const DatedTransfer& left, const DatedTransfer& right) {
                if (left.date.days_since_epoch != right.date.days_since_epoch)
                    return left.date.days_since_epoch < right.date.days_since_epoch;
                return left.transfer.input_index < right.transfer.input_index;
            });
            for (std::size_t i = 1; i < dated.size(); ++i) {
                const DatedTransfer& prior = dated[i - 1];
                const DatedTransfer& current = dated[i];
                const std::string prior_buyer = party_key(prior.transfer.buyer_id, prior.transfer.buyer);
                const std::string current_seller = party_key(current.transfer.seller_id, current.transfer.seller);
                const long long gap = current.date.days_since_epoch - prior.date.days_since_epoch;
                if (prior_buyer.empty() || prior_buyer != current_seller || gap < 0 || gap > window_days) continue;
                std::ostringstream description;
                description << "Parcel '" << prior.transfer.plot_id << "' has a recorded ownership handoff after "
                            << gap << " days (" << prior.transfer.sale_date << " to " << current.transfer.sale_date << ").";
                rapid_transfers.push_back(description.str());
                if (anomalies.size() < MAX_REPORTED_ANOMALIES) {
                    Anomaly anomaly;
                    anomaly.type = "RAPID_TRANSFER_OBSERVATION";
                    anomaly.parcel_id = parcel->first;
                    anomaly.explanation = description.str() + " This is an anomaly indicator, not proof of fraud.";
                    anomaly.evidence_refs.push_back(prior.transfer.reference);
                    anomaly.evidence_refs.push_back(current.transfer.reference);
                    anomaly.identity_basis = current.transfer.seller_id.empty() ? "party_name_sequence" : "party_id_sequence";
                    anomalies.push_back(anomaly);
                }
            }
        }
    }

    std::ostringstream out;
    const long long elapsed_us = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now() - started).count();
    out << "{\"engine\":\"BhumiSathi C++ Core Engine v3.0\","
        << "\"has_cycle\":" << (cycles.empty() ? "false" : "true") << ','
        << "\"cycle_count\":" << cycles.size() << ','
        << "\"cycles\":" << serialize_string_array(cycles) << ','
        << "\"double_sales\":" << serialize_string_array(double_sales) << ','
        << "\"rapid_transfers\":" << serialize_string_array(rapid_transfers) << ','
        << "\"anomalies\":" << serialize_anomalies(anomalies) << ','
        << "\"fraud_risk_score\":null,\"risk_score_status\":\"NOT_CALCULATED\","
        << "\"rapid_transfer_window_days\":" << window_days << ','
        << "\"parties_count\":" << parties.size() << ','
        << "\"transfers_count\":" << transfers.size() << ','
        << "\"scoped_transfers_count\":" << (transfers.size() - unscoped_count) << ','
        << "\"unscoped_transfers_count\":" << unscoped_count << ','
        << "\"execution_time_us\":" << elapsed_us << '}';
    return out.str();
}

bool record_matches(const bhumi_json::Value& record, const std::string& query) {
    static const char* keys[] = {"plot_id", "khatian_no", "deed_no", "mouza"};
    for (std::size_t i = 0; i < sizeof(keys) / sizeof(keys[0]); ++i) {
        const std::string field = lower_ascii(bhumi_json::as_string(bhumi_json::get(record, keys[i])));
        if (field.find(query) != std::string::npos) return true;
    }
    return false;
}

std::string search_error(const char* message) {
    return std::string("{\"error\":") + bhumi_json::quote(message) +
           ",\"algorithm\":\"Linear JSON scan O(N)\",\"count\":0,\"results\":[]}";
}

const std::string& benchmark_left(std::size_t index) {
    static const std::string values[] = {"মোহাম্মদ রফিকুল ইসলাম", "Abdul Karim", "আব্দুল করিম ১২৩"};
    return values[index % 3];
}

const std::string& benchmark_right(std::size_t index) {
    static const std::string values[] = {"মুহাম্মদ রফিকুল ইসলাম", "abdul   karim", "আব্দুল করিম 123"};
    return values[index % 3];
}

}  // namespace

BHUMI_EXPORT const char* bhumi_version() {
    return "BhumiSathi C++ Core Engine v3.0 (UTF-8 matching, parcel-scoped graph, strict dates)";
}

BHUMI_EXPORT void bhumi_free_string(char* ptr) {
    if (ptr) std::free(ptr);
}

BHUMI_EXPORT double bhumi_fuzzy_match(const char* s1_raw, const char* s2_raw) {
    try {
        const std::size_t left_length = bounded_length(s1_raw, MAX_FUZZY_INPUT_BYTES);
        const std::size_t right_length = bounded_length(s2_raw, MAX_FUZZY_INPUT_BYTES);
        if (left_length > MAX_FUZZY_INPUT_BYTES || right_length > MAX_FUZZY_INPUT_BYTES) return 0.0;
        if (left_length > 0 && left_length == right_length &&
            std::memcmp(s1_raw, s2_raw, left_length) == 0 && valid_utf8_bytes(s1_raw, left_length)) return 100.0;
        std::vector<std::uint32_t> left;
        std::vector<std::uint32_t> right;
        if (!decode_and_normalize_utf8(s1_raw, left_length, left) ||
            !decode_and_normalize_utf8(s2_raw, right_length, right)) return 0.0;
        if (left.empty() || right.empty()) return 0.0;
        if (left == right) return 100.0;
        const unsigned int distance = levenshtein_distance(left, right);
        const double denominator = static_cast<double>(std::max(left.size(), right.size()));
        const double score = (1.0 - static_cast<double>(distance) / denominator) * 100.0;
        return std::floor(std::max(0.0, std::min(100.0, score)) * 100.0 + 0.5) / 100.0;
    } catch (...) {
        return 0.0;
    }
}

BHUMI_EXPORT const char* bhumi_detect_fraud_graph(const char* transfers_json_raw) {
    return bhumi_detect_fraud_graph_with_options(transfers_json_raw, 30);
}

BHUMI_EXPORT const char* bhumi_detect_fraud_graph_with_options(
    const char* transfers_json_raw, int rapid_transfer_window_days) {
    try {
        return duplicate_string(detect_graph(transfers_json_raw, rapid_transfer_window_days));
    } catch (...) {
        return duplicate_string(graph_error("native graph processing failed", std::max(0, std::min(rapid_transfer_window_days, 3650))));
    }
}

BHUMI_EXPORT const char* bhumi_fast_search(const char* records_json_raw,
                                            const char* query_raw,
                                            int requested_limit) {
    try {
        const std::chrono::steady_clock::time_point started = std::chrono::steady_clock::now();
        const std::size_t records_length = bounded_length(records_json_raw, bhumi_json::MAX_DOCUMENT_BYTES);
        const std::size_t query_length = bounded_length(query_raw, MAX_QUERY_BYTES);
        if (records_length > bhumi_json::MAX_DOCUMENT_BYTES || query_length > MAX_QUERY_BYTES)
            return duplicate_string(search_error("null, oversized, or unterminated search input"));
        bhumi_json::Value records;
        if (!bhumi_json::parse(std::string(records_json_raw, records_length), records) || records.type != bhumi_json::Value::Array)
            return duplicate_string(search_error("invalid records JSON"));

        const std::string query = trim_ascii(std::string(query_raw, query_length));
        const std::string folded_query = lower_ascii(query);
        const int limit = std::max(0, std::min(requested_limit, MAX_SEARCH_RESULTS));
        std::vector<std::string> matches;
        if (!folded_query.empty() && limit > 0) {
            for (std::vector<bhumi_json::Value>::const_iterator it = records.array_value.begin();
                 it != records.array_value.end() && static_cast<int>(matches.size()) < limit; ++it) {
                if (it->type == bhumi_json::Value::Object && record_matches(*it, folded_query))
                    matches.push_back(bhumi_json::stringify(*it));
            }
        }
        const long long elapsed_us = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::steady_clock::now() - started).count();
        std::ostringstream out;
        out << "{\"engine\":\"BhumiSathi C++ Search\","
            << "\"algorithm\":\"Linear JSON scan O(N)\","
            << "\"query\":" << bhumi_json::quote(query) << ','
            << "\"count\":" << matches.size() << ','
            << "\"time_us\":" << elapsed_us << ','
            << "\"time_ms\":" << (elapsed_us / 1000.0) << ','
            << "\"results\":[";
        for (std::size_t i = 0; i < matches.size(); ++i) {
            if (i) out << ',';
            out << matches[i];
        }
        out << "]}";
        return duplicate_string(out.str());
    } catch (...) {
        return duplicate_string(search_error("native search processing failed"));
    }
}

BHUMI_EXPORT const char* bhumi_run_fuzzy_benchmark(int num_operations) {
    try {
        const int operations = std::max(1, std::min(num_operations, 500000));
        volatile double checksum = 0.0;
        const std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
        for (int i = 0; i < operations; ++i) {
            checksum += bhumi_fuzzy_match(benchmark_left(static_cast<std::size_t>(i)).c_str(),
                                          benchmark_right(static_cast<std::size_t>(i)).c_str());
        }
        const std::chrono::steady_clock::time_point finish = std::chrono::steady_clock::now();
        const long long elapsed_ns = std::max<long long>(1, std::chrono::duration_cast<std::chrono::nanoseconds>(finish - start).count());
        const double elapsed_ms = static_cast<double>(elapsed_ns) / 1000000.0;
        const double operations_per_second = static_cast<double>(operations) * 1000000000.0 / static_cast<double>(elapsed_ns);
        std::ostringstream out;
        out << std::fixed << std::setprecision(4)
            << "{\"engine\":\"BhumiSathi C++ Core Engine v3.0\","
            << "\"workload\":\"normalized UTF-8 Levenshtein fuzzy_match\","
            << "\"iterations\":" << operations << ','
            << "\"elapsed_ms\":" << elapsed_ms << ','
            << "\"operations_per_sec\":" << operations_per_second << ','
            << "\"score_checksum\":" << checksum << '}';
        return duplicate_string(out.str());
    } catch (...) {
        return duplicate_string("{\"error\":\"native benchmark failed\"}");
    }
}

BHUMI_EXPORT const char* bhumi_run_benchmark(int num_operations) {
    return bhumi_run_fuzzy_benchmark(num_operations);
}
