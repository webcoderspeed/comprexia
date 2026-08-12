#ifndef COMPREXIA_PREPROCESSOR_H
#define COMPREXIA_PREPROCESSOR_H

#include <vector>
#include <cstdint>
#include <cstddef>

namespace cx {

// Byte-exact substitution transform applied before the LZ stage.
//
// The v0.1 version of this file tried to be a JSON parser: it tracked string
// state, stripped whitespace, and delta-encoded UTF-8 continuation bytes. All
// three were unsound. Whitespace stripping made the transform lossy; the delta
// values landed in the ASCII range and became indistinguishable from real
// text; and the token range collided with UTF-8 lead bytes, so Devanagari
// decoded as English key names.
//
// This version makes no claim about JSON structure at all. It replaces fixed
// byte sequences with single-byte tokens and escapes any input byte that could
// be mistaken for one. Invertibility does not depend on the input being valid
// JSON, on quoting, or on nesting — which is exactly why it can be fuzzed
// against arbitrary bytes.
//
//   0xE0..0xEF  interned literal (including its surrounding quotes)
//   0xF0        "true"      0xF1  "false"      0xF2  "null"
//   0xFF        escape: the following byte is literal
//
// Any input byte >= 0xE0 is emitted as [0xFF][byte].
struct JsonPreprocessor {
  static std::vector<uint8_t> preprocess(const uint8_t* data, size_t len);
  static std::vector<uint8_t> postprocess(const uint8_t* data, size_t len);

  static constexpr uint8_t TOK_COMMON_BASE = 0xE0;
  static constexpr uint8_t TOK_TRUE = 0xF0;
  static constexpr uint8_t TOK_FALSE = 0xF1;
  static constexpr uint8_t TOK_NULL = 0xF2;
  static constexpr uint8_t TOK_ESCAPE = 0xFF;
  static constexpr uint8_t ESCAPE_THRESHOLD = 0xE0;
};

}  // namespace cx

#endif  // COMPREXIA_PREPROCESSOR_H
