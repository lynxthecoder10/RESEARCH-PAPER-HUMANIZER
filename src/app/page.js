import Link from 'next/link';

const tools = [
  {
    title: 'Research Formatter',
    href: '/generate',
    description: 'Restructure research into complete IEEE-style papers while preserving citations, numbers, and meaning.',
    accent: 'Format',
    Icon: DocumentIcon
  },
  {
    title: 'AI Humanizer',
    href: '/humanize',
    description: 'Refine academic prose for clarity, flow, and professional tone without losing technical precision.',
    accent: 'Refine',
    Icon: SparkIcon
  },
  {
    title: 'Similarity Checker',
    href: '/plagiarism',
    description: 'Review similarity, originality, repeated phrasing, and local match signals with an honest report.',
    accent: 'Analyze',
    Icon: CheckIcon
  },
  {
    title: 'History Archive',
    href: '/history',
    description: 'Access previous generations and exported research materials from one organized workspace.',
    accent: 'Review',
    Icon: ClockIcon
  }
];

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="dashboard-hero">
      <header className="reveal-1">
        <h1 className="hero-title">
          Academic <span className="gradient-text">Suite</span>
        </h1>
        <p className="hero-subtitle">
          The all-in-one professional platform for research formatting, AI humanization,
          similarity analysis, and academic integrity management.
        </p>
      </header>

      <div className="grid-features" aria-label="Academic Suite tools">
        {tools.map(({ title, href, description, accent, Icon }, index) => (
          <Link href={href} className={`feature-card reveal-${Math.min(index + 2, 4)}`} key={href}>
            <div className="icon-box">
              <Icon />
            </div>
            <div>
              <span className="feature-eyebrow">{accent}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
            <span className="feature-action">Open</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
