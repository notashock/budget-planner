import mongoose from 'mongoose';

const monthSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    year: {
      type: Number,
      required: true
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    openingBalance: {
      type: Number,
      default: 0
    },
    incomeAmount: {
      type: Number,
      default: 0
    },
    incomeCreditDate: {
      type: String,
      default: null,
      trim: true
    },
    incomeCreditDay: {
      type: Number,
      default: 1,
      min: 1,
      max: 31
    },
    safetyFloor: {
      type: Number,
      default: 0
    },
    unplannedAllowance: {
      type: Number,
      default: 0
    },
    currencySymbol: {
      type: String,
      default: '₹'
    }
  },
  { timestamps: true }
);

monthSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

export const Month = mongoose.model('Month', monthSchema);
