import { config } from './config.js';
import { connectDB } from './db.js';
import { createApp } from './app.js';

async function main() {
  try {
    await connectDB(config.mongoUri);
    console.log(`Connected to MongoDB at ${config.mongoUri}`);

    const app = createApp();
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`Budget Planner API server running on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  }
}

main();
