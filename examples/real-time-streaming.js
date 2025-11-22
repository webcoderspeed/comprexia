#!/usr/bin/env node

const { WebSocketServer } = require('ws')
const lib = require('../dist/index.js')

class ComprexiaStreamingServer {
  constructor(port = 8080) {
    this.port = port
    this.wss = new WebSocketServer({ port })
    this.stats = {
      messagesSent: 0,
      bytesSent: 0,
      bytesCompressed: 0,
      compressionRatio: 0,
      connections: 0
    }

    this.setupWebSocketServer()
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws) => {
      this.stats.connections++
      console.log(`🔌 New client connected. Total connections: ${this.stats.connections}`)

      ws.on('message', (data) => {
        // Handle incoming messages (could be compressed)
        try {
          const decompressed = lib.decompress(data)
          const message = JSON.parse(decompressed.toString())
          console.log(`📩 Received: ${message.type}`)
        } catch (error) {
          console.log('📩 Received raw message (not compressed)')
        }
      })

      ws.on('close', () => {
        this.stats.connections--
        console.log(`🔌 Client disconnected. Remaining connections: ${this.stats.connections}`)
      })
    })

    console.log(`🚀 Comprexia Streaming Server running on ws://localhost:${this.port}`)
  }

  // Send real-time market data with compression
  broadcastMarketData() {
    if (this.wss.clients.size === 0) return

    const marketData = this.generateMarketData()
    const jsonData = JSON.stringify(marketData)
    
    // Compress with Comprexia
    const compressed = lib.compress(Buffer.from(jsonData))
    
    this.stats.messagesSent++
    this.stats.bytesSent += jsonData.length
    this.stats.bytesCompressed += compressed.length
    this.stats.compressionRatio = this.stats.bytesCompressed / this.stats.bytesSent

    // Broadcast to all connected clients
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocketServer.OPEN) {
        client.send(compressed)
      }
    })

    if (this.stats.messagesSent % 100 === 0) {
      console.log(`📊 Stats: ${this.stats.messagesSent} msgs | ` +
                 `Ratio: ${this.stats.compressionRatio.toFixed(4)} | ` +
                 `Saved: ${this.formatBytes(this.stats.bytesSent - this.stats.bytesCompressed)}`)
    }
  }

  // Send real-time analytics events
  broadcastAnalyticsEvent(event) {
    if (this.wss.clients.size === 0) return

    const compressed = lib.compress(Buffer.from(JSON.stringify(event)))
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocketServer.OPEN) {
        client.send(compressed)
      }
    })
  }

  generateMarketData() {
    return {
      type: 'market_update',
      timestamp: Date.now(),
      symbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'].map(symbol => ({
        symbol,
        price: (100 + Math.random() * 1000).toFixed(2),
        change: (Math.random() * 10 - 5).toFixed(2),
        volume: Math.floor(Math.random() * 1000000),
        bid: (100 + Math.random() * 1000 - 0.01).toFixed(2),
        ask: (100 + Math.random() * 1000 + 0.01).toFixed(2)
      })),
      indices: [
        { name: 'S&P 500', value: (4000 + Math.random() * 100).toFixed(2), change: (Math.random() * 20 - 10).toFixed(2) },
        { name: 'NASDAQ', value: (12000 + Math.random() * 200).toFixed(2), change: (Math.random() * 30 - 15).toFixed(2) },
        { name: 'DOW JONES', value: (33000 + Math.random() * 300).toFixed(2), change: (Math.random() * 25 - 12).toFixed(2) }
      ]
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

class ComprexiaStreamingClient {
  constructor(url = 'ws://localhost:8080') {
    this.url = url
    this.ws = null
    this.stats = {
      messagesReceived: 0,
      bytesReceived: 0,
      bytesDecompressed: 0,
      decompressionTime: 0
    }
  }

  connect() {
    this.ws = new WebSocket(this.url)

    this.ws.on('open', () => {
      console.log('✅ Connected to Comprexia Streaming Server')
    })

    this.ws.on('message', (data) => {
      this.stats.messagesReceived++
      this.stats.bytesReceived += data.length

      // Measure decompression performance
      const start = Date.now()
      const decompressed = lib.decompress(data)
      const decompressionTime = Date.now() - start
      
      this.stats.decompressionTime += decompressionTime
      this.stats.bytesDecompressed += decompressed.length

      const message = JSON.parse(decompressed.toString())
      
      if (this.stats.messagesReceived % 50 === 0) {
        console.log(`📥 Received ${this.stats.messagesReceived} messages`)
        console.log(`   Avg decompression: ${(this.stats.decompressionTime / this.stats.messagesReceived).toFixed(2)}ms`)
        console.log(`   Compression ratio: ${(data.length / decompressed.length).toFixed(4)}`)
      }
    })

    this.ws.on('close', () => {
      console.log('❌ Disconnected from server')
    })

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error.message)
    })
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const compressed = lib.compress(Buffer.from(JSON.stringify(data)))
      this.ws.send(compressed)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
    }
  }
}

// Demo: Real-time log streaming with compression
class LogStreamCompressor {
  constructor() {
    this.buffer = []
    this.bufferSize = 0
    this.maxBufferSize = 1024 * 1024 // 1MB
  }

  addLog(logEntry) {
    const logData = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: logEntry.level,
      message: logEntry.message,
      context: logEntry.context || {}
    })

    this.buffer.push(logData)
    this.bufferSize += Buffer.byteLength(logData)

    // Compress and send if buffer is full
    if (this.bufferSize >= this.maxBufferSize) {
      this.flush()
    }
  }

  flush() {
    if (this.buffer.length === 0) return

    const logsData = this.buffer.join('\n')
    const originalSize = Buffer.byteLength(logsData)
    
    // Compress with Comprexia
    const compressed = lib.compress(Buffer.from(logsData))
    
    console.log(`📊 Log batch: ${this.buffer.length} logs`)
    console.log(`   Original: ${this.formatBytes(originalSize)}`)
    console.log(`   Compressed: ${this.formatBytes(compressed.length)}`)
    console.log(`   Ratio: ${(compressed.length / originalSize).toFixed(4)}`)
    console.log(`   Saved: ${this.formatBytes(originalSize - compressed.length)}`)

    // Reset buffer
    this.buffer = []
    this.bufferSize = 0

    return compressed
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// Demo usage
if (require.main === module) {
  // Start streaming server
  const server = new ComprexiaStreamingServer(8080)

  // Simulate real-time data broadcasting
  setInterval(() => {
    server.broadcastMarketData()
  }, 100)

  // Simulate log streaming
  const logCompressor = new LogStreamCompressor()
  
  setInterval(() => {
    logCompressor.addLog({
      level: ['INFO', 'WARN', 'ERROR'][Math.floor(Math.random() * 3)],
      message: 'Sample log message ' + Math.random().toString(36).substr(2, 8),
      context: {
        userId: Math.floor(Math.random() * 1000),
        action: ['login', 'purchase', 'view', 'search'][Math.floor(Math.random() * 4)],
        duration: Math.random() * 1000
      }
    })
  }, 10)

  // Flush logs every 5 seconds
  setInterval(() => {
    logCompressor.flush()
  }, 5000)

  console.log('\n🎯 Comprexia Real-time Streaming Demo Running')
  console.log('   • Market data broadcasting every 100ms')
  console.log('   • Log generation every 10ms')
  console.log('   • Log compression every 5 seconds')
  console.log('\n📡 Connect with: new WebSocket("ws://localhost:8080")')
}

module.exports = {
  ComprexiaStreamingServer,
  ComprexiaStreamingClient,
  LogStreamCompressor
}