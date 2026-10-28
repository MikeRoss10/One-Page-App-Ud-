import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'ok'; text: string } | null>(null);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMsg({ type: 'error', text: error.message });
    navigate('/admin');
  };

  const reset = async () => {
    if (!email) return setMsg({ type: 'error', text: 'Enter your email first.' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setMsg(error ? { type: 'error', text: error.message } : { type: 'ok', text: 'Password reset email sent.' });
  };

  return (
    <>
      <Header />
      <div className="container narrow">
        <form className="card form" onSubmit={login}>
          <h2>Staff login</h2>
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
          <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          {msg && <p className={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="btn-link" onClick={reset}>Forgot password?</button>
        </form>
      </div>
    </>
  );
}
