import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { createApp } from './app.js';
import { SalaryCycleJob } from './services/salaryCycleJob.js';

async function main() {
  try {
    console.log('Ensuring PostgreSQL database migrations are applied...');
    await runMigrations();

    // Run salary cycle check on server startup
    try {
      console.log('Running initial SalaryCycleJob check...');
      await SalaryCycleJob.runJob();
    } catch (jobErr) {
      console.error('Initial SalaryCycleJob run failed:', jobErr);
    }

    // Run SalaryCycleJob every hour
    setInterval(async () => {
      try {
        await SalaryCycleJob.runJob();
      } catch (err) {
        console.error('Periodic SalaryCycleJob error:', err);
      }
    }, 60 * 60 * 1000);

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
