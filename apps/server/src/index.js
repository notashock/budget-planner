import { config } from './config.js';
import { connectDB } from './db.js';
import { createApp } from './app.js';

// Resolve port strictly from process.env.PORT as required by Vercel / Cloud PaaS
const PORT = process.env.PORT ? Number(process.env.PORT) : (config.port || 4000);
const HOST = '0.0.0.0';

const app = createApp();

// Start HTTP server immediately so Vercel, Docker, Railway, or local runners accept TCP connections instantly (<100ms)
const server = app.listen(PORT, HOST, () => {
  console.log(`Budget Planner API server running on http://${HOST}:${PORT} (process.env.PORT=${process.env.PORT || 'unset'})`);
});

// Non-blocking database initialization with graceful error handling and auto-reconnect
async function initDatabase() {
  const uri = config.mongoUri;
  try {
    await connectDB(uri);
    console.log(`Connected to MongoDB at ${uri}`);
  } catch (err) {
    console.warn(`[Startup Notice] Database connection deferred/failed: ${err.message}`);
    console.log('Server is accepting TCP connections. Will retry connecting to MongoDB in 5 seconds...');
    setTimeout(initDatabase, 5000);
  }
}

initDatabase();

// Handle graceful termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed cleanly');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed cleanly');
    process.exit(0);
  });
});

export { app, server };
