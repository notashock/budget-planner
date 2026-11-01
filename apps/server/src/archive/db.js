import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDB(uri = config.mongoUri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  await mongoose.connect(uri);

  try {
    const { BankAccount } = await import('./models/BankAccount.js');
    await BankAccount.syncIndexes();
  } catch (syncErr) {
    console.warn('BankAccount syncIndexes notice:', syncErr.message);
  }

  return mongoose.connection;
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
