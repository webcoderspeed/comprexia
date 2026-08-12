#include "comprexia/encoder.h"
#include "preprocessor.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <vector>

#if defined(_MSC_VER)
#include <intrin.h>
#endif

namespace cx {
namespace {

constexpr size_t kMinMatch = 4;
constexpr size_t kMaxDistance = 65535;

// A short match block stores len-3 in seven bits, so len 130 would encode as
// 0x80|127 == 0xFF — the extended-match marker. v0.1 emitted exactly that and
// the decoder misread it, silently corrupting any payload containing a
// 130-byte repeat. Short blocks now stop one below that boundary, which keeps
// 0xFF unambiguous. Streams written by older versions still decode; streams
// written by this one are readable by older decoders.
constexpr size_t kMaxShortMatch = 129;

// The match window is 16-bit, so extended lengths cannot exceed it either.
constexpr size_t kMaxExtendedMatch = 65535;

inline uint32_t load32(const uint8_t* p) {
  uint32_t v;
  std::memcpy(&v, p, sizeof(v));
  return v;
}

inline uint64_t load64(const uint8_t* p) {
  uint64_t v;
  std::memcpy(&v, p, sizeof(v));
  return v;
}

inline int trailing_zero_bytes(uint64_t x) {
#if defined(_MSC_VER)
  unsigned long index;
  _BitScanForward64(&index, x);
  return static_cast<int>(index >> 3);
#else
  return __builtin_ctzll(x) >> 3;
#endif
}

constexpr bool kLittleEndian =
#if defined(__BYTE_ORDER__) && defined(__ORDER_LITTLE_ENDIAN__)
    __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__;
#else
    true;  // every platform this addon builds for is little-endian
#endif

// Compares eight bytes per step instead of one. The XOR of two equal words is
// zero; the first non-zero word locates the mismatching byte directly.
inline size_t common_prefix(const uint8_t* a, const uint8_t* b, size_t limit) {
  size_t i = 0;
  if (kLittleEndian) {
    while (i + 8 <= limit) {
      const uint64_t diff = load64(a + i) ^ load64(b + i);
      if (diff != 0) return i + static_cast<size_t>(trailing_zero_bytes(diff));
      i += 8;
    }
  }
  while (i < limit && a[i] == b[i]) ++i;
  return i;
}

// Flat, power-of-two table holding one candidate position per hash. v0.1 used
// std::unordered_map, which allocated and chased pointers for every byte of
// input; this is a single indexed store.
//
// The table is sized to the input rather than fixed at 64 k entries, because a
// full-size table costs a 256 kB clear that would dwarf the work of
// compressing a 1.5 kB API response.
class MatchFinder {
 public:
  explicit MatchFinder(size_t input_len)
      : bits_(TableBits(input_len)), table_(size_t(1) << bits_, 0) {}

  size_t Find(const uint8_t* data, size_t pos, size_t len, size_t max_match, size_t& dist) {
    if (pos + kMinMatch > len) return 0;

    const uint32_t word = load32(data + pos);
    const size_t slot = Hash(word);
    const uint32_t previous = table_[slot];
    table_[slot] = static_cast<uint32_t>(pos + 1);  // 0 means "empty"

    if (previous == 0) return 0;
    const size_t candidate = previous - 1;
    const size_t d = pos - candidate;
    if (d == 0 || d > kMaxDistance) return 0;
    if (load32(data + candidate) != word) return 0;

    const size_t limit = std::min(len - pos, max_match);
    const size_t matched = common_prefix(data + candidate, data + pos, limit);
    if (matched < kMinMatch) return 0;

    dist = d;
    return matched;
  }

 private:
  static int TableBits(size_t input_len) {
    int bits = 10;
    while ((size_t(1) << bits) < input_len && bits < 16) ++bits;
    return bits;
  }

  // Knuth multiplicative hash. v0.1 called the raw four bytes a hash and fed
  // them to unordered_map, which then hashed them again.
  size_t Hash(uint32_t word) const {
    return (word * 2654435761u) >> (32 - bits_);
  }

  int bits_;
  std::vector<uint32_t> table_;
};

void push16(std::vector<uint8_t>& out, size_t value) {
  out.push_back(static_cast<uint8_t>(value & 0xFF));
  out.push_back(static_cast<uint8_t>((value >> 8) & 0xFF));
}

// Shared body for both encoders. `max_match` bounds how far a match is
// extended; `allow_extended` enables the five-byte block that covers repeats
// too long for a short header.
std::vector<uint8_t> compress_core(const uint8_t* data, size_t len,
                                   size_t max_match, bool allow_extended) {
  std::vector<uint8_t> out;
  out.reserve(len + len / 8 + 16);
  MatchFinder finder(len);

  size_t literal_start = 0;
  size_t i = 0;

  const auto emit_literals = [&](size_t end) {
    while (literal_start < end) {
      const size_t take = std::min(end - literal_start, size_t(127));
      out.push_back(static_cast<uint8_t>(take));
      out.insert(out.end(), data + literal_start, data + literal_start + take);
      literal_start += take;
    }
  };

  while (i + kMinMatch <= len) {
    size_t dist = 0;
    size_t matched = finder.Find(data, i, len, max_match, dist);
    if (matched == 0) {
      ++i;
      continue;
    }

    emit_literals(i);

    if (matched > kMaxShortMatch) {
      if (allow_extended) {
        matched = std::min(matched, kMaxExtendedMatch);
        out.push_back(0xFF);
        push16(out, matched);
        push16(out, dist);
      } else {
        matched = kMaxShortMatch;
        out.push_back(static_cast<uint8_t>(0x80 | (matched - 3)));
        push16(out, dist);
      }
    } else {
      out.push_back(static_cast<uint8_t>(0x80 | (matched - 3)));
      push16(out, dist);
    }

    i += matched;
    literal_start = i;
  }

  emit_literals(len);
  return out;
}

}  // namespace

std::vector<uint8_t> compress(const uint8_t* data, size_t len) {
  return compress_core(data, len, 258, /*allow_extended=*/true);
}

std::vector<uint8_t> compress_fast(const uint8_t* data, size_t len) {
  return compress_core(data, len, 64, /*allow_extended=*/false);
}

// Compression with the substitution transform applied first.
std::vector<uint8_t> compress_json(const uint8_t* data, size_t len) {
  const auto preprocessed = JsonPreprocessor::preprocess(data, len);
  return compress(preprocessed.data(), preprocessed.size());
}

// Advanced mode is the same pipeline. v0.1 chained a second UTF-8 delta pass
// on top, which was not invertible and corrupted every non-ASCII payload; the
// transform now runs exactly once.
std::vector<uint8_t> compress_advanced(const uint8_t* data, size_t len) {
  return compress_json(data, len);
}

}  // namespace cx
