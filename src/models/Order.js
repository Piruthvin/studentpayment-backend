import mongoose from 'mongoose';

const StudentInfoSchema = new mongoose.Schema(
  {
    name: String,
    id: String,
    email: String,
    phone: String
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    school_id: { type: String, index: true, required: true },
    trustee_id: { type: String },
    student_info: { type: StudentInfoSchema, required: true },
    gateway_name: { type: String, default: 'EDV' },
    custom_order_id: { type: String, index: true, unique: true },
    order_amount: { type: Number, required: true }
  },
  { timestamps: true }
);

export default mongoose.model('Order', OrderSchema);
