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
      enum: ['Food', 'Travel', 'Health', 'Other'],
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
    }
  },
  { timestamps: true }
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
