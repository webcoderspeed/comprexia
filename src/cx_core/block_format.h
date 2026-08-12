#ifndef COMPREXIA_BLOCK_FORMAT_H
#define COMPREXIA_BLOCK_FORMAT_H

#include <algorithm>
#include <cstdint>
#include <vector>

// The single definition of how blocks are written to the wire.
//
// This header exists because the format was previously implemented twice — once
// in encoder.cpp and once in stream.cpp — and the two drifted. A match of
// exactly 130 bytes encodes as 0x80|127 == 0xFF, which is the extended-match
// marker, so the decoder misreads it and silently corrupts data. That was fixed
// in the one-shot encoder and missed in the streaming one, which shipped the
// bug for any payload containing a 130-byte repeat.
//
// Every encoder now emits through these functions. Adding a third encoder is
// safe; hand-rolling the byte layout again is not.
namespace cx {
namespace block {

// The format's own minimum; individual encoders may require longer matches.
constexpr size_t kMinMatch = 3;
constexpr size_t kMaxDistance = 65535;
constexpr size_t kMaxLiteralRun = 127;

// 130 would encode as 0xFF and collide with the extended-match marker.
constexpr size_t kMaxShortMatch = 129;
constexpr size_t kMaxExtendedMatch = 65535;

constexpr uint8_t kExtendedMatchMarker = 0xFF;

inline void push16(std::vector<uint8_t>& out, size_t value) {
  out.push_back(static_cast<uint8_t>(value & 0xFF));
  out.push_back(static_cast<uint8_t>((value >> 8) & 0xFF));
}

inline void emit_literals(std::vector<uint8_t>& out, const uint8_t* data,
                          size_t begin, size_t end) {
  while (begin < end) {
    const size_t take = std::min(end - begin, kMaxLiteralRun);
    out.push_back(static_cast<uint8_t>(take));
    out.insert(out.end(), data + begin, data + begin + take);
    begin += take;
  }
}

// Flushes a pending literal buffer, splitting runs that exceed one block.
inline void emit_literal_buffer(std::vector<uint8_t>& out, std::vector<uint8_t>& literals) {
  if (!literals.empty()) {
    emit_literals(out, literals.data(), 0, literals.size());
    literals.clear();
  }
}

// Writes one match block and returns how many input bytes it covers, which is
// less than `mlen` when the match is too long for a short block and extended
// blocks are not enabled.
inline size_t emit_match(std::vector<uint8_t>& out, size_t mlen, size_t dist,
                         bool allow_extended) {
  if (mlen > kMaxShortMatch) {
    if (allow_extended) {
      mlen = std::min(mlen, kMaxExtendedMatch);
      out.push_back(kExtendedMatchMarker);
      push16(out, mlen);
      push16(out, dist);
      return mlen;
    }
    mlen = kMaxShortMatch;
  }
  out.push_back(static_cast<uint8_t>(0x80 | (mlen - 3)));
  push16(out, dist);
  return mlen;
}

}  // namespace block
}  // namespace cx

#endif  // COMPREXIA_BLOCK_FORMAT_H
