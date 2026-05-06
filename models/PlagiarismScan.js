import mongoose from 'mongoose';

const MatchSchema = new mongoose.Schema({
  text: { type: String, required: true },
  similarity: { type: Number, required: true },
  source: { type: String, required: true }
}, { _id: false });

const FlagSchema = new mongoose.Schema({
  type: { type: String, required: true },
  severity: { type: String, required: true }
}, { _id: false });

const PlagiarismScanSchema = new mongoose.Schema({
  scanId: { type: String, required: true, unique: true, index: true },
  provider: { type: String, required: true },
  status: { type: String, required: true },
  similarity: { type: Number, required: true },
  originality: { type: Number, required: true },
  risk: { type: String, required: true },
  matches: { type: [MatchSchema], default: [] },
  flags: { type: [FlagSchema], default: [] },
  wordCount: { type: Number, required: true },
  textHash: { type: String, required: true },
  preview: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.PlagiarismScan ||
  mongoose.model('PlagiarismScan', PlagiarismScanSchema);
