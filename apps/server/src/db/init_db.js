import pg from 'pg';
const { Client } = pg;

async function init() {
  const c = new Client({ connectionString: 'postgresql://ashok25:Dhathri%4025@localhost:5432/postgres' });
  await c.connect();
  const check = await c.query("SELECT 1 FROM pg_database WHERE datname = 'budget_planner'");
  if (check.rowCount === 0) {
    await c.query('CREATE DATABASE budget_planner');
    console.log('CREATED DATABASE budget_planner');
  } else {
    console.log('DATABASE budget_planner ALREADY EXISTS');
  }
  await c.end();
}

init().catch(console.error);
