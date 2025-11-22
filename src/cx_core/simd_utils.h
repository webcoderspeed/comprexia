#ifndef COMPREXIA_SIMD_UTILS_H
#define COMPREXIA_SIMD_UTILS_H

#include <cstdint>
#include <vector>

namespace cx {

// SIMD acceleration utilities for x86 and ARM
class SimdUtils {
public:
  // Detect CPU features at runtime
  static bool hasSSE42();
  static bool hasAVX2();
  static bool hasAVX512();
  static bool hasNEON();
  
  // Fast memory operations
  static void memcpy_simd(void* dest, const void* src, size_t size);
  static void memset_simd(void* dest, uint8_t value, size_t size);
  
  // String/pattern matching
  static size_t find_pattern_simd(const uint8_t* data, size_t len, 
                                 const uint8_t* pattern, size_t pattern_len);
  
  // Bit packing utilities
  static void pack_bits_simd(uint8_t* output, const uint32_t* input, 
                            size_t count, int bits_per_value);
  static void unpack_bits_simd(uint32_t* output, const uint8_t* input,
                             size_t count, int bits_per_value);
  
  // Hash computation
  static uint32_t hash_simd(const uint8_t* data, size_t len);
  
  // CRC32 computation
  static uint32_t crc32_simd(const uint8_t* data, size_t len);
};

// Fast bit writer with SIMD acceleration
class BitWriter {
public:
  BitWriter();
  ~BitWriter();
  
  void write_bits(uint32_t value, int bits);
  void write_bytes(const uint8_t* data, size_t len);
  
  std::vector<uint8_t> finish();
  
private:
  std::vector<uint8_t> buffer_;
  uint64_t bit_buffer_ = 0;
  int bit_count_ = 0;
};

// Fast bit reader with SIMD acceleration  
class BitReader {
public:
  BitReader(const uint8_t* data, size_t len);
  
  uint32_t read_bits(int bits);
  void read_bytes(uint8_t* output, size_t len);
  
  size_t bytes_consumed() const;
  
private:
  const uint8_t* data_;
  size_t len_;
  size_t pos_ = 0;
  uint64_t bit_buffer_ = 0;
  int bit_count_ = 0;
};

} // namespace cx

#endif // COMPREXIA_SIMD_UTILS_H