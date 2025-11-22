#include "comprexia/decoder.h"
#include "preprocessor.h"
#include <cstdint>

namespace cx {

// Decoder for literal/match stream format described in encoder.cpp
std::vector<uint8_t> decompress(const uint8_t* data, size_t len) {
  std::vector<uint8_t> out;
  out.reserve(len * 2);
  size_t i = 0;
  while (i < len) {
    uint8_t h = data[i++];
    if ((h & 0x80) == 0) {
      size_t count = h;
      if (i + count > len) count = len - i;
      out.insert(out.end(), data + i, data + i + count);
      i += count;
    } else {
      size_t mlen = (h & 0x7F) + 3;
      if (i + 2 > len) break;
      uint16_t dist = static_cast<uint16_t>(data[i] | (static_cast<uint16_t>(data[i + 1]) << 8));
      i += 2;
      size_t start = out.size() - dist;
      for (size_t k = 0; k < mlen; ++k) {
        out.push_back(out[start + k]);
      }
    }
  }
  return out;
}

// Decompression with JSON postprocessing
std::vector<uint8_t> decompress_json(const uint8_t* data, size_t len) {
  auto decompressed = decompress(data, len);
  return JsonPreprocessor::postprocess(decompressed.data(), decompressed.size());
}

// Decompression with UTF-8 restoration
std::vector<uint8_t> decompress_utf8(const uint8_t* data, size_t len) {
  auto decompressed = decompress(data, len);
  // Note: UTF-8 delta encoding is symmetric, so we can use the same function
  std::vector<uint8_t> restored;
  Utf8Transformer::delta_encode(restored, decompressed.data(), decompressed.size());
  return restored;
}

// Advanced decompression with all transformations reversed
std::vector<uint8_t> decompress_advanced(const uint8_t* data, size_t len) {
  auto decompressed = decompress(data, len);
  
  // First restore UTF-8 encoding
  std::vector<uint8_t> utf8_restored;
  Utf8Transformer::delta_encode(utf8_restored, decompressed.data(), decompressed.size());
  
  // Then restore JSON structure
  return JsonPreprocessor::postprocess(utf8_restored.data(), utf8_restored.size());
}

}