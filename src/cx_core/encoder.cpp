#include "comprexia/encoder.h"
#include "preprocessor.h"
#include <cstdint>
#include <algorithm>
#include <vector>
#include <unordered_map>

namespace cx {

// Fast rolling hash function (xxHash inspired)
static inline uint32_t hash4(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}

// Hash chain match finder - O(n) complexity instead of O(n²)
static size_t find_match_fast(const uint8_t* data, size_t pos, size_t len,
                             std::unordered_map<uint32_t, size_t>& table,
                             size_t& match_dist) {
  if (pos + 4 > len) return 0;
  const uint32_t h = hash4(data + pos);
  const auto it = table.find(h);
  size_t best_len = 0;
  size_t best_dist = 0;
  if (it != table.end()) {
    size_t candidate_pos = it->second;
    size_t dist = pos - candidate_pos;
    if (dist <= 65535) {
      if (data[candidate_pos] == data[pos] &&
          data[candidate_pos + 1] == data[pos + 1] &&
          data[candidate_pos + 2] == data[pos + 2] &&
          data[candidate_pos + 3] == data[pos + 3]) {
        const size_t max_len = std::min(len - pos, static_cast<size_t>(258));
        size_t mlen = 4;
        while (mlen < max_len && data[candidate_pos + mlen] == data[pos + mlen]) {
          mlen++;
        }
        best_len = mlen;
        best_dist = dist;
      }
    }
  }
  table[h] = pos;
  match_dist = best_dist;
  return best_len;
}

// Ultrafast: single last position per hash + shorter max match length
static size_t find_match_ultrafast(const uint8_t* data, size_t pos, size_t len,
                                  std::unordered_map<uint32_t, size_t>& table,
                                  size_t& match_dist) {
  if (pos + 4 > len) return 0;
  const uint32_t h = hash4(data + pos);
  const auto it = table.find(h);
  size_t best_len = 0;
  size_t best_dist = 0;
  if (it != table.end()) {
    size_t candidate_pos = it->second;
    size_t dist = pos - candidate_pos;
    if (dist <= 65535) {
      if (*(const uint32_t*)(data + candidate_pos) == *(const uint32_t*)(data + pos)) {
        const size_t max_len = std::min(len - pos, static_cast<size_t>(64));
        size_t mlen = 4;
        while (mlen < max_len && data[candidate_pos + mlen] == data[pos + mlen]) {
          mlen++;
        }
        best_len = mlen;
        best_dist = dist;
      }
    }
  }
  table[h] = pos;
  match_dist = best_dist;
  return best_len;
}

// Format: blocks; literal block: header H (0..127) = count, then count literal bytes
// match block: header H (128..255) where len = (H & 0x7F) + 3, then 2 bytes distance (LE)
std::vector<uint8_t> compress(const uint8_t* data, size_t len) {
  std::vector<uint8_t> out;
  out.reserve(len + len / 8);
  std::unordered_map<uint32_t, size_t> hash_table;
  
  size_t i = 0;
  std::vector<uint8_t> litbuf;
  litbuf.reserve(127);
  
  auto flush_literals = [&]() {
    if (!litbuf.empty()) {
      out.push_back(static_cast<uint8_t>(litbuf.size()));
      out.insert(out.end(), litbuf.begin(), litbuf.end());
      litbuf.clear();
    }
  };
  
  while (i < len) {
    size_t dist = 0;
    size_t mlen = find_match_fast(data, i, len, hash_table, dist);
    
    if (mlen >= 4) {
      flush_literals();
      
      if (mlen > 130) {
        // Extended match block: header 0xFF, then 2 bytes length (LE), then 2 bytes distance (LE)
        out.push_back(static_cast<uint8_t>(0xFF));
        uint16_t l16 = static_cast<uint16_t>(std::min(mlen, static_cast<size_t>(65535)));
        out.push_back(static_cast<uint8_t>(l16 & 0xFF));
        out.push_back(static_cast<uint8_t>((l16 >> 8) & 0xFF));
        uint16_t d16 = static_cast<uint16_t>(dist);
        out.push_back(static_cast<uint8_t>(d16 & 0xFF));
        out.push_back(static_cast<uint8_t>((d16 >> 8) & 0xFF));
        i += l16;
      } else {
        // Encode match in segments up to 130
        size_t enc_len = mlen;
        while (enc_len > 0) {
          size_t take = std::min(enc_len, static_cast<size_t>(130));
          uint8_t header = static_cast<uint8_t>(0x80 | (static_cast<uint8_t>(take - 3)));
          out.push_back(header);
          uint16_t d16 = static_cast<uint16_t>(dist);
          out.push_back(static_cast<uint8_t>(d16 & 0xFF));
          out.push_back(static_cast<uint8_t>((d16 >> 8) & 0xFF));
          i += take;
          enc_len -= take;
        }
      }
    } else {
      litbuf.push_back(data[i]);
      ++i;
      if (litbuf.size() == 127) flush_literals();
    }
  }
  
  flush_literals();
  return out;
}

// Compression with JSON-aware preprocessing
std::vector<uint8_t> compress_json(const uint8_t* data, size_t len) {
  auto preprocessed = JsonPreprocessor::preprocess(data, len);
  return compress(preprocessed.data(), preprocessed.size());
}

// Compression with UTF-8 optimization  
std::vector<uint8_t> compress_utf8(const uint8_t* data, size_t len) {
  std::vector<uint8_t> preprocessed;
  Utf8Transformer::delta_encode(preprocessed, data, len);
  return compress(preprocessed.data(), preprocessed.size());
}

// Advanced compression with all optimizations
std::vector<uint8_t> compress_advanced(const uint8_t* data, size_t len) {
  // First JSON preprocessing
  auto json_processed = JsonPreprocessor::preprocess(data, len);
  
  // Then UTF-8 optimization
  std::vector<uint8_t> fully_processed;
  Utf8Transformer::delta_encode(fully_processed, json_processed.data(), json_processed.size());
  
  return compress(fully_processed.data(), fully_processed.size());
}

// Ultrafast compression variant
std::vector<uint8_t> compress_fast(const uint8_t* data, size_t len) {
  std::vector<uint8_t> out;
  out.reserve(len + len / 8);
  std::unordered_map<uint32_t, size_t> hash_table;

  size_t i = 0;
  std::vector<uint8_t> litbuf;
  litbuf.reserve(127);

  auto flush_literals = [&]() {
    if (!litbuf.empty()) {
      out.push_back(static_cast<uint8_t>(litbuf.size()));
      out.insert(out.end(), litbuf.begin(), litbuf.end());
      litbuf.clear();
    }
  };

  while (i < len) {
    size_t dist = 0;
    size_t mlen = find_match_ultrafast(data, i, len, hash_table, dist);
    if (mlen >= 4) {
      flush_literals();
      // Encode match in segments up to 130
      size_t enc_len = mlen;
      while (enc_len > 0) {
        size_t take = std::min(enc_len, static_cast<size_t>(130));
        uint8_t header = static_cast<uint8_t>(0x80 | (static_cast<uint8_t>(take - 3)));
        out.push_back(header);
        uint16_t d16 = static_cast<uint16_t>(dist);
        out.push_back(static_cast<uint8_t>(d16 & 0xFF));
        out.push_back(static_cast<uint8_t>((d16 >> 8) & 0xFF));
        i += take;
        enc_len -= take;
      }
    } else {
      litbuf.push_back(data[i]);
      ++i;
      if (litbuf.size() == 127) flush_literals();
    }
  }
  flush_literals();
  return out;
}

}