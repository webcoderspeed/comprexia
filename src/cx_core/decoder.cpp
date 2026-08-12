#include "comprexia/decoder.h"
#include "block_format.h"
#include "preprocessor.h"

#include <cstdint>
#include <cstring>
#include <memory>
#include <stdexcept>

namespace cx {
namespace {

// Output buffer that always keeps a slack margin past the logical end.
//
// The slack is what makes wildcopy legal: match copies run in fixed 8-byte
// steps and may write up to 7 bytes beyond the match, which is faster than
// stopping exactly on the boundary because it removes the per-byte loop
// condition. std::vector cannot host this — writing past size() within
// capacity is undefined and AddressSanitizer flags it as a container overflow —
// so the buffer is managed directly and copied into a vector once at the end.
class OutputBuffer {
 public:
  static constexpr size_t kSlack = 32;

  size_t size() const { return size_; }
  const uint8_t* data() const { return data_.get(); }

  void Reserve(size_t bytes) { EnsureRoom(bytes); }

  void AppendLiterals(const uint8_t* src, size_t count) {
    EnsureRoom(count);
    std::memcpy(data_.get() + size_, src, count);
    size_ += count;
  }

  // `dist` must already be validated against size().
  void CopyMatch(size_t mlen, size_t dist) {
    EnsureRoom(mlen);
    uint8_t* dst = data_.get() + size_;
    const uint8_t* src = dst - dist;

    if (dist >= 8) {
      // Each 8-byte step reads from at least 8 bytes behind the write cursor,
      // so source and destination never overlap within a step and memcpy is
      // well defined even when the match itself is longer than the distance.
      size_t k = 0;
      do {
        std::memcpy(dst + k, src + k, 8);
        k += 8;
      } while (k < mlen);
    } else {
      // Short distances are run-length patterns: byte-at-a-time is required to
      // reproduce them, since later bytes depend on ones written in this loop.
      for (size_t k = 0; k < mlen; ++k) dst[k] = src[k];
    }
    size_ += mlen;
  }

  std::vector<uint8_t> Release() const {
    std::vector<uint8_t> out;
    out.assign(data_.get(), data_.get() + size_);
    return out;
  }

 private:
  void EnsureRoom(size_t additional) {
    const size_t needed = size_ + additional + kSlack;
    if (needed <= capacity_) return;

    size_t next = capacity_ ? capacity_ * 2 : 4096;
    while (next < needed) next *= 2;

    // new[] rather than make_unique: the latter value-initializes, which would
    // memset the whole buffer on every growth for no benefit.
    std::unique_ptr<uint8_t[]> grown(new uint8_t[next]);
    if (size_ != 0) std::memcpy(grown.get(), data_.get(), size_);
    data_ = std::move(grown);
    capacity_ = next;
  }

  std::unique_ptr<uint8_t[]> data_;
  size_t size_ = 0;
  size_t capacity_ = 0;
};

}  // namespace

// Decoder for the literal/match stream format described in encoder.cpp.
//
// Every field is validated before use. This function is the only part of the
// library that reads attacker-controlled bytes, so it treats its input as
// hostile: a truncated stream, a zero distance, or a back-reference pointing
// before the start of the output must raise an error rather than read memory
// that does not belong to us.
std::vector<uint8_t> decompress(const uint8_t* data, size_t len, size_t max_output) {
  OutputBuffer out;

  // Only pre-reserve what the limit allows, so a hostile stream cannot make us
  // allocate gigabytes before the first bounds check runs.
  size_t initial = len * 3;
  if (max_output != kNoOutputLimit && initial > max_output) initial = max_output;
  out.Reserve(initial);

  // Checked before every append. Without it, five bytes of extended match block
  // emit 65535 bytes, so 100 kB of crafted input decodes to over a gigabyte.
  const auto guard_output = [&out, max_output](size_t additional) {
    if (max_output != kNoOutputLimit && out.size() + additional > max_output) {
      throw std::runtime_error("comprexia: output exceeds maximum allowed size");
    }
  };

  const auto copy_match = [&out, &guard_output](size_t mlen, size_t dist) {
    // dist == 0 would make the back-reference point at the write cursor;
    // dist > out.size() would read before the buffer.
    if (dist == 0 || dist > out.size()) {
      throw std::runtime_error("comprexia: invalid back-reference distance");
    }
    guard_output(mlen);
    out.CopyMatch(mlen, dist);
  };

  size_t i = 0;
  while (i < len) {
    const uint8_t h = data[i++];

    if (h == block::kExtendedMatchMarker) {
      if (i + 4 > len) {
        throw std::runtime_error("comprexia: truncated extended match block");
      }
      const size_t mlen = static_cast<size_t>(data[i]) | (static_cast<size_t>(data[i + 1]) << 8);
      i += 2;
      const size_t dist = static_cast<size_t>(data[i]) | (static_cast<size_t>(data[i + 1]) << 8);
      i += 2;
      copy_match(mlen, dist);

    } else if ((h & 0x80) == 0) {
      const size_t count = h;
      if (i + count > len) {
        throw std::runtime_error("comprexia: truncated literal block");
      }
      guard_output(count);
      out.AppendLiterals(data + i, count);
      i += count;

    } else {
      const size_t mlen = static_cast<size_t>(h & 0x7F) + 3;
      if (i + 2 > len) {
        throw std::runtime_error("comprexia: truncated match block");
      }
      const size_t dist = static_cast<size_t>(data[i]) | (static_cast<size_t>(data[i + 1]) << 8);
      i += 2;
      copy_match(mlen, dist);
    }
  }

  return out.Release();
}

std::vector<uint8_t> decompress_json(const uint8_t* data, size_t len, size_t max_output) {
  const auto decompressed = decompress(data, len, max_output);
  return JsonPreprocessor::postprocess(decompressed.data(), decompressed.size());
}

std::vector<uint8_t> decompress_advanced(const uint8_t* data, size_t len, size_t max_output) {
  const auto decompressed = decompress(data, len, max_output);
  return JsonPreprocessor::postprocess(decompressed.data(), decompressed.size());
}

}  // namespace cx
