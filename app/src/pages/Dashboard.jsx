import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth.jsx';
import { api, uploadAvatar } from '../api.js';
import { TAGS, LEVELS } from '../config.js';
import { Brand, Loader, useToast } from './Shell.jsx';

// Neutral grey avatar/photo placeholder (used until real images are supplied).
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='40' fill='%23E5E7EB'/%3E%3Ccircle cx='40' cy='30' r='13' fill='%239CA3AF'/%3E%3Cellipse cx='40' cy='65' rx='20' ry='12' fill='%239CA3AF'/%3E%3C/svg%3E";

// ============================================================================
// EDITABLE CONTENT — fill these in. Everything below is plain data, no backend.
// Look for TODO markers; replace the placeholder strings with real values.
// ============================================================================

// Link to your Meetup group (Events tab).
const TODO_MEETUP_URL = 'TODO_MEETUP_URL'; // TODO: paste your Meetup group URL

// Upcoming events. Edit / add / remove freely.
const EVENTS = [
  // TODO: replace with your real upcoming events.
  {
    title: 'TODO: Event title (e.g. Cloud Study Jam)',
    date: 'TODO: Sat, 14 Jun 2026 · 2:00 PM',
    location: 'TODO: venue or "Online"',
    description: 'TODO: a sentence on what attendees will do or learn.',
  },
  {
    title: 'TODO: Second event title',
    date: 'TODO: date & time',
    location: 'TODO: location',
    description: 'TODO: short description.',
  },
];

// Past-event photos. Replace each `src` with a real image URL.
const GALLERY = [
  // TODO: replace `src` with real photo URLs (and write a caption in `alt`).
  { src: PLACEHOLDER, alt: 'TODO: caption' },
  { src: PLACEHOLDER, alt: 'TODO: caption' },
  { src: PLACEHOLDER, alt: 'TODO: caption' },
  { src: PLACEHOLDER, alt: 'TODO: caption' },
  { src: PLACEHOLDER, alt: 'TODO: caption' },
  { src: PLACEHOLDER, alt: 'TODO: caption' },
];

// Core team / leadership. First entry is set; add the rest.
const TEAM = [
  { name: 'Donald', role: 'Student Builder Group Leader', photo: PLACEHOLDER }, // TODO: add Donald's photo URL
  // TODO: add the rest of the core team below (copy a line and edit it).
  { name: 'TODO: Name', role: 'TODO: Role', photo: PLACEHOLDER },
  { name: 'TODO: Name', role: 'TODO: Role', photo: PLACEHOLDER },
];

// Hub navigation (Verify Members is appended separately, admin-only).
const SECTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'learn', label: 'Learn' },
  { id: 'events', label: 'Events' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'team', label: 'Team' },
  { id: 'directory', label: 'Directory' },
];

export default function Dashboard() {
  const { idToken, isAdmin } = useAuth();
  const [toast, showToast] = useToast();

  const [me, setMe] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('home');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, dirRes] = await Promise.all([api.getMe(idToken), api.directory(idToken)]);
      setMe(meRes.profile);
      setMembers(dirRes.members || []);
    } catch (e) {
      showToast(e.message || 'Could not load the dashboard');
    } finally {
      setLoading(false);
    }
  }, [idToken, showToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (<><Brand /><Loader label="Loading the club" /></>);

  const firstName = (me?.fullName || 'Builder').split(' ')[0];

  return (
    <>
      <Brand>
        <div className="app-online"><span className="dot" />{members.length} verified builders</div>
        <img className="app-avatar" src={avatarSrc(me)} alt="me" onClick={() => setEditing(true)} title="Edit profile" />
      </Brand>

      <main className="app-main">
        <nav className="tabs tabs--scroll">
          {SECTIONS.map((s) => (
            <button key={s.id} className={`tab ${tab === s.id ? 'active' : ''}`} onClick={() => setTab(s.id)}>{s.label}</button>
          ))}
          {isAdmin && <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>Verify Members</button>}
        </nav>

        {tab === 'home' && <HomeSection firstName={firstName} goTo={setTab} onEditProfile={() => setEditing(true)} />}
        {tab === 'learn' && <LearnSection />}
        {tab === 'events' && <EventsSection />}
        {tab === 'gallery' && <GallerySection />}
        {tab === 'team' && <TeamSection />}
        {tab === 'directory' && <Directory members={members} />}
        {tab === 'admin' && isAdmin && <AdminPanel idToken={idToken} onChange={load} showToast={showToast} />}
      </main>

      {editing && (
        <EditProfile
          me={me}
          idToken={idToken}
          onClose={() => setEditing(false)}
          onSaved={(updated) => { setMe(updated); setEditing(false); showToast('Profile updated'); load(); }}
          showToast={showToast}
        />
      )}
      {toast}
    </>
  );
}

// ---- Home: welcome landing + quick-start ----
function HomeSection({ firstName, goTo, onEditProfile }) {
  return (
    <section className="ds-animate-in">
      <div className="dash-welcome">
        <h1>Welcome back, {firstName}</h1>
        <p>Your journey from nothing to everything continues here.</p>
      </div>

      <div className="hub-mission ds-card">
        <div className="ds-eyebrow">Our mission</div>
        <p>We're a student-run community at UNIZIK where we learn cloud and AI, build real projects, and connect with builders across 600+ campuses worldwide.</p>
      </div>

      <div className="section-head" style={{ marginTop: 'var(--space-8)' }}>
        <div className="ds-eyebrow">Quick start</div>
        <h2>Get going in four steps</h2>
      </div>
      <div className="hub-grid">
        <a className="hub-card" href="https://community.aws/buildergroups" target="_blank" rel="noopener">
          <div className="hub-card-icon">🏗️</div>
          <div className="hub-card-title">Join AWS Builder Center</div>
          <div className="hub-card-desc">Create your AWS Builder ID and plug into the global builder community.</div>
          <span className="hub-card-cta">community.aws ↗</span>
        </a>
        <button className="hub-card" onClick={() => goTo('events')}>
          <div className="hub-card-icon">📅</div>
          <div className="hub-card-title">Come to our next event</div>
          <div className="hub-card-desc">Workshops, study jams, and hangouts. See what's coming up.</div>
          <span className="hub-card-cta">View events →</span>
        </button>
        {/* TODO_URL: link to your social channels (WhatsApp / X / LinkedIn group) */}
        <a className="hub-card" href="TODO_URL" target="_blank" rel="noopener">
          <div className="hub-card-icon">📣</div>
          <div className="hub-card-title">Follow our channels</div>
          <div className="hub-card-desc">Stay in the loop with announcements, resources, and chatter.</div>
          <span className="hub-card-cta">TODO: add link ↗</span>
        </a>
        <button className="hub-card" onClick={onEditProfile}>
          <div className="hub-card-icon">✨</div>
          <div className="hub-card-title">Complete your profile</div>
          <div className="hub-card-desc">Add your photo, bio, and socials so other builders can find you.</div>
          <span className="hub-card-cta">Edit profile →</span>
        </button>
      </div>

      <div className="section-head" style={{ marginTop: 'var(--space-8)' }}>
        <div className="ds-eyebrow">What's next</div>
        <h2>Settle in</h2>
      </div>
      <div className="ds-card whats-next">
        <ul>
          <li>👋 Say hi in our community channels and introduce yourself.</li>
          <li>📚 Open <strong>Learn</strong> and start your AWS certification path.</li>
          <li>🤝 Browse the <strong>Directory</strong> to find builders in your faculty.</li>
          <li>🚀 Show up to the next event and start building with us.</li>
        </ul>
      </div>
    </section>
  );
}

// ---- Learn: AWS learning hub ----
function LearnSection() {
  return (
    <section className="ds-animate-in">
      <div className="section-head">
        <div className="ds-eyebrow">Learn</div>
        <h2>Your AWS learning hub</h2>
        <p>From your very first certification to hands-on labs — everything you need to level up.</p>
      </div>

      <div className="learn-block ds-card">
        <h3>Start your certification journey</h3>
        <p className="ds-muted">Pick the entry point that matches where you're starting from.</p>
        <div className="hub-grid" style={{ marginTop: 'var(--space-5)' }}>
          {/* TODO_URL: AWS Certified Cloud Practitioner page */}
          <a className="hub-card" href="TODO_URL" target="_blank" rel="noopener">
            <span className="ds-tag ds-tag--filled">Beginner</span>
            <div className="hub-card-title">AWS Certified Cloud Practitioner</div>
            <div className="hub-card-desc">New to the cloud? Start here. Foundational concepts — no prior experience needed.</div>
            <span className="hub-card-cta">TODO: add link ↗</span>
          </a>
          {/* TODO_URL: Associate-level certifications overview (Solutions Architect / Developer / SysOps) */}
          <a className="hub-card" href="TODO_URL" target="_blank" rel="noopener">
            <span className="ds-tag ds-tag--filled">IT / STEM background</span>
            <div className="hub-card-title">Associate-level certs by role</div>
            <div className="hub-card-desc">Solutions Architect, Developer, or SysOps — pick the path that fits your goals.</div>
            <span className="hub-card-cta">TODO: add link ↗</span>
          </a>
        </div>
      </div>

      <div className="learn-block ds-card" style={{ marginTop: 'var(--space-6)' }}>
        <h3>Hands-on with Skill Builder &amp; free labs</h3>
        <p className="ds-muted">Learn by doing — guided labs and self-paced courses, free.</p>
        <div className="hub-grid" style={{ marginTop: 'var(--space-5)' }}>
          {/* TODO_URL: AWS Skill Builder */}
          <a className="hub-card" href="TODO_URL" target="_blank" rel="noopener">
            <div className="hub-card-icon">🧠</div>
            <div className="hub-card-title">AWS Skill Builder</div>
            <div className="hub-card-desc">Hundreds of free digital courses taught by AWS experts.</div>
            <span className="hub-card-cta">TODO: add link ↗</span>
          </a>
          {/* TODO_URL: AWS free hands-on labs / workshops */}
          <a className="hub-card" href="TODO_URL" target="_blank" rel="noopener">
            <div className="hub-card-icon">🧪</div>
            <div className="hub-card-title">Free hands-on labs</div>
            <div className="hub-card-desc">Spin up real AWS services in a guided sandbox environment.</div>
            <span className="hub-card-cta">TODO: add link ↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}

// ---- Events: upcoming events (from the editable EVENTS array) ----
function EventsSection() {
  return (
    <section className="ds-animate-in">
      <div className="section-head">
        <div className="ds-eyebrow">Events</div>
        <h2>Upcoming events</h2>
        <p>Workshops, study jams, and meetups. Come build with us.</p>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        {/* TODO_MEETUP_URL is set at the top of this file */}
        <a className="ds-btn ds-btn--secondary" href={TODO_MEETUP_URL} target="_blank" rel="noopener">📍 Join our Meetup group</a>
      </div>

      <div className="event-list">
        {EVENTS.map((e, i) => (
          <div className="event-card ds-card" key={i}>
            <div className="event-date">{e.date}</div>
            <div className="event-title">{e.title}</div>
            <div className="event-loc">📍 {e.location}</div>
            <p className="event-desc">{e.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Gallery: past-event photos (from the editable GALLERY array) ----
function GallerySection() {
  return (
    <section className="ds-animate-in">
      <div className="section-head">
        <div className="ds-eyebrow">Gallery</div>
        <h2>Moments from past events</h2>
        <p>A look back at what we've built and celebrated together.</p>
      </div>
      <div className="gallery-grid">
        {GALLERY.map((g, i) => (
          <div className="gallery-item" key={i}>
            <img src={g.src} alt={g.alt} loading="lazy" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Team: core team cards (from the editable TEAM array) ----
function TeamSection() {
  return (
    <section className="ds-animate-in">
      <div className="section-head">
        <div className="ds-eyebrow">Team</div>
        <h2>Meet the core team</h2>
        <p>The students leading and running the community.</p>
      </div>
      <div className="team-grid">
        {TEAM.map((t, i) => (
          <div className="team-card ds-card" key={i}>
            <img className="team-photo" src={t.photo} alt={t.name} />
            <div className="team-name">{t.name}</div>
            <div className="team-role">{t.role}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Directory (public view — no PII ever arrives here) ----
function Directory({ members }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [level, setLevel] = useState('');

  const filtered = members.filter((m) =>
    (!q || `${m.fullName} ${m.tag} ${m.department || ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (!tag || m.tag === tag) &&
    (!level || m.level === level)
  );

  return (
    <>
      <div className="search-bar">
        <input className="ds-input" placeholder="Search by name, tag, or faculty…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ds-input" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {TAGS.map((t) => <option key={t.name}>{t.name}</option>)}
        </select>
        <select className="ds-input" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No builders match that yet. As people join and get verified, they'll show up here.</div>
      ) : (
        <div className="member-grid">
          {filtered.map((m) => <MemberCard key={m.sub} m={m} />)}
        </div>
      )}
    </>
  );
}

function MemberCard({ m }) {
  return (
    <div className="member-card">
      <img className="m-avatar" src={avatarSrc(m)} alt={m.fullName} />
      <div className="m-name">{m.fullName}</div>
      <div className="m-meta">{m.level}{m.department ? ` · ${m.department.replace('Faculty of ', '')}` : ''}</div>
      <span className="ds-tag ds-tag--filled">{m.tag}</span>
      {m.bio && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>{m.bio}</p>}
      <div className="m-socials">
        {m.github && <a className="m-social" href={`https://github.com/${m.github}`} target="_blank" rel="noopener" title="GitHub">💻</a>}
        {m.linkedin && <a className="m-social" href={m.linkedin} target="_blank" rel="noopener" title="LinkedIn">🔗</a>}
        {m.twitter && <a className="m-social" href={`https://twitter.com/${m.twitter.replace('@', '')}`} target="_blank" rel="noopener" title="Twitter/X">𝕏</a>}
      </div>
    </div>
  );
}

// ---- Edit own profile (persists via PUT /me) ----
function EditProfile({ me, idToken, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({ fullName: me.fullName || '', bio: me.bio || '', github: me.github || '', linkedin: me.linkedin || '', twitter: me.twitter || '', phone: me.phone || '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState(avatarSrc(me));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const r = new FileReader();
    r.onload = (ev) => setPreview(ev.target.result);
    r.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    try {
      const updates = { ...form };
      if (avatarFile) updates.avatarKey = await uploadAvatar(idToken, avatarFile);
      const res = await api.updateMe(idToken, updates);
      onSaved({ ...me, ...updates, ...(res.profile || {}) });
    } catch (e) {
      showToast(e.message || 'Could not save'); setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Edit profile</h3><button className="modal-x" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <label className="avatar-pick">
            <img src={preview} alt="" />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>Profile photo</div><div className="ds-muted" style={{ fontSize: 'var(--text-sm)' }}>Tap to change</div></div>
            <input type="file" accept="image/*" hidden onChange={pick} />
          </label>
          <div className="field"><label className="ds-label">Full name</label><input className="ds-input" value={form.fullName} onChange={set('fullName')} /></div>
          <div className="field"><label className="ds-label">Bio</label><textarea className="ds-input" rows={3} maxLength={160} value={form.bio} onChange={set('bio')} /></div>
          <div className="field"><label className="ds-label">GitHub</label><div className="gh-field"><span className="gh-prefix">github.com/</span><input value={form.github} onChange={set('github')} autoCapitalize="none" /></div></div>
          <div className="field"><label className="ds-label">LinkedIn</label><input className="ds-input" value={form.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/…" /></div>
          <div className="field"><label className="ds-label">Twitter / X</label><input className="ds-input" value={form.twitter} onChange={set('twitter')} autoCapitalize="none" /></div>
          <div className="field"><label className="ds-label">Phone <span className="opt">(private)</span></label><input className="ds-input" value={form.phone} onChange={set('phone')} /></div>
          <button className="ds-btn ds-btn--primary ds-btn--block" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ---- Admin verification (group-gated server-side; UI only shows for admins) ----
function AdminPanel({ idToken, onChange, showToast }) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api.adminPending(idToken).then((r) => setPending(r.pending || [])).catch((e) => showToast(e.message));
  }, [idToken, showToast]);

  useEffect(() => { load(); }, [load]);

  async function decide(sub, decision) {
    setBusy(sub);
    try {
      await api.adminVerify(idToken, sub, decision);
      setPending((p) => p.filter((m) => m.sub !== sub));
      showToast(decision === 'VERIFIED' ? 'Member verified' : 'Member rejected');
      onChange?.();
    } catch (e) {
      showToast(e.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (pending === null) return <Loader label="Loading the queue" />;
  if (pending.length === 0) return <div className="empty">No one's waiting. The verification queue is clear.</div>;

  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="admin-table">
        <thead><tr><th>Member</th><th>Tag</th><th>Faculty</th><th>Joined</th><th>Action</th></tr></thead>
        <tbody>
          {pending.map((m) => (
            <tr key={m.sub}>
              <td><strong>{m.fullName}</strong><br /><span className="ds-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{m.matric}</span></td>
              <td><span className="ds-tag ds-tag--filled">{m.tag}</span></td>
              <td>{(m.department || '').replace('Faculty of ', '')}</td>
              <td className="ds-muted">{fmtDate(m.createdAt)}</td>
              <td>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button className="ds-btn ds-btn--sm" style={{ background: 'var(--signal-success)', color: '#fff' }} disabled={busy === m.sub} onClick={() => decide(m.sub, 'VERIFIED')}>Verify</button>
                  <button className="ds-btn ds-btn--sm" style={{ background: 'var(--signal-error)', color: '#fff' }} disabled={busy === m.sub} onClick={() => decide(m.sub, 'REJECTED')}>Reject</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- helpers ----
function avatarSrc(m) {
  if (!m) return PLACEHOLDER;
  if (m.avatarUrl) return m.avatarUrl;        // if backend ever returns a full URL
  if (m.avatarKey) return m.avatarKey;        // CDN base can be prepended here later
  return PLACEHOLDER;
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
