import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    walletType: {
      type: String,
      enum: ['cash', 'digital', 'other'],
      default: 'cash'
    },
    // Baseline opening balance in integer minor units
    openingBalance: {
      type: Number,
      default: 0
    },
    // Optional threshold for low-balance alerts
    minimumBalance: {
      type: Number,
      default: 0
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    isArchived: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

walletSchema.index({ userId: 1, isArchived: 1 });

export const Wallet = mongoose.model('Wallet', walletSchema);
