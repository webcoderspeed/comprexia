// Deterministic roundtrip fuzzing for the core codec.
// Built with ASan/UBSan in CI: any OOB read/write or UB in the
// encoder/decoder fails the build even if output happens to match.
//
// Covers every public encode path, including `advanced`, and a malformed-input
// corpus that the decoder must reject without reading out of bounds.

#include "comprexia/encoder.h"
#include "comprexia/decoder.h"

#include <cstdint>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

uint64_t rng_state = 0x9e3779b97f4a7c15ull;

uint64_t next_rand() {
  rng_state ^= rng_state << 13;
  rng_state ^= rng_state >> 7;
  rng_state ^= rng_state << 17;
  return rng_state;
}

std::vector<uint8_t> random_bytes(size_t n) {
  std::vector<uint8_t> v(n);
  for (auto& b : v) b = static_cast<uint8_t>(next_rand());
  return v;
}

std::vector<uint8_t> repetitive_json(size_t records) {
  std::string s = "[";
  for (size_t i = 0; i < records; ++i) {
    s += "{\"id\":" + std::to_string(i) +
         ",\"name\":\"user-" + std::to_string(i % 7) +
         "\",\"active\":true,\"score\":null,\"tags\":[\"a\",\"b\"]},";
  }
  if (records) s.pop_back();
  s += "]";
  return {s.begin(), s.end()};
}

std::vector<uint8_t> unicode_payload() {
  std::string s =
      "{\"name\":\"\u0938\u0902\u091c\u0940\u0935 \u0936\u0930\u094d\u092e\u093e\","
      "\"city\":\"\u0926\u093f\u0932\u094d\u0932\u0940\","
      "\"emoji\":\"\U0001F389\U0001F525\U0001F389\","
      "\"note\":\"caf\u00e9 r\u00e9sum\u00e9\","
      "\"path\":\"C:\\\\Users\\\\test\\\\\"}";
  return {s.begin(), s.end()};
}

// Inputs built specifically to break the substitution transform: bytes that
// collide with the token range, a stray escape byte, and truncated keywords.
std::vector<uint8_t> adversarial_tokens() {
  std::vector<uint8_t> v;
  for (int b = 0xE0; b <= 0xFF; ++b) v.push_back(static_cast<uint8_t>(b));
  const std::string s = "\"id\"\"name\"truefalsenulltru fals nul \"id";
  v.insert(v.end(), s.begin(), s.end());
  for (int b = 0xFF; b >= 0xE0; --b) v.push_back(static_cast<uint8_t>(b));
  return v;
}

int failures = 0;

void check(const char* name, const std::vector<uint8_t>& input,
           std::vector<uint8_t> (*encode)(const uint8_t*, size_t),
           std::vector<uint8_t> (*decode)(const uint8_t*, size_t)) {
  const auto compressed = encode(input.data(), input.size());
  const auto restored = decode(compressed.data(), compressed.size());
  if (restored != input) {
    std::fprintf(stderr, "FAIL %s: %zu bytes in, %zu bytes back\n",
                 name, input.size(), restored.size());
    ++failures;
  }
}

void check_all(const char* label, const std::vector<uint8_t>& input) {
  check(label, input, cx::compress, cx::decompress);
  check(label, input, cx::compress_fast, cx::decompress);
  check(label, input, cx::compress_advanced, cx::decompress_advanced);
}

// The decoder must reject hostile streams by throwing, never by reading past
// the end of its input or before the start of its output.
void check_rejects(const char* name, const std::vector<uint8_t>& stream) {
  try {
    const auto out = cx::decompress(stream.data(), stream.size());
    std::fprintf(stderr, "FAIL %s: accepted malformed stream, produced %zu bytes\n",
                 name, out.size());
    ++failures;
  } catch (const std::runtime_error&) {
    // expected
  }
}

}  // namespace

int main() {
  check_all("empty", {});
  check_all("unicode", unicode_payload());
  check_all("adversarial tokens", adversarial_tokens());

  for (size_t records : {0u, 1u, 50u, 3000u}) {
    check_all("json", repetitive_json(records));
  }

  // Every single byte value, alone — catches off-by-one escaping.
  for (int b = 0; b <= 0xFF; ++b) {
    check_all("single byte", {static_cast<uint8_t>(b)});
  }

  // Every match length in and around the block-encoding boundaries. Random
  // fuzzing missed that a 130-byte match encodes as header 0xFF — the
  // extended-match marker — and decoded as garbage. A length sweep finds that
  // class of bug immediately, where random data almost never lands on the one
  // length that breaks.
  for (size_t run = 1; run <= 320; ++run) {
    std::vector<uint8_t> pattern(run);
    for (size_t k = 0; k < run; ++k) pattern[k] = static_cast<uint8_t>(k * 7 + 11);

    // Two copies followed by a byte that cannot continue the match, so the
    // match length is exactly `run`.
    for (uint8_t terminator : {uint8_t{0x00}, uint8_t{0x42}}) {
      std::vector<uint8_t> input;
      input.insert(input.end(), pattern.begin(), pattern.end());
      input.insert(input.end(), pattern.begin(), pattern.end());
      input.push_back(terminator);
      check_all("exact match length", input);
    }
  }

  for (int round = 0; round < 200; ++round) {
    const size_t len = static_cast<size_t>(next_rand() % 8192);
    const auto data = random_bytes(len);
    check_all("random", data);

    // Bias toward repetition so match blocks are exercised heavily.
    if (len > 16) {
      std::vector<uint8_t> rep;
      rep.reserve(len * 4);
      for (int k = 0; k < 4; ++k) rep.insert(rep.end(), data.begin(), data.end());
      check_all("repeated", rep);
    }
  }

  // Malformed streams. Each one targets a specific unchecked field in v0.1.
  check_rejects("match with no output to reference", {0x85, 0xFF, 0xFF});
  check_rejects("zero distance", {0x85, 0x00, 0x00});
  check_rejects("truncated match header", {0x85, 0x01});
  check_rejects("truncated extended match", {0xFF, 0x10, 0x00, 0x01});
  check_rejects("literal run past end", {0x40, 0x01, 0x02});
  check_rejects("distance beyond output", {0x01, 0x41, 0x85, 0x10, 0x00});

  // Random bytes are usually malformed; they must throw or decode, never crash.
  for (int round = 0; round < 2000; ++round) {
    const auto junk = random_bytes(static_cast<size_t>(next_rand() % 64));
    try {
      cx::decompress(junk.data(), junk.size());
    } catch (const std::runtime_error&) {
      // expected for most inputs
    }
  }

  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return 1;
  }
  std::puts("all roundtrips ok");
  return 0;
}
