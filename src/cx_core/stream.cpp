#include "comprexia/stream.h"
#include "block_format.h"

#include <algorithm>

namespace cx {
namespace {

// Matches are searched within the current chunk only, so repeated structure
// between chunks is not exploited. That is a ratio limitation, not a
// correctness one: distances are chunk-relative, and because the decoder's
// output preserves chunk order, a relative distance resolves to the same bytes.
constexpr size_t kWindow = 4096;
constexpr size_t kStreamMinMatch = block::kMinMatch;

}  // namespace

void encoder_init(EncoderState& s) { s.lit.clear(); }

std::vector<uint8_t> encoder_chunk(EncoderState& s, const uint8_t* data, size_t len) {
  std::vector<uint8_t> out;
  out.reserve(len + len / 8 + 16);

  const auto find_match = [&](size_t pos, size_t& dist) -> size_t {
    const size_t start = (pos > kWindow ? pos - kWindow : 0);
    // Bounded by the largest match a single block can carry, so the encoder
    // never produces a length it cannot represent.
    const size_t max_len = std::min(len - pos, block::kMaxShortMatch);
    size_t best_len = 0;
    size_t best_dist = 0;
    for (size_t candidate = start; candidate + kStreamMinMatch <= pos; ++candidate) {
      size_t m = 0;
      while (m < max_len && data[candidate + m] == data[pos + m]) ++m;
      if (m >= kStreamMinMatch && m > best_len) {
        best_len = m;
        best_dist = pos - candidate;
        if (best_len == max_len) break;
      }
    }
    dist = best_dist;
    return best_len;
  };

  size_t i = 0;
  while (i < len) {
    size_t dist = 0;
    const size_t mlen = find_match(i, dist);
    if (mlen >= kStreamMinMatch) {
      block::emit_literal_buffer(out, s.lit);
      i += block::emit_match(out, mlen, dist, /*allow_extended=*/false);
    } else {
      s.lit.push_back(data[i]);
      ++i;
      if (s.lit.size() == block::kMaxLiteralRun) block::emit_literal_buffer(out, s.lit);
    }
  }
  return out;
}

std::vector<uint8_t> encoder_end(EncoderState& s) {
  std::vector<uint8_t> out;
  block::emit_literal_buffer(out, s.lit);
  return out;
}

}  // namespace cx
