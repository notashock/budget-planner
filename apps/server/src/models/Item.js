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
      enum: ['one-time', 'recurring', 'formula']
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
    // Used for one-time and recurring
    amount: {
      type: Number,
      default: 0
    },
    // For one-time: day of month (1 - 31)
    day: {
      type: Number,
      min: 1,
      max: 31
    },
    // For recurring: day of month (1 - 31)
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31
    },
    // For formula items
    formulaConfig: {
      distance: { type: Number, default: 0 },
      efficiency: { type: Number, default: 1 },
      fuelPrice: { type: Number, default: 0 },
      extraCost: { type: Number, default: 0 },
      dates: [{ type: Number, min: 1, max: 31 }]
    }
  },
  { timestamps: true }
);

export const Item = mongoose.model('Item', itemSchema);
