// Deterministic roundtrip fuzzing for the core codec.
// Built with ASan/UBSan in CI: any OOB read/write or UB in the
// encoder/decoder fails the build even if output happens to match.
//
// Covers compress/compress_fast -> decompress. The `advanced`
// preprocessing pipeline is excluded until its transforms are
// byte-exact reversible (tracked in docs/DESIGN.md).

#include "comprexia/encoder.h"
#include "comprexia/decoder.h"

#include <cstdint>
#include <cstdio>
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

int failures = 0;

void check(const char* name, const std::vector<uint8_t>& input,
           std::vector<uint8_t> (*encode)(const uint8_t*, size_t)) {
  auto compressed = encode(input.data(), input.size());
  auto restored = cx::decompress(compressed.data(), compressed.size());
  if (restored != input) {
    std::fprintf(stderr, "FAIL %s: %zu bytes in, %zu bytes back\n",
                 name, input.size(), restored.size());
    ++failures;
  }
}

}  // namespace

int main() {
  check("empty", {}, cx::compress);
  check("empty fast", {}, cx::compress_fast);

  auto uni = unicode_payload();
  check("unicode", uni, cx::compress);
  check("unicode fast", uni, cx::compress_fast);

  for (size_t records : {0u, 1u, 50u, 3000u}) {
    auto json = repetitive_json(records);
    check("json", json, cx::compress);
    check("json fast", json, cx::compress_fast);
  }

  for (int round = 0; round < 200; ++round) {
    size_t len = static_cast<size_t>(next_rand() % 8192);
    auto data = random_bytes(len);
    check("random", data, cx::compress);
    check("random fast", data, cx::compress_fast);

    // Bias toward repetition so match blocks are exercised heavily.
    if (len > 16) {
      std::vector<uint8_t> rep;
      rep.reserve(len * 4);
      for (int k = 0; k < 4; ++k) rep.insert(rep.end(), data.begin(), data.end());
      check("repeated", rep, cx::compress);
      check("repeated fast", rep, cx::compress_fast);
    }
  }

  if (failures) {
    std::fprintf(stderr, "%d roundtrip failure(s)\n", failures);
    return 1;
  }
  std::puts("all roundtrips ok");
  return 0;
}
