#include "comprexia/decoder.h"
#include "preprocessor.h"
#include <cstdint>
#include <stdexcept>

namespace cx {

// Decoder for the literal/match stream format described in encoder.cpp.
//
// Every field is validated before use. This function is the only part of the
// library that reads attacker-controlled bytes, so it treats its input as
// hostile: a truncated stream, a zero distance, or a back-reference pointing
// before the start of the output must raise an error rather than read memory
// that does not belong to us.
std::vector<uint8_t> decompress(const uint8_t* data, size_t len) {
  std::vector<uint8_t> out;
  out.reserve(len * 2);

  auto copy_match = [&out](size_t mlen, size_t dist) {
    // dist == 0 would make the back-reference point at the write cursor and
    // loop forever; dist > out.size() would read before the buffer.
    if (dist == 0 || dist > out.size()) {
      throw std::runtime_error("comprexia: invalid back-reference distance");
    }
    const size_t start = out.size() - dist;
    // Overlapping copies are legal and intentional (they encode run-length
    // repeats), so this must read through the vector as it grows rather than
    // memcpy a fixed span. Reserving first keeps the reference stable.
    out.reserve(out.size() + mlen);
    for (size_t k = 0; k < mlen; ++k) {
      out.push_back(out[start + k]);
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

std::vector<uint8_t> decompress_json(const uint8_t* data, size_t len) {
  const auto decompressed = decompress(data, len);
  return JsonPreprocessor::postprocess(decompressed.data(), decompressed.size());
}

std::vector<uint8_t> decompress_advanced(const uint8_t* data, size_t len) {
  const auto decompressed = decompress(data, len);
  return JsonPreprocessor::postprocess(decompressed.data(), decompressed.size());
}

}  // namespace cx
