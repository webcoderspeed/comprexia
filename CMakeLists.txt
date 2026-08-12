cmake_minimum_required(VERSION 3.20)
project(comprexia)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_library(comprexia SHARED
  src/cx_bindings/addon.cc
  src/cx_core/encoder.cpp
  src/cx_core/decoder.cpp
  src/cx_core/stream.cpp
  src/cx_core/preprocessor.cpp
  src/cx_core/simd_utils.cpp
)

# Ask node where node-addon-api actually lives. Hardcoding
# "node_modules/node-addon-api" only works when the dependency is nested inside
# this package, which is true in the repo and false for every consumer — npm
# hoists it to the top-level node_modules, and the build failed with
# "napi.h file not found" at install time.
execute_process(
  COMMAND node -p "require('node-addon-api').include_dir"
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
  RESULT_VARIABLE NODE_ADDON_API_RESULT
)
if(NOT NODE_ADDON_API_RESULT EQUAL 0)
  message(FATAL_ERROR "Could not locate node-addon-api. Is it installed?")
endif()

target_include_directories(comprexia PRIVATE ${CMAKE_JS_INC} include ${NODE_ADDON_API_DIR})
target_link_libraries(comprexia ${CMAKE_JS_LIB})
target_compile_definitions(comprexia PRIVATE NAPI_VERSION=8 NAPI_CPP_EXCEPTIONS)
set_target_properties(comprexia PROPERTIES PREFIX "" SUFFIX ".node")