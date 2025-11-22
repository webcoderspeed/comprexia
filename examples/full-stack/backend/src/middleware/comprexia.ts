import { Request, Response, NextFunction } from 'express';
import { compress } from '@comprexia/cx';

export interface ComprexiaResponse extends Response {
  comprexia?: {
    compressed: boolean;
    originalSize: number;
    compressedSize: number;
    ratio: number;
  };
}

export function createComprexiaMiddleware() {
  return (req: Request, res: ComprexiaResponse, next: NextFunction) => {
    // Store the original json method
    const originalJson = res.json.bind(res);
    
    // Override res.json to add compression support
    res.json = function(body: any) {
      const acceptEncoding = req.headers['accept-encoding'] || '';
      const acceptEncodingStr = acceptEncoding.toString();
      
      // Check if client supports Comprexia (either explicitly or through browser defaults)
      const supportsComprexia = acceptEncodingStr.includes('cx') || 
                               acceptEncodingStr.includes('gzip') ||
                               acceptEncodingStr.includes('deflate') ||
                               acceptEncodingStr.includes('br') ||
                               acceptEncodingStr.includes('zstd');
      
      if (supportsComprexia) {
        try {
          const jsonString = JSON.stringify(body);
          const originalSize = Buffer.byteLength(jsonString, 'utf8');
          
          // Compress the data
          const compressed = compress(Buffer.from(jsonString));
          const compressedSize = compressed.length;
          const ratio = compressedSize / originalSize;
          
          // Set compression headers
          res.setHeader('Content-Encoding', 'cx');
          res.setHeader('X-Compression-Ratio', ratio.toFixed(3));
          res.setHeader('X-Original-Size', originalSize.toString());
          res.setHeader('X-Compressed-Size', compressedSize.toString());
          
          // Store compression metrics
          res.comprexia = {
            compressed: true,
            originalSize,
            compressedSize,
            ratio
          };
          
          // Send compressed data
          return res.set('Content-Type', 'application/json').send(compressed);
        } catch (error) {
          console.warn('Comprexia compression failed, falling back to JSON:', error);
          // Fall back to regular JSON if compression fails
          return originalJson(body);
        }
      }
      
      // No compression requested or supported
      return originalJson(body);
    };
    
    next();
  };
}

export function compressionStatsMiddleware(_req: Request, res: ComprexiaResponse, next: NextFunction) {
  const originalSend = res.send.bind(res);
  
  res.send = function(body: any) {
    if (res.comprexia?.compressed) {
      console.log(`📦 Comprexia Compression: ${res.comprexia.originalSize} → ${res.comprexia.compressedSize} bytes (${(res.comprexia.ratio * 100).toFixed(1)}% ratio)`);
    }
    return originalSend(body);
  };
  
  next();
};