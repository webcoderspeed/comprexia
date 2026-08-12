#pragma once
#include <vector>
#include <cstddef>
#include <cstdint>

namespace cx {

// Passing 0 as max_output disables the limit. Callers handling untrusted input
// should always pass a real bound: an extended match block costs five bytes and
// can emit 65535, so a crafted stream expands by more than 13000x and exhausts
// memory long before it finishes decoding.
constexpr size_t kNoOutputLimit = 0;

std::vector<uint8_t> decompress(const uint8_t* data, size_t len,
                                size_t max_output = kNoOutputLimit);

std::vector<uint8_t> decompress_json(const uint8_t* data, size_t len,
                                     size_t max_output = kNoOutputLimit);

std::vector<uint8_t> decompress_advanced(const uint8_t* data, size_t len,
                                         size_t max_output = kNoOutputLimit);

}  // namespace cx
