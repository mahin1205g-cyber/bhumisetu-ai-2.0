#ifndef BHUMISATHI_JSON_H
#define BHUMISATHI_JSON_H

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace bhumi_json {

static const std::size_t MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
static const std::size_t MAX_CONTAINER_ITEMS = 50000;
static const unsigned int MAX_NESTING = 64;

struct Value {
    enum Type { Null, Boolean, Number, String, Array, Object } type;
    bool boolean_value;
    std::string scalar;
    std::vector<Value> array_value;
    std::vector<std::pair<std::string, Value> > object_value;

    Value() : type(Null), boolean_value(false) {}
};

inline void append_utf8(std::string& out, std::uint32_t cp) {
    if (cp <= 0x7F) {
        out.push_back(static_cast<char>(cp));
    } else if (cp <= 0x7FF) {
        out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp <= 0xFFFF) {
        out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
        out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
}

inline bool valid_utf8(const std::string& value) {
    for (std::size_t i = 0; i < value.size();) {
        const unsigned char first = static_cast<unsigned char>(value[i]);
        std::uint32_t cp = 0;
        std::size_t length = 0;
        std::uint32_t minimum = 0;
        if (first <= 0x7F) { cp = first; length = 1; }
        else if ((first & 0xE0) == 0xC0) { cp = first & 0x1F; length = 2; minimum = 0x80; }
        else if ((first & 0xF0) == 0xE0) { cp = first & 0x0F; length = 3; minimum = 0x800; }
        else if ((first & 0xF8) == 0xF0) { cp = first & 0x07; length = 4; minimum = 0x10000; }
        else return false;
        if (i + length > value.size()) return false;
        for (std::size_t j = 1; j < length; ++j) {
            const unsigned char next = static_cast<unsigned char>(value[i + j]);
            if ((next & 0xC0) != 0x80) return false;
            cp = (cp << 6) | (next & 0x3F);
        }
        if ((length > 1 && cp < minimum) || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return false;
        i += length;
    }
    return true;
}

class Parser {
public:
    explicit Parser(const std::string& input) : input_(input), pos_(0) {}

    bool parse(Value& result) {
        if (input_.size() > MAX_DOCUMENT_BYTES) return false;
        skip_space();
        if (!parse_value(result, 0)) return false;
        skip_space();
        return pos_ == input_.size();
    }

private:
    const std::string& input_;
    std::size_t pos_;

    void skip_space() {
        while (pos_ < input_.size()) {
            const char c = input_[pos_];
            if (c == ' ' || c == '\t' || c == '\r' || c == '\n') ++pos_;
            else break;
        }
    }

    bool read_hex4(std::uint32_t& value) {
        if (pos_ + 4 > input_.size()) return false;
        value = 0;
        for (int i = 0; i < 4; ++i) {
            const char c = input_[pos_++];
            value <<= 4;
            if (c >= '0' && c <= '9') value |= static_cast<std::uint32_t>(c - '0');
            else if (c >= 'a' && c <= 'f') value |= static_cast<std::uint32_t>(c - 'a' + 10);
            else if (c >= 'A' && c <= 'F') value |= static_cast<std::uint32_t>(c - 'A' + 10);
            else return false;
        }
        return true;
    }

    bool parse_string(std::string& result) {
        if (pos_ >= input_.size() || input_[pos_] != '"') return false;
        ++pos_;
        result.clear();
        while (pos_ < input_.size()) {
            const unsigned char c = static_cast<unsigned char>(input_[pos_++]);
            if (c == '"') return valid_utf8(result);
            if (c < 0x20) return false;
            if (c != '\\') {
                result.push_back(static_cast<char>(c));
                continue;
            }
            if (pos_ >= input_.size()) return false;
            const char escaped = input_[pos_++];
            switch (escaped) {
                case '"': result.push_back('"'); break;
                case '\\': result.push_back('\\'); break;
                case '/': result.push_back('/'); break;
                case 'b': result.push_back('\b'); break;
                case 'f': result.push_back('\f'); break;
                case 'n': result.push_back('\n'); break;
                case 'r': result.push_back('\r'); break;
                case 't': result.push_back('\t'); break;
                case 'u': {
                    std::uint32_t cp = 0;
                    if (!read_hex4(cp)) return false;
                    if (cp >= 0xD800 && cp <= 0xDBFF) {
                        if (pos_ + 2 > input_.size() || input_[pos_] != '\\' || input_[pos_ + 1] != 'u') return false;
                        pos_ += 2;
                        std::uint32_t low = 0;
                        if (!read_hex4(low) || low < 0xDC00 || low > 0xDFFF) return false;
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
                    } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
                        return false;
                    }
                    append_utf8(result, cp);
                    break;
                }
                default: return false;
            }
        }
        return false;
    }

    bool parse_number(Value& result) {
        const std::size_t start = pos_;
        if (pos_ < input_.size() && input_[pos_] == '-') ++pos_;
        if (pos_ >= input_.size()) return false;
        if (input_[pos_] == '0') {
            ++pos_;
            if (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') return false;
        } else {
            if (input_[pos_] < '1' || input_[pos_] > '9') return false;
            while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') ++pos_;
        }
        if (pos_ < input_.size() && input_[pos_] == '.') {
            ++pos_;
            const std::size_t fraction_start = pos_;
            while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') ++pos_;
            if (fraction_start == pos_) return false;
        }
        if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
            ++pos_;
            if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) ++pos_;
            const std::size_t exponent_start = pos_;
            while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') ++pos_;
            if (exponent_start == pos_) return false;
        }
        result.type = Value::Number;
        result.scalar = input_.substr(start, pos_ - start);
        return true;
    }

    bool parse_value(Value& result, unsigned int depth) {
        if (depth > MAX_NESTING || pos_ >= input_.size()) return false;
        skip_space();
        if (pos_ >= input_.size()) return false;
        const char c = input_[pos_];
        if (c == '"') {
            result.type = Value::String;
            return parse_string(result.scalar);
        }
        if (c == '[') {
            ++pos_;
            result.type = Value::Array;
            result.array_value.clear();
            skip_space();
            if (pos_ < input_.size() && input_[pos_] == ']') { ++pos_; return true; }
            while (result.array_value.size() < MAX_CONTAINER_ITEMS) {
                Value item;
                if (!parse_value(item, depth + 1)) return false;
                result.array_value.push_back(item);
                skip_space();
                if (pos_ >= input_.size()) return false;
                if (input_[pos_] == ']') { ++pos_; return true; }
                if (input_[pos_++] != ',') return false;
                skip_space();
            }
            return false;
        }
        if (c == '{') {
            ++pos_;
            result.type = Value::Object;
            result.object_value.clear();
            skip_space();
            if (pos_ < input_.size() && input_[pos_] == '}') { ++pos_; return true; }
            while (result.object_value.size() < MAX_CONTAINER_ITEMS) {
                std::string key;
                if (!parse_string(key)) return false;
                skip_space();
                if (pos_ >= input_.size() || input_[pos_++] != ':') return false;
                Value item;
                if (!parse_value(item, depth + 1)) return false;
                result.object_value.push_back(std::make_pair(key, item));
                skip_space();
                if (pos_ >= input_.size()) return false;
                if (input_[pos_] == '}') { ++pos_; return true; }
                if (input_[pos_++] != ',') return false;
                skip_space();
            }
            return false;
        }
        if (c == 't' && input_.compare(pos_, 4, "true") == 0) {
            pos_ += 4; result.type = Value::Boolean; result.boolean_value = true; return true;
        }
        if (c == 'f' && input_.compare(pos_, 5, "false") == 0) {
            pos_ += 5; result.type = Value::Boolean; result.boolean_value = false; return true;
        }
        if (c == 'n' && input_.compare(pos_, 4, "null") == 0) {
            pos_ += 4; result.type = Value::Null; return true;
        }
        return parse_number(result);
    }
};

inline bool parse(const std::string& input, Value& value) {
    Parser parser(input);
    return parser.parse(value);
}

inline const Value* get(const Value& value, const std::string& key) {
    if (value.type != Value::Object) return NULL;
    for (std::vector<std::pair<std::string, Value> >::const_reverse_iterator it = value.object_value.rbegin();
         it != value.object_value.rend(); ++it) {
        if (it->first == key) return &it->second;
    }
    return NULL;
}

inline std::string as_string(const Value* value) {
    if (!value) return std::string();
    if (value->type == Value::String || value->type == Value::Number) return value->scalar;
    return std::string();
}

inline std::string quote(const std::string& value) {
    static const char hex[] = "0123456789abcdef";
    std::string out;
    out.push_back('"');
    for (std::string::const_iterator it = value.begin(); it != value.end(); ++it) {
        const unsigned char c = static_cast<unsigned char>(*it);
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    out += "\\u00";
                    out.push_back(hex[(c >> 4) & 0x0F]);
                    out.push_back(hex[c & 0x0F]);
                } else out.push_back(static_cast<char>(c));
        }
    }
    out.push_back('"');
    return out;
}

inline std::string stringify(const Value& value) {
    std::string out;
    switch (value.type) {
        case Value::Null: return "null";
        case Value::Boolean: return value.boolean_value ? "true" : "false";
        case Value::Number: return value.scalar;
        case Value::String: return quote(value.scalar);
        case Value::Array:
            out = "[";
            for (std::size_t i = 0; i < value.array_value.size(); ++i) {
                if (i) out += ",";
                out += stringify(value.array_value[i]);
            }
            return out + "]";
        case Value::Object:
            out = "{";
            for (std::size_t i = 0; i < value.object_value.size(); ++i) {
                if (i) out += ",";
                out += quote(value.object_value[i].first);
                out += ":";
                out += stringify(value.object_value[i].second);
            }
            return out + "}";
    }
    return "null";
}

}  // namespace bhumi_json

#endif  // BHUMISATHI_JSON_H
