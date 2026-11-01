import mongoose from 'mongoose';

const bankAccountSchema = new mongoose.Schema(
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
    institution: {
      type: String,
      trim: true,
      default: ''
    },
    accountType: {
      type: String,
      enum: ['checking', 'savings', 'salary', 'other'],
      default: 'checking'
    },
    accountNumberMasked: {
      type: String,
      trim: true,
      default: ''
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
    },
    color: {
      type: String,
      default: '#09090b'
    }
  },
  { timestamps: true }
);

bankAccountSchema.index({ userId: 1, isArchived: 1 });

export const BankAccount = mongoose.model('BankAccount', bankAccountSchema);
