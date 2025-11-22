const express = require('express')
const lib = require('../../dist/index.js')

const app = express()
app.use(express.json({ limit: '10mb' }))

// Real-world API endpoints with Comprexia optimization

// 1. E-commerce Product API
app.get('/api/products', (req, res) => {
  const products = [
    {
      id: 1,
      name: "iPhone 15 Pro Max",
      price: 129999,
      category: "electronics",
      inStock: true,
      specifications: {
        display: "6.7-inch Super Retina XDR",
        processor: "A17 Pro",
        storage: "256GB",
        camera: "48MP Main + 12MP Ultra Wide + 12MP Telephoto"
      }
    },
    {
      id: 2,
      name: "Samsung Galaxy S24 Ultra",
      price: 119999,
      category: "electronics",
      inStock: true,
      specifications: {
        display: "6.8-inch Dynamic AMOLED 2X",
        processor: "Snapdragon 8 Gen 3",
        storage: "512GB",
        camera: "200MP Wide + 12MP Ultra Wide + 50MP Telephoto + 10MP Telephoto"
      }
    }
  ]

  const payload = JSON.stringify({
    success: true,
    data: products,
    metadata: {
      total: products.length,
      page: 1,
      limit: 10,
      timestamp: new Date().toISOString()
    }
  })

  // Use Comprexia's JSON-aware compression for API responses
  if (req.headers['accept-encoding']?.includes('cx')) {
    res.setHeader('Content-Encoding', 'cx')
    const compressed = lib.compress(Buffer.from(payload))
    res.type('application/json').send(compressed)
  } else {
    res.type('application/json').send(payload)
  }
})

// 2. User Profile API with nested data
app.get('/api/users/:id', (req, res) => {
  const user = {
    id: parseInt(req.params.id),
    username: "johndoe",
    email: "john.doe@example.com",
    profile: {
      firstName: "John",
      lastName: "Doe",
      age: 30,
      address: {
        street: "123 Main St",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        country: "USA"
      },
      preferences: {
        theme: "dark",
        language: "en",
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      }
    },
    orders: [
      {
        id: "ORD001",
        date: "2024-01-15",
        amount: 299.99,
        status: "delivered",
        items: [
          { productId: 101, quantity: 2, price: 99.99 },
          { productId: 102, quantity: 1, price: 100.00 }
        ]
      }
    ]
  }

  const payload = JSON.stringify({ success: true, data: user })
  
  if (req.headers['accept-encoding']?.includes('cx')) {
    res.setHeader('Content-Encoding', 'cx')
    const compressed = lib.compress(Buffer.from(payload))
    res.type('application/json').send(compressed)
  } else {
    res.type('application/json').send(payload)
  }
})

// 3. Analytics Data API (large datasets)
app.get('/api/analytics/sales', (req, res) => {
  // Generate mock sales data
  const salesData = []
  for (let i = 0; i < 1000; i++) {
    salesData.push({
      date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
      productId: Math.floor(Math.random() * 100) + 1,
      quantity: Math.floor(Math.random() * 10) + 1,
      revenue: Math.random() * 1000,
      region: ['north', 'south', 'east', 'west'][Math.floor(Math.random() * 4)],
      customer: {
        id: Math.floor(Math.random() * 1000) + 1,
        segment: ['new', 'returning', 'vip'][Math.floor(Math.random() * 3)]
      }
    })
  }

  const payload = JSON.stringify({
    success: true,
    data: salesData,
    summary: {
      totalRevenue: salesData.reduce((sum, item) => sum + item.revenue, 0),
      totalOrders: salesData.length,
      averageOrderValue: salesData.reduce((sum, item) => sum + item.revenue, 0) / salesData.length
    }
  })

  // Comprexia handles large JSON datasets exceptionally well
  if (req.headers['accept-encoding']?.includes('cx')) {
    res.setHeader('Content-Encoding', 'cx')
    const compressed = lib.compress(Buffer.from(payload))
    res.type('application/json').send(compressed)
  } else {
    res.type('application/json').send(payload)
  }
})

// 4. Compression benchmark endpoint
app.get('/api/benchmark', (req, res) => {
  const testData = require('./large-sample-data.json') // Sample large dataset
  
  const originalSize = Buffer.byteLength(JSON.stringify(testData))
  const compressed = lib.compress(Buffer.from(JSON.stringify(testData)))
  const compressedSize = compressed.length
  
  const ratio = (compressedSize / originalSize).toFixed(4)
  
  res.json({
    benchmark: "comprexia-json",
    originalSize: `${(originalSize / 1024).toFixed(2)} KB`,
    compressedSize: `${(compressedSize / 1024).toFixed(2)} KB`,
    compressionRatio: ratio,
    spaceSaved: `${((1 - ratio) * 100).toFixed(2)}%`,
    recommendation: ratio < 0.1 ? "Excellent" : ratio < 0.3 ? "Good" : "Average"
  })
})

// 5. File upload with compression
app.post('/api/upload', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const compressed = lib.compress(req.body)
    
    res.json({
      success: true,
      originalSize: req.body.length,
      compressedSize: compressed.length,
      compressionRatio: (compressed.length / req.body.length).toFixed(4),
      message: "File compressed successfully with Comprexia Advanced"
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`🚀 Comprexia Advanced Express Server running on http://localhost:${port}`)
  console.log('📊 Available endpoints:')
  console.log('   GET  /api/products          - E-commerce products API')
  console.log('   GET  /api/users/:id         - User profile with nested data')
  console.log('   GET  /api/analytics/sales   - Large analytics dataset')
  console.log('   GET  /api/benchmark         - Compression benchmark')
  console.log('   POST /api/upload            - File compression')
  console.log('')
  console.log('💡 Tip: Add "Accept-Encoding: cx" header to enable Comprexia compression')
})