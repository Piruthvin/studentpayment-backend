import mongoose from 'mongoose';

const OrderStatusSchema = new mongoose.Schema(
  {
    collect_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true, required: true },
    external_collect_request_id: { type: String, index: true },
    order_amount: Number,
    transaction_amount: Number,
    payment_mode: String,
    payment_details: String,
    bank_reference: String,
    payment_message: String,
    status: { type: String, index: true },
    error_message: String,
    payment_time: Date,
    gateway: String,
    vendor_amount: { type: Number },
    capture_status: { type: String }
  },
  { timestamps: true }
);

OrderStatusSchema.index({ payment_time: -1 })

export default mongoose.model('OrderStatus', OrderStatusSchema);
