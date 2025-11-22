#include "comprexia/stream.h"
#include <algorithm>

namespace cx {

// Streaming encoder state for literal/match blocks
void encoder_init(EncoderState& s) { s.lit.clear(); }

static void flush_literals(std::vector<uint8_t>& out, std::vector<uint8_t>& lit) {
  if (!lit.empty()) {
    out.push_back(static_cast<uint8_t>(lit.size()));
    out.insert(out.end(), lit.begin(), lit.end());
    lit.clear();
  }
}

std::vector<uint8_t> encoder_chunk(EncoderState& s, const uint8_t* data, size_t len) {
  std::vector<uint8_t> out;
  out.reserve(len + len / 8);
  const size_t window = 4096;
  if (s.lit.capacity() < 127) s.lit.reserve(127);

  auto find_match = [&](size_t pos, size_t& dist) -> size_t {
    const size_t start = (pos > window ? pos - window : 0);
    const size_t max_len = std::min(len - pos, static_cast<size_t>(130));
    size_t best_len = 0;
    size_t best_dist = 0;
    for (size_t s2 = start; s2 + 3 <= pos; ++s2) {
      size_t d = pos - s2;
      size_t m = 0;
      while (m < max_len && data[s2 + m] == data[pos + m]) ++m;
      if (m >= 3 && m > best_len) { best_len = m; best_dist = d; if (best_len == max_len) break; }
    }
    dist = best_dist;
    return best_len;
  };

  size_t i = 0;
  while (i < len) {
    size_t dist = 0;
    size_t mlen = find_match(i, dist);
    if (mlen >= 3) {
      flush_literals(out, s.lit);
      size_t take = std::min(mlen, static_cast<size_t>(130));
      uint8_t header = static_cast<uint8_t>(0x80 | (static_cast<uint8_t>(take - 3)));
      out.push_back(header);
      uint16_t d16 = static_cast<uint16_t>(dist);
      out.push_back(static_cast<uint8_t>(d16 & 0xFF));
      out.push_back(static_cast<uint8_t>((d16 >> 8) & 0xFF));
      i += take;
    } else {
      s.lit.push_back(data[i]);
      ++i;
      if (s.lit.size() == 127) flush_literals(out, s.lit);
    }
  }
  return out;
}

std::vector<uint8_t> encoder_end(EncoderState& s) {
  std::vector<uint8_t> out;
  flush_literals(out, s.lit);
  return out;
}
}