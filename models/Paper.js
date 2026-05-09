import mongoose from 'mongoose';

const SectionSchema = new mongoose.Schema({
  introduction: String,
  literature_review: String,
  methodology: String,
  results: String,
  discussion: String,
  conclusion: String,
}, { _id: false });

const ReportSchema = new mongoose.Schema({
  citationStats: {
    total: Number,
    verified: Number,
    suspicious: Number
  },
  plagiarismScore: Number,
  logicalConsistency: Boolean
}, { _id: false });

const PaperSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, default: 'Untitled research paper' },
  topic: { type: String },
  abstract: { type: String },
  keywords: [String],
  sections: { type: SectionSchema, default: () => ({}) },
  references: [String],
  report: { type: ReportSchema, default: () => ({}) },
  format: { type: String, default: 'ieee' },
  sourceContent: { type: String },
  generatedContent: { type: String, required: true },
  fallback: { type: Boolean, default: false },
  wordCount: { type: Number, default: 0 },
  preview: { type: String, default: '' },
  pdfUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});

PaperSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Paper || mongoose.model('Paper', PaperSchema);
