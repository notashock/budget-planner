import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { createApp } from './app.js';

async function main() {
  try {
    console.log('Ensuring PostgreSQL database migrations are applied...');
    await runMigrations();

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
