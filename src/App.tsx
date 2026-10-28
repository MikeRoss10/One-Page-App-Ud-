import { Navigate, Route, Routes } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import ThankYouPage from './pages/ThankYouPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboard from './pages/AdminDashboard';
import RequireAdmin from './components/RequireAdmin';
import { isConfigured } from './lib/supabase';

export default function App() {
  if (!isConfigured) {
    return (
      <div className="container narrow">
        <div className="card">
          <h2>Setup needed</h2>
          <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see README) and rebuild.</p>
        </div>
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminDashboard />
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
