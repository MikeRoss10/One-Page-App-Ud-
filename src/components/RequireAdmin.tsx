import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type State = 'loading' | 'admin' | 'not-admin' | 'logged-out';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return setState('logged-out');
      const { data: row } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
      setState(row ? 'admin' : 'not-admin');
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setState('logged-out');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (state === 'loading') return <div className="center-screen"><div className="spinner" /></div>;
  if (state === 'logged-out') return <Navigate to="/admin/login" replace />;
  if (state === 'not-admin') {
    return (
      <div className="container narrow">
        <div className="card">
          <h2>No access</h2>
          <p>Your account isn't an admin yet. Add it to the <code>admins</code> table (see README).</p>
          <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>Log out</button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
