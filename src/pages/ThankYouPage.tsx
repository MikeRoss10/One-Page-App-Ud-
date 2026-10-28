import { Link, useLocation } from 'react-router-dom';
import Header from '../components/Header';

export default function ThankYouPage() {
  const { state } = useLocation() as { state?: { ref?: string; name?: string } };
  return (
    <>
      <Header />
      <div className="container narrow">
        <div className="card center">
          <div className="big-check">✓</div>
          <h1>Thanks{state?.name ? `, ${state.name}` : ''}!</h1>
          <p className="lead">We've received your bill. You'll get a confirmation email and SMS shortly.</p>
          {state?.ref && (
            <p className="ref">Your reference: <strong>{state.ref}</strong></p>
          )}
          <p>Our team will review it and get back to you within 1–2 business days.</p>
          <Link to="/" className="btn btn-secondary">Upload another bill</Link>
        </div>
      </div>
    </>
  );
}
