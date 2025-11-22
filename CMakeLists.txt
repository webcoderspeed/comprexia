cmake_minimum_required(VERSION 3.20)
project(comprexia)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_library(comprexia SHARED
  src/cx_bindings/addon.cc
  src/cx_core/encoder.cpp
  src/cx_core/decoder.cpp
  src/cx_core/stream.cpp
  src/cx_core/preprocessor.cpp
  src/cx_core/simd_utils.cpp
)

target_include_directories(comprexia PRIVATE ${CMAKE_JS_INC} include node_modules/node-addon-api)
target_link_libraries(comprexia ${CMAKE_JS_LIB})
target_compile_definitions(comprexia PRIVATE NAPI_VERSION=8 NAPI_CPP_EXCEPTIONS)
set_target_properties(comprexia PROPERTIES PREFIX "" SUFFIX ".node")