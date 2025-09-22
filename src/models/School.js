import mongoose from 'mongoose';

const SchoolSchema = new mongoose.Schema(
  {
    school_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true }
  },
  { timestamps: true }
);

export default mongoose.model('School', SchoolSchema);
