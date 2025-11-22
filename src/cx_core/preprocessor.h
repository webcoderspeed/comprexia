#ifndef COMPREXIA_PREPROCESSOR_H
#define COMPREXIA_PREPROCESSOR_H

#include <vector>
#include <cstdint>

namespace cx {

// JSON structure-aware preprocessing
struct JsonPreprocessor {
  // Detect and transform JSON structure for better compression
  static std::vector<uint8_t> preprocess(const uint8_t* data, size_t len);
  
  // Reverse the preprocessing transformation
  static std::vector<uint8_t> postprocess(const uint8_t* data, size_t len);
  
private:
  // JSON structural token mapping
  enum JsonToken : uint8_t {
    TOK_OBJECT_START = 0xF0,
    TOK_OBJECT_END   = 0xF1,
    TOK_ARRAY_START  = 0xF2,
    TOK_ARRAY_END    = 0xF3,
    TOK_COLON        = 0xF4,
    TOK_COMMA        = 0xF5,
    TOK_QUOTE        = 0xF6,
    TOK_TRUE         = 0xF7,
    TOK_FALSE        = 0xF8,
    TOK_NULL         = 0xF9
  };
  
  // Interned common string token base and count
  static constexpr uint8_t TOK_COMMON_BASE = 0xE0;
  static constexpr size_t TOK_COMMON_MAX = 16;
  
  // Common JSON key/value interning
  static void intern_common_tokens(std::vector<uint8_t>& output, 
                                 const uint8_t* data, size_t len);
  
  // UTF-8 delta encoding for better locality
  static void utf8_delta_encode(std::vector<uint8_t>& output,
                               const uint8_t* data, size_t len);
};

// UTF-8 specific transformations
struct Utf8Transformer {
  // Delta encoding for consecutive UTF-8 characters
  static void delta_encode(std::vector<uint8_t>& output, 
                          const uint8_t* data, size_t len);
  
  // Case folding for better text compression
  static void case_fold(std::vector<uint8_t>& output,
                       const uint8_t* data, size_t len);
};

} // namespace cx

#endif // COMPREXIA_PREPROCESSOR_H