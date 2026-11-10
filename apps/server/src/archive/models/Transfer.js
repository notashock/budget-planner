import mongoose from 'mongoose';

const transferSchema = new mongoose.Schema(
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
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    // Amount in integer minor units
    amount: {
      type: Number,
      required: true,
      min: 1
    },
    sourceType: {
      type: String,
      enum: ['bank', 'wallet'],
      required: true
    },
    sourceBankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null
    },
    sourceWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null
    },
    destinationType: {
      type: String,
      enum: ['bank', 'wallet'],
      required: true
    },
    destinationBankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null
    },
    destinationWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null
    },
    note: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

transferSchema.index({ userId: 1, monthId: 1, date: 1 });

export const Transfer = mongoose.model('Transfer', transferSchema);
