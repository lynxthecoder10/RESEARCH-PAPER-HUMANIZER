import SimilarityCheckerClient from './SimilarityCheckerClient';

export const metadata = {
  title: 'Similarity Checker | Academic Suite',
  description: 'Local similarity and originality analysis for academic text'
};

export default function PlagiarismPage() {
  const configuredProvider = (process.env.PLAGIARISM_PROVIDER || 'mock').toLowerCase();
  const provider = configuredProvider === 'copyleaks' ? 'copyleaks' : 'mock';

  return <SimilarityCheckerClient initialProvider={provider} />;
}
