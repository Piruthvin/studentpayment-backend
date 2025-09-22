import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'student'], default: 'student', index: true }
  },
  { timestamps: true }
);

export default mongoose.model('User', UserSchema);
