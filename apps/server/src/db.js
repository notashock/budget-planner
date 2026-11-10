import mongoose from 'mongoose';
import { config, isValidMongoUri } from './config.js';

// Global error listener on Mongoose connection to prevent unhandled background driver rejections
let isListenerAttached = false;
function attachConnectionListeners() {
  if (isListenerAttached) return;
  isListenerAttached = true;
  mongoose.connection.on('error', (err) => {
    console.warn('[Mongoose Driver Notice]:', err?.message || err);
  });
}

export async function connectDB(uri = config.mongoUri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Pre-flight validation: do not attempt connection with invalid or placeholder URIs (e.g. <cluster>)
  if (!isValidMongoUri(uri, config.isProduction)) {
    console.warn('[Database Notice] Invalid or placeholder MongoDB URI provided. Database connection deferred.');
    return null;
  }

  attachConnectionListeners();

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });

  try {
    const { BankAccount } = await import('./archive/models/BankAccount.js');
    if (BankAccount?.syncIndexes) {
      await BankAccount.syncIndexes();
    }
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
