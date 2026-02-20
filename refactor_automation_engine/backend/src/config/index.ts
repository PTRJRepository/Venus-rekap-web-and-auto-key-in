import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../backend/.env') });

export const config = {
  port: parseInt(process.env.PORT || '5001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5174',

  // Database
  dbPath: process.env.DB_PATH || path.join(__dirname, '../../data/venus-automation.db'),

  // Execution
  defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '300000'),
  maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '5'),

  // Puppeteer
  headless: process.env.HEADLESS === 'true',
  chromeMemoryLimit: parseInt(process.env.CHROME_MEMORY_LIMIT || '512'),

  // External API (Venus HR)
  apiBaseUrl: process.env.API_BASE_URL || 'http://127.0.0.1:5000',
  apiTokenQuery: process.env.API_TOKEN_QUERY || ''
};
