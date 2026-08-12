#include "preprocessor.h"
#include <cstring>

namespace cx {
namespace {

// Quoted forms, so one token replaces the key *and* its quotes: 4 bytes -> 1.
// Order is part of the format — appending is safe, reordering is not.
const char* const kInterned[] = {
  "\"id\"",        "\"name\"",  "\"title\"",   "\"description\"",
  "\"type\"",      "\"value\"", "\"created\"", "\"updated\"",
  "\"timestamp\"", "\"date\"",  "\"time\"",    "\"user\"",
  "\"author\"",    "\"email\"", "\"url\"",     "\"link\"",
};
constexpr size_t kInternedCount = sizeof(kInterned) / sizeof(kInterned[0]);
static_assert(kInternedCount <= 16, "interned tokens must fit in 0xE0..0xEF");

bool matches(const uint8_t* data, size_t len, size_t pos, const char* needle, size_t needle_len) {
  return pos + needle_len <= len && std::memcmp(data + pos, needle, needle_len) == 0;
}

}  // namespace

std::vector<uint8_t> JsonPreprocessor::preprocess(const uint8_t* data, size_t len) {
  std::vector<uint8_t> out;
  out.reserve(len);

  size_t i = 0;
  while (i < len) {
    const uint8_t c = data[i];

    // Every interned literal starts with a quote, so this costs one comparison
    // on the overwhelming majority of bytes.
    if (c == '"') {
      bool replaced = false;
      for (size_t k = 0; k < kInternedCount; ++k) {
        const size_t nlen = std::strlen(kInterned[k]);
        if (matches(data, len, i, kInterned[k], nlen)) {
          out.push_back(static_cast<uint8_t>(TOK_COMMON_BASE + k));
          i += nlen;
          replaced = true;
          break;
        }
      }
      if (replaced) continue;
    } else if (c == 't' && matches(data, len, i, "true", 4)) {
      out.push_back(TOK_TRUE);
      i += 4;
      continue;
    } else if (c == 'f' && matches(data, len, i, "false", 5)) {
      out.push_back(TOK_FALSE);
      i += 5;
      continue;
    } else if (c == 'n' && matches(data, len, i, "null", 4)) {
      out.push_back(TOK_NULL);
      i += 4;
      continue;
    }

    // A literal byte that could be read back as a token has to be escaped.
    // This is what keeps multi-byte UTF-8 — whose lead bytes start at 0xE0 —
    // from being decoded as an interned key.
    if (c >= ESCAPE_THRESHOLD) {
      out.push_back(TOK_ESCAPE);
    }
    out.push_back(c);
    ++i;
  }

  return out;
}

std::vector<uint8_t> JsonPreprocessor::postprocess(const uint8_t* data, size_t len) {
  std::vector<uint8_t> out;
  out.reserve(len + len / 4);

  const auto append = [&out](const char* s) {
    out.insert(out.end(), s, s + std::strlen(s));
  };

  size_t i = 0;
  while (i < len) {
    const uint8_t c = data[i];

    if (c == TOK_ESCAPE) {
      // A trailing escape can only come from a corrupt stream. Emitting it
      // literally keeps this function total; structurally invalid input is
      // already rejected by the decoder that runs before it.
      if (i + 1 < len) {
        out.push_back(data[i + 1]);
        i += 2;
      } else {
        out.push_back(c);
        ++i;
      }
      continue;
    }

    if (c >= TOK_COMMON_BASE && c < TOK_COMMON_BASE + kInternedCount) {
      append(kInterned[c - TOK_COMMON_BASE]);
    } else if (c == TOK_TRUE) {
      append("true");
    } else if (c == TOK_FALSE) {
      append("false");
    } else if (c == TOK_NULL) {
      append("null");
    } else {
      out.push_back(c);
    }
    ++i;
  }

  return out;
}

}  // namespace cx
