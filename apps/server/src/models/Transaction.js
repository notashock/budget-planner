import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
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
    // Amount in integer minor units (positive for expense, negative for refund)
    amount: {
      type: Number,
      required: true
    },
    tag: {
      type: String,
      enum: ['Food', 'Travel', 'Health', 'Salary', 'Freelance', 'Bonus', 'Investment', 'Other'],
      default: 'Other'
    },
    note: {
      type: String,
      trim: true,
      default: ''
    },
    // If null, marks unexpected/unplanned spending drawing down unplanned allowance
    // If set, links to and fulfills a planned item
    plannedItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      default: null
    },
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
    },
    // If true, marks an ad-hoc income receipt credited to an account
    isIncome: {
      type: Boolean,
      default: false
    },
    // Links to a Paired Account Transfer if generated from a transfer
    transferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transfer',
      default: null
    }
  },
  { timestamps: true }
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
