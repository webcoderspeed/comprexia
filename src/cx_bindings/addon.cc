#include <napi.h>
#include <exception>
#include <vector>
#include "comprexia/encoder.h"
#include "comprexia/decoder.h"
#include "comprexia/stream.h"

namespace {

using CodecFn = std::vector<uint8_t> (*)(const uint8_t*, size_t);
using DecodeFn = std::vector<uint8_t> (*)(const uint8_t*, size_t, size_t);

// Bounds decompression by default. Following Node's own zlib precedent, this is
// an option rather than a hard rule, but the default is a real number: an
// unbounded decoder turns 100 kB of hostile input into more than a gigabyte.
// 256 MB is far above any HTTP payload this is meant for.
constexpr size_t kDefaultMaxOutput = 256u * 1024u * 1024u;

size_t ReadMaxOutput(const Napi::CallbackInfo& info) {
  if (info.Length() < 2 || !info[1].IsObject()) return kDefaultMaxOutput;
  const Napi::Value value = info[1].As<Napi::Object>().Get("maxOutputLength");
  if (!value.IsNumber()) return kDefaultMaxOutput;
  const double requested = value.As<Napi::Number>().DoubleValue();
  if (requested < 0) return kDefaultMaxOutput;
  return static_cast<size_t>(requested);  // 0 disables the limit
}

Napi::Value RunDecoder(const Napi::CallbackInfo& info, DecodeFn fn) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  try {
    const auto out = fn(buf.Data(), buf.Length(), ReadMaxOutput(info));
    return Napi::Buffer<uint8_t>::Copy(env, out.data(), out.size());
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// The decoder throws on malformed input. Letting a C++ exception escape a
// N-API callback terminates the process, so every entry point converts it into
// a catchable JavaScript error — a corrupt response body must not be able to
// take down the server.
Napi::Value RunCodec(const Napi::CallbackInfo& info, CodecFn fn) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  try {
    const auto out = fn(buf.Data(), buf.Length());
    return Napi::Buffer<uint8_t>::Copy(env, out.data(), out.size());
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

class EncWrap : public Napi::ObjectWrap<EncWrap> {
 public:
  static Napi::Function DefineClass(Napi::Env env) {
    return Napi::ObjectWrap<EncWrap>::DefineClass(env, "CxEncoder", {
      EncWrap::InstanceMethod("chunk", &EncWrap::Chunk),
      EncWrap::InstanceMethod("end", &EncWrap::End)
    });
  }
  explicit EncWrap(const Napi::CallbackInfo& info) : Napi::ObjectWrap<EncWrap>(info) {
    cx::encoder_init(state_);
  }

 private:
  cx::EncoderState state_{};

  Napi::Value Chunk(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBuffer()) {
      Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
      return env.Null();
    }
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    try {
      const auto out = cx::encoder_chunk(state_, buf.Data(), buf.Length());
      return Napi::Buffer<uint8_t>::Copy(env, out.data(), out.size());
    } catch (const std::exception& e) {
      Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
      return env.Null();
    }
  }

  Napi::Value End(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    const auto out = cx::encoder_end(state_);
    return Napi::Buffer<uint8_t>::Copy(env, out.data(), out.size());
  }
};

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("compress", Napi::Function::New(env, [](const Napi::CallbackInfo& i) {
    return RunCodec(i, cx::compress);
  }));
  exports.Set("compressJson", Napi::Function::New(env, [](const Napi::CallbackInfo& i) {
    return RunCodec(i, cx::compress_json);
  }));
  exports.Set("compressAdvanced", Napi::Function::New(env, [](const Napi::CallbackInfo& i) {
    return RunCodec(i, cx::compress_advanced);
  }));
  exports.Set("compressFast", Napi::Function::New(env, [](const Napi::CallbackInfo& i) {
    return RunCodec(i, cx::compress_fast);
  }));
  exports.Set("decompress", Napi::Function::New(env, [](const Napi::CallbackInfo& i) {
    return RunDecoder(i, cx::decompress);
  }));
  exports.Set("decompressJson", Napi::Function::New(env, [](const Napi::CallbackInfo& i) {
    return RunDecoder(i, cx::decompress_json);
  }));
  exports.Set("decompressAdvanced", Napi::Function::New(env, [](const Napi::CallbackInfo& i) {
    return RunDecoder(i, cx::decompress_advanced);
  }));

  exports.Set("CxEncoder", EncWrap::DefineClass(env));
  return exports;
}

NODE_API_MODULE(comprexia, Init)
