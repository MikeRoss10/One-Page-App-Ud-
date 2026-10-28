import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { apiUrl, supabase } from '../lib/supabase';

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    postcode: '',
    bill_type: 'electricity',
    message: '',
    consent: false,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  const pickFile = (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (f.type && !ACCEPTED.includes(f.type)) return setError('Please upload a PDF or a photo (JPG, PNG, HEIC) of your bill.');
    if (f.size > MAX_BYTES) return setError('That file is over 15 MB. Try a smaller photo or a PDF.');
    setFile(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!file) return setError('Please attach your bill.');
    if (!form.consent) return setError('Please agree so we can contact you about your bill.');

    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${new Date().toISOString().slice(0, 10)}/${id}.${ext}`;

      const { error: upErr } = await supabase.storage.from('bills').upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('submissions').insert({
        id,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        postcode: form.postcode.trim() || null,
        bill_type: form.bill_type,
        message: form.message.trim() || null,
        file_path: path,
        file_name: file.name,
      });
      if (insErr) throw insErr;

      // Email + SMS confirmation. A failure here shouldn't block the customer: the bill is already saved.
      fetch(apiUrl('/api/notify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => undefined);

      navigate('/thank-you', { state: { ref: id.slice(0, 8).toUpperCase(), name: form.full_name.split(' ')[0] } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header right={<Link to="/admin" className="header-link">Staff login</Link>} />

      <section className="hero">
        <div className="container hero-inner">
          <div>
            <span className="pill">100% free · No obligation</span>
            <h1>
              Upload your bill.<br />
              <span className="accent">We'll find you a better deal.</span>
            </h1>
            <p className="lead">
              Snap a photo or upload a PDF of your electricity or gas bill. Our experts compare it against the market and
              get back to you, usually within 1–2 business days.
            </p>
            <ul className="steps">
              <li><span>1</span>Upload your latest bill</li>
              <li><span>2</span>We review and compare</li>
              <li><span>3</span>You get an email + SMS with your savings</li>
            </ul>
          </div>

          <form className="card form" onSubmit={submit} noValidate>
            <h2>Send us your bill</h2>

            <div
              className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
            >
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/*"
                hidden
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              {file ? (
                <>
                  <strong>📄 {file.name}</strong>
                  <small>{(file.size / 1024 / 1024).toFixed(2)} MB · tap to change</small>
                </>
              ) : (
                <>
                  <strong>📷 Tap to take a photo or choose a file</strong>
                  <small>PDF, JPG, PNG or HEIC · up to 15 MB</small>
                </>
              )}
            </div>

            <label>Full name<input required value={form.full_name} onChange={set('full_name')} autoComplete="name" /></label>
            <div className="row">
              <label>Email<input required type="email" value={form.email} onChange={set('email')} autoComplete="email" /></label>
              <label>Mobile<input required type="tel" value={form.phone} onChange={set('phone')} placeholder="04xx xxx xxx" autoComplete="tel" /></label>
            </div>
            <div className="row">
              <label>Postcode<input inputMode="numeric" maxLength={4} pattern="\d{4}" value={form.postcode} onChange={set('postcode')} /></label>
              <label>
                Bill type
                <select value={form.bill_type} onChange={set('bill_type')}>
                  <option value="electricity">Electricity</option>
                  <option value="gas">Gas</option>
                  <option value="both">Electricity &amp; Gas</option>
                  <option value="internet">Internet</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <label><span>Anything we should know? <em>(optional)</em></span><textarea rows={3} value={form.message} onChange={set('message')} maxLength={2000} /></label>

            <label className="checkbox">
              <input type="checkbox" checked={form.consent} onChange={set('consent')} />
              <span>I agree to Utility Deals contacting me by email, SMS and phone about my bill.</span>
            </label>

            {error && <p className="error">{error}</p>}

            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Uploading…' : 'Get my free comparison'}
            </button>
            <p className="fineprint">🔒 Your bill is stored securely and only seen by our team.</p>
          </form>
        </div>
      </section>
    </>
  );
}
