#include <napi.h>
#include "comprexia/encoder.h"
#include "comprexia/decoder.h"
#include "comprexia/stream.h"

class EncWrap : public Napi::ObjectWrap<EncWrap> {
 public:
  static Napi::Function DefineClass(Napi::Env env) {
    return Napi::ObjectWrap<EncWrap>::DefineClass(env, "CxEncoder", {
      EncWrap::InstanceMethod("chunk", &EncWrap::Chunk),
      EncWrap::InstanceMethod("end", &EncWrap::End)
    });
  }
  EncWrap(const Napi::CallbackInfo& info) : Napi::ObjectWrap<EncWrap>(info) {
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
    auto outVec = cx::encoder_chunk(state_, buf.Data(), buf.Length());
    return Napi::Buffer<uint8_t>::Copy(env, outVec.data(), outVec.size());
  }
  Napi::Value End(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto outVec = cx::encoder_end(state_);
    return Napi::Buffer<uint8_t>::Copy(env, outVec.data(), outVec.size());
  }
};

Napi::Value Compress(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  auto outVec = cx::compress(buf.Data(), buf.Length());
  return Napi::Buffer<uint8_t>::Copy(env, outVec.data(), outVec.size());
}

Napi::Value CompressJson(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  auto outVec = cx::compress_json(buf.Data(), buf.Length());
  return Napi::Buffer<uint8_t>::Copy(env, outVec.data(), outVec.size());
}

Napi::Value CompressAdvanced(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  auto outVec = cx::compress_advanced(buf.Data(), buf.Length());
  return Napi::Buffer<uint8_t>::Copy(env, outVec.data(), outVec.size());
}

Napi::Value Decompress(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  auto outVec = cx::decompress(buf.Data(), buf.Length());
  return Napi::Buffer<uint8_t>::Copy(env, outVec.data(), outVec.size());
}

Napi::Value DecompressJson(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  auto outVec = cx::decompress_json(buf.Data(), buf.Length());
  return Napi::Buffer<uint8_t>::Copy(env, outVec.data(), outVec.size());
}

Napi::Value DecompressAdvanced(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  auto buf = info[0].As<Napi::Buffer<uint8_t>>();
  auto outVec = cx::decompress_advanced(buf.Data(), buf.Length());
  return Napi::Buffer<uint8_t>::Copy(env, outVec.data(), outVec.size());
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("compress", Napi::Function::New(env, Compress));
  exports.Set("compressJson", Napi::Function::New(env, CompressJson));
  exports.Set("compressAdvanced", Napi::Function::New(env, CompressAdvanced));
  exports.Set("decompress", Napi::Function::New(env, Decompress));
  exports.Set("decompressJson", Napi::Function::New(env, DecompressJson));
  exports.Set("decompressAdvanced", Napi::Function::New(env, DecompressAdvanced));
  
  auto cls = EncWrap::DefineClass(env);
  exports.Set("CxEncoder", cls);
  
  return exports;
}

NODE_API_MODULE(comprexia, Init)