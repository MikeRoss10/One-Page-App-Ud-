import { Link } from 'react-router-dom';

export default function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo" aria-label="Utility Deals home">
          <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="var(--brand-accent)" />
            <path d="M36 8 18 36h12l-4 20 20-30H34z" fill="var(--brand-primary)" />
          </svg>
          <span>
            Utility <strong>Deals</strong>
          </span>
        </Link>
        {right}
      </div>
    </header>
  );
}
