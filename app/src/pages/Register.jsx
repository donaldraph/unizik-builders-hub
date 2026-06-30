import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api, uploadAvatar } from '../api.js';
import { TAGS, FACULTIES, LEVELS } from '../config.js';
import { Brand, useToast } from './Shell.jsx';

const STEPS = ['Personal', 'Profile', 'Tag', 'Review'];
const PLACEHOLDER_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='40' fill='%23E5E7EB'/%3E%3Ccircle cx='40' cy='30' r='13' fill='%239CA3AF'/%3E%3Cellipse cx='40' cy='65' rx='20' ry='12' fill='%239CA3AF'/%3E%3C/svg%3E";

export default function Register() {
  const { idToken, email } = useAuth();
  const navigate = useNavigate();
  const [toast, showToast] = useToast();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    fullName: '', matric: '', department: '', level: '',
    email: email || '', phone: '', bio: '', github: '', linkedin: '', twitter: '',
  });
  const [tag, setTag] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(PLACEHOLDER_AVATAR);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(s) {
    const e = {};
    if (s === 0) {
      if (!form.fullName.trim()) e.fullName = 'Full name is required';
      if (!form.matric.trim()) e.matric = 'Matric number is required';
      if (!form.department) e.department = 'Select your faculty';
      if (!form.level) e.level = 'Select your level';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email';
      if (!/^0[789][01]\d{8}$/.test(form.phone.replace(/\s/g, ''))) e.phone = 'Enter a valid Nigerian number';
    }
    if (s === 1 && !form.github.trim()) e.github = 'GitHub username is required';
    if (s === 2 && !tag) e.tag = 'Pick a tag to continue';
    if (s === 3 && !consent) e.consent = 'You must agree to continue';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() { if (validate(step)) setStep((s) => Math.min(s + 1, 3)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  function pickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!validate(3)) return;
    setSubmitting(true);
    try {
      let avatarKey = '';
      if (avatarFile) avatarKey = await uploadAvatar(idToken, avatarFile);
      await api.register(idToken, {
        ...form,
        phone: form.phone.replace(/\s/g, ''),
        tag: tag.name,
        avatarKey,
        consent: true,
      });
      navigate('/pending', { replace: true });
    } catch (err) {
      if (err.status === 409) navigate('/dashboard', { replace: true });
      else { showToast(err.message || 'Something went wrong'); setSubmitting(false); }
    }
  }

  const fillPct = (step / 3) * 100;

  return (
    <>
      <Brand />
      <div className="stepper" style={{ paddingTop: 'var(--space-8)' }}>
        <div className="stepper-track"><div className="stepper-fill" style={{ width: `${fillPct}%` }} /></div>
        {STEPS.map((label, i) => (
          <div className="stepper-step" key={label}>
            <div className={`stepper-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}>{i < step ? '✓' : i + 1}</div>
            <div className="stepper-label">{label}</div>
          </div>
        ))}
      </div>

      <main className="app-main app-main--form">
        {step === 0 && (
          <section className="ds-animate-in">
            <div className="step-head"><div className="ds-eyebrow">Step 01 of 04</div><h2>Tell us about yourself</h2><p>Basic info to get you on the roster</p></div>
            <div className="ds-card">
              <Field label="Full name" id="fullName" error={errors.fullName}>
                <input className="ds-input" value={form.fullName} onChange={set('fullName')} placeholder="Chukwudi Okonkwo" />
              </Field>
              <Field label="Matric number" id="matric" error={errors.matric}>
                <input className="ds-input ds-mono" value={form.matric} onChange={set('matric')} placeholder="202312345678" inputMode="numeric" />
              </Field>
              <Field label="Department / Faculty" id="department" error={errors.department}>
                <select className="ds-input" value={form.department} onChange={set('department')}>
                  <option value="">Select your faculty</option>
                  {FACULTIES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Academic level" id="level" error={errors.level}>
                <select className="ds-input" value={form.level} onChange={set('level')}>
                  <option value="">Select level</option>
                  {LEVELS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Email address" id="email" error={errors.email}>
                <input className="ds-input" type="email" value={form.email} onChange={set('email')} placeholder="you@unizik.edu.ng" />
              </Field>
              <Field label="Phone number" id="phone" error={errors.phone}>
                <input className="ds-input" type="tel" value={form.phone} onChange={set('phone')} placeholder="0803 123 4567" inputMode="numeric" />
              </Field>
            </div>
            <button className="ds-btn ds-btn--primary ds-btn--block" style={{ marginTop: 'var(--space-5)' }} onClick={next}>Continue to Profile →</button>
          </section>
        )}

        {step === 1 && (
          <section className="ds-animate-in">
            <div className="step-head"><div className="ds-eyebrow">Step 02 of 04</div><h2>Set up your profile</h2><p>Let the community know who you are</p></div>
            <div className="ds-card">
              <label className="avatar-pick">
                <img src={avatarPreview} alt="avatar preview" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>Profile photo</div>
                  <div className="ds-muted" style={{ fontSize: 'var(--text-sm)' }}>Tap to upload — square image works best</div>
                </div>
                <input type="file" accept="image/*" hidden onChange={pickAvatar} />
              </label>
              <Field label="Bio" id="bio" opt="(max 160 chars)">
                <textarea className="ds-input" rows={3} maxLength={160} value={form.bio} onChange={set('bio')} placeholder="Aspiring cloud architect. Building serverless things at UNIZIK." />
                <div className="ds-mono" style={{ fontSize: 'var(--text-xs)', textAlign: 'right', marginTop: 'var(--space-1)', color: 'var(--text-muted)' }}>{form.bio.length} / 160</div>
              </Field>
              <Field label="GitHub username" id="github" error={errors.github}>
                <div className="gh-field"><span className="gh-prefix">github.com/</span><input value={form.github} onChange={set('github')} placeholder="yourhandle" autoCapitalize="none" autoCorrect="off" /></div>
              </Field>
              <Field label="LinkedIn URL" id="linkedin" opt="(optional)">
                <input className="ds-input" value={form.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/yourname" />
              </Field>
              <Field label="Twitter / X handle" id="twitter" opt="(optional)">
                <input className="ds-input" value={form.twitter} onChange={set('twitter')} placeholder="@yourhandle" autoCapitalize="none" />
              </Field>
            </div>
            <div className="row" style={{ marginTop: 'var(--space-5)' }}>
              <button className="ds-btn ds-btn--ghost" onClick={back}>← Back</button>
              <button className="ds-btn ds-btn--primary" onClick={next}>Choose Your Tag →</button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="ds-animate-in">
            <div className="step-head"><div className="ds-eyebrow">Step 03 of 04</div><h2>Choose your builder tag</h2><p>Pick the one that fits you best — just one</p></div>
            <div className="ds-card">
              <div className="tag-grid">
                {TAGS.map((t) => (
                  <div key={t.name} className={`tag-card ${tag?.name === t.name ? 'selected' : ''}`} onClick={() => { setTag(t); setErrors((e) => ({ ...e, tag: undefined })); }}>
                    {tag?.name === t.name && <div className="tag-check">✓</div>}
                    <div className="emoji">{t.emoji}</div>
                    <div className="t-name">{t.name}</div>
                    <div className="t-desc">{t.desc}</div>
                  </div>
                ))}
              </div>
              {errors.tag && <div className="ds-error" style={{ marginTop: 'var(--space-4)' }}>{errors.tag}</div>}
            </div>
            <div className="row" style={{ marginTop: 'var(--space-5)' }}>
              <button className="ds-btn ds-btn--ghost" onClick={back}>← Back</button>
              <button className="ds-btn ds-btn--primary" onClick={next}>Review & Submit →</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="ds-animate-in">
            <div className="step-head"><div className="ds-eyebrow">Step 04 of 04</div><h2>Review your details</h2><p>Make sure everything looks right before submitting</p></div>
            <div className="ds-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--brand-navy)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-5)' }}>
                <img src={avatarPreview} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,153,0,0.5)' }} />
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 'var(--text-md)' }}>{form.fullName}</div>
                  <div className="ds-mono" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'var(--text-sm)' }}>{form.matric}</div>
                </div>
              </div>
              <ReviewRow label="Faculty" value={form.department} />
              <ReviewRow label="Level" value={form.level} />
              <ReviewRow label="Email" value={form.email} />
              <ReviewRow label="Phone" value={form.phone} />
              <ReviewRow label="GitHub" value={`/${form.github}`} />
              <ReviewRow label="Builder Tag" value={<span className="ds-tag ds-tag--filled">{tag.emoji} {tag.name}</span>} />
              <label className="agree-box ds-card" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginTop: 'var(--space-5)', background: 'var(--brand-blue-soft)', borderColor: 'rgba(26,79,175,0.15)', padding: 'var(--space-4)' }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--brand-blue)' }} />
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  I agree to the AWS Student Builders UNIZIK community guidelines, and I consent to my details being stored and shown in the member directory. My matric number, email, and phone stay private — my name, profile photo, faculty, level, tag, bio, and the social links I choose are public. See our <a href="/privacy" target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--brand-blue)', fontWeight: 'var(--weight-semi)' }}>Privacy Policy</a>.
                </span>
              </label>
              {errors.consent && <div className="ds-error" style={{ marginTop: 'var(--space-2)' }}>{errors.consent}</div>}
            </div>
            <div className="row" style={{ marginTop: 'var(--space-5)' }}>
              <button className="ds-btn ds-btn--ghost" onClick={back} disabled={submitting}>← Back</button>
              <button className="ds-btn ds-btn--primary" onClick={submit} disabled={submitting}>
                {submitting ? <span className="spinner" /> : 'Complete Registration'}
              </button>
            </div>
          </section>
        )}
      </main>
      {toast}
    </>
  );
}

function Field({ label, id, opt, error, children }) {
  return (
    <div className="field">
      <label className="ds-label" htmlFor={id}>{label} {opt && <span className="opt">{opt}</span>}</label>
      {children}
      {error && <div className="ds-error">{error}</div>}
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--border)', gap: 'var(--space-3)' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
