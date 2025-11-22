import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createComprexiaMiddleware } from './middleware/comprexia';
import { decompress } from '@comprexia/cx';
import { jsonPlaceholderRouter } from './routes/jsonplaceholder';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Logging
app.use(morgan('combined'));

// Standard compression (gzip)
app.use(compression());

// Comprexia compression middleware
app.use(createComprexiaMiddleware());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Raw body parser for Comprexia decode endpoint
app.use('/api/decode', express.raw({ type: 'application/octet-stream', limit: '10mb' }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'comprexia-fullstack-backend'
  });
});

// API routes
app.use('/api', jsonPlaceholderRouter);

// Comprexia decode endpoint
app.post('/api/decode', (req, res) => {
  try {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body as any);
    const out = decompress(buf);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'identity');
    return res.send(out);
  } catch (e: any) {
    console.error('Comprexia decode failed:', e);
    return res.status(400).json({ error: 'Invalid compressed payload' });
  }
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 JSONPlaceholder API: http://localhost:${PORT}/api`);
});

export default app;