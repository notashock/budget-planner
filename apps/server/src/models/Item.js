import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    monthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Month',
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      enum: ['one-time', 'recurring', 'fuel-log']
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    priority: {
      type: Number,
      default: 0
    },
    // If true, automatically carries forward to the next month on rollover
    isFixed: {
      type: Boolean,
      default: false
    },
    // If true, payment is marked done; if false, payment is pending and cash remains in account
    isPaid: {
      type: Boolean,
      default: false
    },
    // Used for one-time and recurring
    amount: {
      type: Number,
      default: 0
    },
    // For one-time: day of month (-31 to 31, negative values for pre-month events)
    day: {
      type: Number,
      min: -31,
      max: 31
    },
    // For recurring: day of month (1 - 31)
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31
    },
    // For fuel-log items
    fuelStops: [
      {
        date: { type: String, required: true },
        odometer: { type: Number, required: true },
        fuelVolume: { type: Number, required: true },
        fuelCost: { type: Number, required: true }
      }
    ],
    // Account Attribution
    accountType: {
      type: String,
      enum: ['bank', 'wallet', null],
      default: null
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null
    }
  },
  { timestamps: true }
);

export const Item = mongoose.model('Item', itemSchema);
