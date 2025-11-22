#pragma once
#include <vector>
#include <cstddef>

namespace cx {

// Basic compression (no preprocessing)
std::vector<uint8_t> compress(const uint8_t* data, size_t len);

// Compression with JSON-aware preprocessing
std::vector<uint8_t> compress_json(const uint8_t* data, size_t len);

// Compression with UTF-8 optimization
std::vector<uint8_t> compress_utf8(const uint8_t* data, size_t len);

// Advanced compression with all optimizations
std::vector<uint8_t> compress_advanced(const uint8_t* data, size_t len);

// Ultra-fast compression (reduced match search, lower ratio, higher speed)
std::vector<uint8_t> compress_fast(const uint8_t* data, size_t len);

}