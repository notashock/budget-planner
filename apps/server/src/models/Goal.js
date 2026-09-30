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
    }
  },
  { timestamps: true }
);

export const Goal = mongoose.model('Goal', goalSchema);
