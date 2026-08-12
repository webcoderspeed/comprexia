#include "comprexia/decoder.h"
#include "preprocessor.h"

#include <cstdint>
#include <cstring>
#include <stdexcept>

namespace cx {

// Decoder for the literal/match stream format described in encoder.cpp.
//
// Every field is validated before use. This function is the only part of the
// library that reads attacker-controlled bytes, so it treats its input as
// hostile: a truncated stream, a zero distance, or a back-reference pointing
// before the start of the output must raise an error rather than read memory
// that does not belong to us.
std::vector<uint8_t> decompress(const uint8_t* data, size_t len, size_t max_output) {
  std::vector<uint8_t> out;
  // Only pre-reserve what the limit allows, so a hostile stream cannot make us
  // allocate gigabytes before the first bounds check runs.
  size_t initial = len * 3;
  if (max_output != kNoOutputLimit && initial > max_output) initial = max_output;
  out.reserve(initial);

  // Checked before every append. Without it, five bytes of extended match block
  // emit 65535 bytes, so 100 kB of crafted input decodes to over a gigabyte.
  const auto guard_output = [&out, max_output](size_t additional) {
    if (max_output != kNoOutputLimit && out.size() + additional > max_output) {
      throw std::runtime_error("comprexia: output exceeds maximum allowed size");
    }
  };

  const auto copy_match = [&out, &guard_output](size_t mlen, size_t dist) {
    guard_output(mlen);
    // dist == 0 would make the back-reference point at the write cursor;
    // dist > out.size() would read before the buffer.
    if (dist == 0 || dist > out.size()) {
      throw std::runtime_error("comprexia: invalid back-reference distance");
    }

    const size_t start = out.size() - dist;

    // Short non-overlapping copies stay on the append path: resizing first
    // costs a zero-fill of the new range that a handful of appends beat.
    // Longer ones amortise that easily and take the block copy.
    if (dist >= mlen && mlen >= 32) {
      const size_t old_size = out.size();
      out.resize(old_size + mlen);
      // resize may reallocate, so both pointers are taken afterwards.
      std::memcpy(out.data() + old_size, out.data() + start, mlen);
    } else {
      // Overlapping matches are how a short pattern encodes a long run, so
      // they must be copied forward one byte at a time to reproduce it.
      // No reserve() here: asking for an exact size defeats the vector's
      // geometric growth and reallocates on nearly every match.
      for (size_t k = 0; k < mlen; ++k) {
        out.push_back(out[start + k]);
      }
    }
  };

  size_t i = 0;
  while (i < len) {
    const uint8_t h = data[i++];

    if (h == 0xFF) {
      if (i + 4 > len) {
        throw std::runtime_error("comprexia: truncated extended match block");
      }
      const size_t mlen = static_cast<size_t>(data[i]) | (static_cast<size_t>(data[i + 1]) << 8);
      i += 2;
      const size_t dist = static_cast<size_t>(data[i]) | (static_cast<size_t>(data[i + 1]) << 8);
      i += 2;
      copy_match(mlen, dist);

    } else if ((h & 0x80) == 0) {
      const size_t count = h;
      if (i + count > len) {
        throw std::runtime_error("comprexia: truncated literal block");
      }
      guard_output(count);
      out.insert(out.end(), data + i, data + i + count);
      i += count;

    } else {
      const size_t mlen = static_cast<size_t>(h & 0x7F) + 3;
      if (i + 2 > len) {
        throw std::runtime_error("comprexia: truncated match block");
      }
      const size_t dist = static_cast<size_t>(data[i]) | (static_cast<size_t>(data[i + 1]) << 8);
      i += 2;
      copy_match(mlen, dist);
    }
  }
  return out;
}

std::vector<uint8_t> decompress_json(const uint8_t* data, size_t len, size_t max_output) {
  const auto decompressed = decompress(data, len, max_output);
  return JsonPreprocessor::postprocess(decompressed.data(), decompressed.size());
}

std::vector<uint8_t> decompress_advanced(const uint8_t* data, size_t len, size_t max_output) {
  const auto decompressed = decompress(data, len, max_output);
  return JsonPreprocessor::postprocess(decompressed.data(), decompressed.size());
}

}  // namespace cx
