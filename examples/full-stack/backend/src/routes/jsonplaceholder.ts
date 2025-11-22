import express from 'express';
import axios from 'axios';

const router = express.Router();

// Base URL for JSONPlaceholder API
const JSON_PLACEHOLDER_BASE_URL = 'https://jsonplaceholder.typicode.com';

// Create axios instance for JSONPlaceholder API
const jsonPlaceholderClient = axios.create({
  baseURL: JSON_PLACEHOLDER_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Get all posts
router.get('/posts', async (_req, res, next) => {
  try {
    const { data } = await jsonPlaceholderClient.get('/posts');
    res.json({
      success: true,
      data: data,
      metadata: {
        count: data.length,
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single post by ID
router.get('/posts/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data } = await jsonPlaceholderClient.get(`/posts/${id}`);
    res.json({
      success: true,
      data: data,
      metadata: {
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all users
router.get('/users', async (_req, res, next) => {
  try {
    const { data } = await jsonPlaceholderClient.get('/users');
    res.json({
      success: true,
      data: data,
      metadata: {
        count: data.length,
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single user by ID
router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data } = await jsonPlaceholderClient.get(`/users/${id}`);
    res.json({
      success: true,
      data: data,
      metadata: {
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all comments
router.get('/comments', async (_req, res, next) => {
  try {
    const { data } = await jsonPlaceholderClient.get('/comments');
    res.json({
      success: true,
      data: data,
      metadata: {
        count: data.length,
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get comments for specific post
router.get('/posts/:id/comments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data } = await jsonPlaceholderClient.get(`/posts/${id}/comments`);
    res.json({
      success: true,
      data: data,
      metadata: {
        count: data.length,
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all albums
router.get('/albums', async (_req, res, next) => {
  try {
    const { data } = await jsonPlaceholderClient.get('/albums');
    res.json({
      success: true,
      data: data,
      metadata: {
        count: data.length,
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all photos
router.get('/photos', async (_req, res, next) => {
  try {
    const { data } = await jsonPlaceholderClient.get('/photos');
    res.json({
      success: true,
      data: data,
      metadata: {
        count: data.length,
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all todos
router.get('/todos', async (_req, res, next) => {
  try {
    const { data } = await jsonPlaceholderClient.get('/todos');
    res.json({
      success: true,
      data: data,
      metadata: {
        count: data.length,
        source: 'jsonplaceholder',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Error handling for this router
router.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('JSONPlaceholder API Error:', error);
  
  if (error.response) {
    // The request was made and the server responded with a status code
    res.status(error.response.status).json({
      success: false,
      error: {
        message: error.response.data?.message || 'JSONPlaceholder API Error',
        status: error.response.status,
        data: error.response.data
      }
    });
  } else if (error.request) {
    // The request was made but no response was received
    res.status(503).json({
      success: false,
      error: {
        message: 'JSONPlaceholder API is not responding',
        status: 503
      }
    });
  } else {
    // Something happened in setting up the request
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        status: 500
      }
    });
  }
});

export { router as jsonPlaceholderRouter };