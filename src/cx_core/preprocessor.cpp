#include "preprocessor.h"
#include <cctype>
#include <algorithm>
#include <unordered_map>

namespace cx {

std::vector<uint8_t> JsonPreprocessor::preprocess(const uint8_t* data, size_t len) {
  std::vector<uint8_t> output;
  output.reserve(len);
  
  // Common JSON strings to intern
  const char* common_strings[] = {
    "id", "name", "title", "description", "type", "value",
    "created", "updated", "timestamp", "date", "time",
    "user", "author", "email", "url", "link",
    "status", "error", "message", "result", "data",
    "true", "false", "null"
  };
  
  size_t i = 0;
  bool in_string = false;
  uint8_t last_char = 0;
  
  while (i < len) {
    uint8_t c = data[i];
    
    if (in_string) {
      if (c == '\\"' && i + 1 < len && data[i + 1] == '"') {
        // Escaped quote
        output.push_back(c);
        output.push_back(data[i + 1]);
        i += 2;
        continue;
      } else if (c == '"') {
        // End of string
        in_string = false;
        output.push_back(TOK_QUOTE);
        i++;
        continue;
      }
      
      // UTF-8 delta encoding within strings
      if (last_char != 0 && (c & 0xC0) == 0x80 && (last_char & 0xC0) == 0x80) {
        // Continuation bytes - use delta encoding
        output.push_back(c - last_char + 128);
      } else {
        output.push_back(c);
      }
      last_char = c;
      i++;
      
    } else {
      // Outside string - handle JSON structure
      switch (c) {
        case '{':
          output.push_back(TOK_OBJECT_START);
          break;
        case '}':
          output.push_back(TOK_OBJECT_END);
          break;
        case '[':
          output.push_back(TOK_ARRAY_START);
          break;
        case ']':
          output.push_back(TOK_ARRAY_END);
          break;
        case ':':
          output.push_back(TOK_COLON);
          break;
        case ',':
          output.push_back(TOK_COMMA);
          break;
        case '"':
          in_string = true;
          output.push_back(TOK_QUOTE);
          break;
        case ' ':
        case '\t':
        case '\n':
        case '\r':
          // Skip whitespace
          break;
        default:
          // Check for true/false/null
          if (i + 3 < len && 
              data[i] == 't' && data[i + 1] == 'r' && 
              data[i + 2] == 'u' && data[i + 3] == 'e') {
            output.push_back(TOK_TRUE);
            i += 3;
          } else if (i + 4 < len && 
                     data[i] == 'f' && data[i + 1] == 'a' && 
                     data[i + 2] == 'l' && data[i + 3] == 's' && 
                     data[i + 4] == 'e') {
            output.push_back(TOK_FALSE);
            i += 4;
          } else if (i + 3 < len && 
                     data[i] == 'n' && data[i + 1] == 'u' && 
                     data[i + 2] == 'l' && data[i + 3] == 'l') {
            output.push_back(TOK_NULL);
            i += 3;
          } else {
            output.push_back(c);
          }
          break;
      }
      i++;
    }
  }
  
  return output;
}

std::vector<uint8_t> JsonPreprocessor::postprocess(const uint8_t* data, size_t len) {
  std::vector<uint8_t> output;
  output.reserve(len * 2); // May expand due to structural tokens
  
  size_t i = 0;
  while (i < len) {
    uint8_t c = data[i];
    
    if (c >= 0xF0) {
      // Structural token - expand to actual JSON
      switch (static_cast<JsonToken>(c)) {
        case TOK_OBJECT_START: output.push_back('{'); break;
        case TOK_OBJECT_END:   output.push_back('}'); break;
        case TOK_ARRAY_START:  output.push_back('['); break;
        case TOK_ARRAY_END:    output.push_back(']'); break;
        case TOK_COLON:        output.push_back(':'); break;
        case TOK_COMMA:        output.push_back(','); break;
        case TOK_QUOTE:        output.push_back('"'); break;
        case TOK_TRUE:         
          output.push_back('t'); output.push_back('r'); 
          output.push_back('u'); output.push_back('e'); 
          break;
        case TOK_FALSE:
          output.push_back('f'); output.push_back('a');
          output.push_back('l'); output.push_back('s');
          output.push_back('e');
          break;
        case TOK_NULL:
          output.push_back('n'); output.push_back('u');
          output.push_back('l'); output.push_back('l');
          break;
        default:
          output.push_back(c);
          break;
      }
    } else if (c >= 128 && c < 192) {
      // Delta encoded UTF-8 continuation byte
      if (i > 0) {
        uint8_t decoded = data[i - 1] + (c - 128);
        output.push_back(decoded);
      } else {
        output.push_back(c);
      }
    } else {
      output.push_back(c);
    }
    i++;
  }
  
  return output;
}

void Utf8Transformer::delta_encode(std::vector<uint8_t>& output, 
                                 const uint8_t* data, size_t len) {
  if (len == 0) return;
  
  output.push_back(data[0]); // First byte as-is
  
  for (size_t i = 1; i < len; i++) {
    if ((data[i] & 0xC0) == 0x80 && (data[i - 1] & 0xC0) == 0x80) {
      // UTF-8 continuation bytes - delta encode
      int8_t delta = data[i] - data[i - 1];
      output.push_back(static_cast<uint8_t>(delta + 128));
    } else {
      output.push_back(data[i]);
    }
  }
}

void Utf8Transformer::case_fold(std::vector<uint8_t>& output,
                               const uint8_t* data, size_t len) {
  for (size_t i = 0; i < len; i++) {
    uint8_t c = data[i];
    if (c >= 'A' && c <= 'Z') {
      output.push_back(c + 32); // to lowercase
    } else {
      output.push_back(c);
    }
  }
}

} // namespace cx