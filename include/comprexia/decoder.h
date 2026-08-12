#pragma once
#include <vector>
#include <cstddef>
#include <cstdint>

namespace cx {

// Basic decompression
std::vector<uint8_t> decompress(const uint8_t* data, size_t len);

// Decompression with JSON postprocessing
std::vector<uint8_t> decompress_json(const uint8_t* data, size_t len);

// Advanced decompression with all transformations reversed
std::vector<uint8_t> decompress_advanced(const uint8_t* data, size_t len);

}