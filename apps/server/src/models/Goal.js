import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true
    },
    targetAmount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'scheduled', 'deferred', 'evaluating', 'ready'],
      default: 'active'
    },
    deferredReason: {
      type: String,
      default: null
    },
    priority: {
      type: Number,
      enum: [0, 1, 2],
      default: 0
    },
    // Optional Goal Funding Source
    fundingSourceType: {
      type: String,
      enum: ['bank', 'wallet', null],
      default: null
    },
    fundingBankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null
    },
    fundingWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null
    }
  },
  { timestamps: true }
);

export const Goal = mongoose.model('Goal', goalSchema);
