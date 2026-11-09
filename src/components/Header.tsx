import { Link } from 'react-router-dom';

export default function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo" aria-label="Utility Deals home">
          <img src="./logo.png" alt="Utility Deals – Get better deals" width="273" height="69" />
        </Link>
        {right}
      </div>
    </header>
  );
}
