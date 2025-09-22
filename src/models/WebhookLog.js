import mongoose from 'mongoose';

const WebhookLogSchema = new mongoose.Schema(
  {
    headers: Object,
    body: Object,
    handled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model('WebhookLog', WebhookLogSchema);
