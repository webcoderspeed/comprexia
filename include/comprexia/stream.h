#pragma once
#include <vector>
#include <cstddef>
#include <cstdint>
namespace cx {
struct EncoderState {
  std::vector<uint8_t> lit;
};

void encoder_init(EncoderState& s);
std::vector<uint8_t> encoder_chunk(EncoderState& s, const uint8_t* data, size_t len);
std::vector<uint8_t> encoder_end(EncoderState& s);
}