import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    defaultIncomeAmount: {
      type: Number,
      default: 0
    },
    defaultIncomeCreditDay: {
      type: Number,
      default: 1,
      min: 1,
      max: 31
    },
    defaultSafetyFloor: {
      type: Number,
      default: 0
    },
    defaultUnplannedAllowance: {
      type: Number,
      default: 0
    },
    currencySymbol: {
      type: String,
      default: '$',
      trim: true
    },
    aiAssistantEnabled: {
      type: Boolean,
      default: false // Strictly off by default
    }
  },
  { timestamps: true }
);

export const Setting = mongoose.model('Setting', settingSchema);
