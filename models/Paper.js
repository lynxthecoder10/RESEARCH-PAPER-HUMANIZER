import mongoose from 'mongoose';

const PaperSchema = new mongoose.Schema({
  title: { type: String, required: true },
  topic: { type: String },
  abstract: { type: String },
  keywords: [String],
  sections: {
    introduction: String,
    literature_review: String,
    methodology: String,
    results: String,
    discussion: String,
    conclusion: String,
  },
  references: [String],
  report: {
    citationStats: {
      total: Number,
      verified: Number,
      suspicious: Number
    },
    plagiarismScore: Number,
    logicalConsistency: Boolean
  },
  pdfUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Paper || mongoose.model('Paper', PaperSchema);
