import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../auth.jsx';
import { api, uploadAvatar } from '../api.js';
import { TAGS, LEVELS, FACULTIES } from '../config.js';
import { Brand, Loader, useToast } from './Shell.jsx';
import { BrandIcon } from '../brandIcons.jsx';

// Neutral grey avatar/photo placeholder (used until real images are supplied).
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='40' fill='%23E5E7EB'/%3E%3Ccircle cx='40' cy='30' r='13' fill='%239CA3AF'/%3E%3Cellipse cx='40' cy='65' rx='20' ry='12' fill='%239CA3AF'/%3E%3C/svg%3E";

// ============================================================================
// EDITABLE CONTENT — fill these in. Everything below is plain data, no backend.
// Look for TODO markers; replace the placeholder strings with real values.
// ============================================================================

// Link to your Meetup group (Events tab). `null` => button shows "coming soon".
const MEETUP_URL = null; // paste your Meetup group URL when it's live

// Upcoming events. Real data only — empty until events are scheduled.
const EVENTS = [];

// Past-event photos. Real images only — empty until we have some to show.
const GALLERY = [];

// Core team / leadership. Real members only.
const TEAM = [
  { name: 'Donald', role: 'Student Builder Group Leader', photo: PLACEHOLDER },
];

// Community channels. `url: null` => rendered as "Coming soon", not clickable.
// `brand` keys a real logo (see brandIcons.jsx); `color` is the brand colour.
const CHANNELS = [
  { name: 'WhatsApp', brand: 'whatsapp', color: '#25D366', url: 'https://chat.whatsapp.com/GYoJICzgnX65PkKq6R1qX3', action: 'Join', blurb: 'Our main room — daily chatter, questions, and quick announcements.' },
  { name: 'LinkedIn', brand: 'linkedin', color: '#0A66C2', url: 'https://www.linkedin.com/company/aws-student-builders-unizik/', action: 'Follow', blurb: 'Milestones, events, and member wins worth sharing professionally.' },
  { name: 'Meetup', brand: 'meetup', color: '#ED1C40', url: null, handle: 'meetup.com', blurb: 'RSVP to workshops and study jams — group launching soon.' },
  { name: 'Instagram', brand: 'instagram', color: '#E4405F', url: null, handle: 'instagram.com/awsunizik', blurb: 'Behind-the-scenes and event highlights — launching soon.' },
  { name: 'Facebook', brand: 'facebook', color: '#1877F2', url: null, handle: 'facebook.com/unizikbuilders', blurb: 'A wider community page for reach — launching soon.' },
];

// Where the certification "View on AWS" links point (exam detail lives on AWS).
const AWS_CERT_HUB = 'https://aws.amazon.com/certification/';

// "Where do I start?" — entry-point guidance, our own wording.
const CERT_START = [
  { tag: 'New to tech / non-IT', desc: 'No tech background yet? Begin with Cloud Practitioner — it builds the vocabulary and big-picture view everything else stands on.', url: 'https://aws.amazon.com/certification/certified-cloud-practitioner/' },
  { tag: 'Business · sales · marketing', desc: 'Working with technical teams? Cloud Practitioner gives you enough cloud fluency to follow the conversation and make sharper calls.', url: 'https://aws.amazon.com/certification/certified-cloud-practitioner/' },
  { tag: '1–3 yrs IT / STEM', desc: 'Already hands-on in IT or a STEM field? You can start straight at an Associate cert. Cloud Practitioner is optional here, not required.', url: AWS_CERT_HUB },
];

// Certification paths by career role. Cert names kept general; exam detail links
// out to AWS. A node can be a string, or { name, optional } for an optional cert.
// Roles without a published chain we were given carry chain: null (no invented data).
const CERT_PATHS = [
  {
    category: 'Architecture',
    roles: [
      { title: 'Solutions Architect', does: 'Designs how cloud systems fit together — secure, scalable, and cost-aware.', chain: ['Cloud Practitioner', 'Solutions Architect – Associate', 'Solutions Architect – Professional'] },
      { title: 'Application Architect', does: 'Shapes how the parts of an application connect and run in the cloud.', chain: ['Cloud Practitioner', 'Solutions Architect – Associate', 'Solutions Architect – Professional'] },
    ],
  },
  {
    category: 'Data Analytics',
    roles: [
      { title: 'Cloud Data Engineer', does: 'Builds the pipelines that move, clean, and shape data for analysis.', chain: ['Cloud Practitioner', 'Data Engineer – Associate'] },
    ],
  },
  {
    category: 'Development',
    roles: [
      { title: 'Software Development Engineer', does: 'Writes and ships cloud-native applications and services.', chain: ['Cloud Practitioner', 'Developer – Associate'] },
    ],
  },
  {
    category: 'Operations',
    roles: [
      { title: 'Systems Administrator', does: 'Keeps cloud systems running, patched, and healthy day to day.', chain: ['Cloud Practitioner', 'SysOps – Associate'] },
      { title: 'Cloud Engineer', does: 'Builds and maintains the infrastructure that applications run on.', chain: ['Cloud Practitioner', 'Solutions Architect – Associate', 'SysOps – Associate'] },
    ],
  },
  {
    category: 'DevOps',
    roles: [
      { title: 'Test Engineer', does: 'Automates testing so releases stay fast and reliable.', chain: null },
      { title: 'Cloud DevOps Engineer', does: 'Automates build, release, and deployment pipelines.', chain: ['Cloud Practitioner', 'SysOps / Developer – Associate', 'DevOps Engineer – Professional'] },
      { title: 'DevSecOps Engineer', does: 'Bakes security into every step of the delivery pipeline.', chain: null },
    ],
  },
  {
    category: 'Security',
    roles: [
      { title: 'Cloud Security Engineer', does: 'Protects cloud workloads, identities, and data from threats.', chain: ['Cloud Practitioner', 'Solutions Architect – Associate', 'Security – Specialty'] },
      { title: 'Cloud Security Architect', does: 'Designs the security model for an entire cloud environment.', chain: null },
    ],
  },
  {
    category: 'Networking',
    roles: [
      { title: 'Network Engineer', does: 'Designs and runs cloud networking and connectivity.', chain: ['Cloud Practitioner', 'Solutions Architect – Associate', 'Advanced Networking – Specialty'] },
    ],
  },
  {
    category: 'AI / ML',
    roles: [
      { title: 'Machine Learning Engineer', does: 'Builds, trains, and deploys machine-learning models on the cloud.', chain: ['Cloud Practitioner', 'ML Engineer – Associate', { name: 'ML – Specialty', optional: true }] },
    ],
  },
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
        <span className="app-online" title={`${members.length} verified builders`}>
          <span className="dot" />
          <strong className="app-online-num">{members.length}</strong>
          <span className="app-online-label">verified builders</span>
        </span>
        <AccountMenu
          me={me}
          isAdmin={isAdmin}
          onEditProfile={() => setEditing(true)}
          onVerifyMembers={() => setTab('admin')}
        />
      </Brand>

      <main className="app-main">
        <TabStrip sections={SECTIONS} active={tab} onSelect={setTab} />

        {tab === 'home' && <HomeSection firstName={firstName} goTo={setTab} onEditProfile={() => setEditing(true)} />}
        {tab === 'learn' && <LearnSection />}
        {tab === 'events' && <EventsSection />}
        {tab === 'gallery' && <GallerySection />}
        {tab === 'team' && <TeamSection />}
        {tab === 'directory' && <Directory members={members} />}
        {tab === 'admin' && isAdmin && (
          <>
            <div className="section-head"><div className="ds-eyebrow">Admin</div><h2>Verify Members</h2></div>
            <AdminPanel idToken={idToken} onChange={load} showToast={showToast} />
          </>
        )}
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
// Horizontal tab rail. Stays a self-contained scroller (the body never scrolls
// sideways), but adds discoverability for the sections on a phone: edge fades
// that signal more tabs exist, and auto-scrolling the active tab into view.
function TabStrip({ sections, active, onSelect }) {
  const scrollerRef = useRef(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const updateFade = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setFade({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateFade();
    el.addEventListener('scroll', updateFade, { passive: true });
    window.addEventListener('resize', updateFade);
    return () => { el.removeEventListener('scroll', updateFade); window.removeEventListener('resize', updateFade); };
  }, [updateFade]);

  // Keep the selected tab visible even when it sits off-screen in the scroller.
  useEffect(() => {
    const el = scrollerRef.current;
    el?.querySelector('.tab.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <div className={`tabs-wrap${fade.left ? ' fade-left' : ''}${fade.right ? ' fade-right' : ''}`}>
      <nav className="tabs tabs--scroll" ref={scrollerRef}>
        {sections.map((s) => (
          <button key={s.id} className={`tab ${active === s.id ? 'active' : ''}`} onClick={() => onSelect(s.id)}>{s.label}</button>
        ))}
      </nav>
    </div>
  );
}

// Account menu behind the avatar: edit profile, Verify Members (admin), and —
// on mobile — Sign out (desktop keeps the inline Sign-out button). This is where
// the admin "Verify Members" action lives now, instead of in the tab strip.
function AccountMenu({ me, isAdmin, onEditProfile, onVerifyMembers }) {
  const { logout, name, email } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (fn) => () => { setOpen(false); fn?.(); };

  return (
    <div className="account" ref={ref}>
      <button className="account-trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="Account">
        <img className="app-avatar" src={avatarSrc(me)} alt="Your account" />
      </button>
      {open && (
        <div className="account-menu" role="menu">
          {(name || email) && <div className="account-head">{name || email}</div>}
          <button className="account-item" role="menuitem" onClick={pick(onEditProfile)}>Edit profile</button>
          {isAdmin && <button className="account-item" role="menuitem" onClick={pick(onVerifyMembers)}>Verify Members</button>}
          <button className="account-item account-item--signout account-item--danger" role="menuitem" onClick={pick(logout)}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function HomeSection({ firstName, goTo, onEditProfile }) {
  return (
    <section className="ds-animate-in">
      <div className="dash-welcome">
        <h1>Welcome back, {firstName}</h1>
        <p>Your journey from nothing to everything continues here.</p>
      </div>

      <div className="hub-mission ds-card">
        <div className="ds-eyebrow">Our mission</div>
        <p>We're the student builders of UNIZIK — a community of people who think like you and won't let you coast. We learn cloud, AI, and cloud security best practices together, but the real thing we're building is each other: pushing past the fear, onto a stage that's globally recognized, where your ability and who you are finally get seen. You don't rise here alone. You rise because the people around you refuse to let you stay small. No experience needed, no permission required. Just show up and build. From nothing, to everything.</p>
      </div>

      <div className="section-head" style={{ marginTop: 'var(--space-8)' }}>
        <div className="ds-eyebrow">Quick start</div>
        <h2>Get going in four steps</h2>
      </div>
      <div className="hub-grid">
        <a className="hub-card" href="https://community.aws/buildergroups" target="_blank" rel="noopener">
          <div className="hub-card-icon hub-card-icon--teams" aria-hidden="true" />
          <div className="hub-card-title">Join AWS Builder Center</div>
          <div className="hub-card-desc">Create your AWS Builder ID and plug into the global builder community.</div>
          <span className="hub-card-cta">community.aws ↗</span>
        </a>
        <button className="hub-card" onClick={() => goTo('events')}>
          <div className="hub-card-icon hub-card-icon--clock" aria-hidden="true" />
          <div className="hub-card-title">Come to our next event</div>
          <div className="hub-card-desc">Workshops, study jams, and hangouts. See what's coming up.</div>
          <span className="hub-card-cta">View events →</span>
        </button>
        <a className="hub-card" href="https://chat.whatsapp.com/GYoJICzgnX65PkKq6R1qX3" target="_blank" rel="noopener">
          <div className="hub-card-icon hub-card-icon--speaker" aria-hidden="true" />
          <div className="hub-card-title">Join us on WhatsApp</div>
          <div className="hub-card-desc">Our main room — announcements, resources, and daily chatter.</div>
          <span className="hub-card-cta">Open WhatsApp ↗</span>
        </a>
        <button className="hub-card" onClick={onEditProfile}>
          <div className="hub-card-icon hub-card-icon--smile" aria-hidden="true" />
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
          <li>🎉 Invite your friends to join us — the best builders come in groups.</li>
        </ul>
      </div>

      <div className="section-head" style={{ marginTop: 'var(--space-8)' }}>
        <div className="ds-eyebrow">Community channels</div>
        <h2>Find us everywhere</h2>
      </div>
      <div className="channel-grid">
        {CHANNELS.map((c) => {
          const live = !!c.url;
          const inner = (
            <>
              <div className="channel-icon" style={{ color: c.color }}><BrandIcon name={c.brand} /></div>
              <div className="channel-body">
                <div className="channel-name">
                  {c.name}
                  {!live && <span className="ds-tag channel-soon">Coming soon</span>}
                </div>
                <div className="channel-blurb">{c.blurb}</div>
              </div>
              {live
                ? <span className="channel-cta">{c.action} ↗</span>
                : <span className="channel-handle">{c.handle}</span>}
            </>
          );
          return live
            ? <a key={c.name} className="channel-card" href={c.url} target="_blank" rel="noopener">{inner}</a>
            : <div key={c.name} className="channel-card is-soon" aria-disabled="true">{inner}</div>;
        })}
      </div>
    </section>
  );
}

// Tier of a cert from its general name — drives the colour, so the foundation →
// associate → professional progression reads consistently across every chain.
function certTier(name) {
  if (/Professional|Specialty|Advanced/.test(name)) return 'pro';
  if (/Associate/.test(name)) return 'assoc';
  return 'foundation';
}

// One styled cert pill. `optional` certs read as a dashed "nice to have".
function CertNode({ name, optional }) {
  return (
    <span className={`cert-node cert-node--${certTier(name)}${optional ? ' cert-node--optional' : ''}`}>
      {name}{optional && <em className="cert-opt"> · optional</em>}
    </span>
  );
}

// A horizontal progression: pills joined by arrows. Wraps cleanly on mobile.
function CertChain({ chain }) {
  if (!chain) {
    return <div className="cert-chain cert-chain--unset">Path varies — view on AWS</div>;
  }
  return (
    <div className="cert-chain">
      {chain.map((step, i) => {
        const node = typeof step === 'string' ? { name: step } : step;
        return (
          <span className="cert-link" key={node.name}>
            {i > 0 && <span className="cert-arrow" aria-hidden="true">→</span>}
            <CertNode name={node.name} optional={node.optional} />
          </span>
        );
      })}
    </div>
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

      {/* Where do I start? — entry-point guidance */}
      <div className="learn-block ds-card">
        <h3>Where do I start?</h3>
        <p className="ds-muted">Pick the entry point that matches where you're coming from.</p>
        <div className="hub-grid" style={{ marginTop: 'var(--space-5)' }}>
          {CERT_START.map((s) => (
            <a className="hub-card" href={s.url} target="_blank" rel="noopener" key={s.tag}>
              <span className="ds-tag ds-tag--filled">{s.tag}</span>
              <div className="hub-card-desc">{s.desc}</div>
              <span className="hub-card-cta">View on AWS ↗</span>
            </a>
          ))}
        </div>
      </div>

      {/* Certification paths by career role */}
      <div className="learn-block ds-card" style={{ marginTop: 'var(--space-6)' }}>
        <h3>Certification paths by career role</h3>
        <p className="ds-muted">Pick a role, follow the chain. Each step is an AWS certification — names kept general; tap through to AWS for exam detail.</p>

        <div className="cert-legend" aria-hidden="true">
          <span className="cert-node cert-node--foundation">Foundational</span>
          <span className="cert-arrow">→</span>
          <span className="cert-node cert-node--assoc">Associate</span>
          <span className="cert-arrow">→</span>
          <span className="cert-node cert-node--pro">Professional / Specialty</span>
        </div>

        {CERT_PATHS.map((cat) => (
          <div className="cert-category" key={cat.category}>
            <div className="cert-cat-head">{cat.category}</div>
            <div className="cert-role-grid">
              {cat.roles.map((r) => (
                <div className="cert-role-card" key={r.title}>
                  <div className="cert-role-title">{r.title}</div>
                  <div className="cert-role-does">{r.does}</div>
                  <CertChain chain={r.chain} />
                  <a className="hub-card-cta cert-role-link" href={AWS_CERT_HUB} target="_blank" rel="noopener">View on AWS →</a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Hands-on + community resources */}
      <div className="learn-block ds-card" style={{ marginTop: 'var(--space-6)' }}>
        <h3>Build hands-on skills</h3>
        <p className="ds-muted">Learn by doing — free, self-paced, and plugged into the wider community.</p>
        <div className="hub-grid" style={{ marginTop: 'var(--space-5)' }}>
          <a className="hub-card" href="https://skillbuilder.aws" target="_blank" rel="noopener">
            <div className="hub-card-icon hub-card-icon--wrench" aria-hidden="true" />
            <div className="hub-card-title">AWS Skill Builder</div>
            <div className="hub-card-desc">Hundreds of free, self-paced digital courses straight from AWS.</div>
            <span className="hub-card-cta">skillbuilder.aws ↗</span>
          </a>
          <a className="hub-card" href="https://aws.amazon.com/training/digital/aws-cloud-quest/" target="_blank" rel="noopener">
            <div className="hub-card-icon hub-card-icon--trophy" aria-hidden="true" />
            <div className="hub-card-title">AWS Cloud Quest</div>
            <div className="hub-card-desc">Learn by solving real cloud challenges in a role-playing game.</div>
            <span className="hub-card-cta">Play Cloud Quest ↗</span>
          </a>
          <a className="hub-card" href="https://community.aws/buildergroups" target="_blank" rel="noopener">
            <div className="hub-card-icon hub-card-icon--teams" aria-hidden="true" />
            <div className="hub-card-title">AWS Builder Center</div>
            <div className="hub-card-desc">Create a Builder ID and join the global builder community.</div>
            <span className="hub-card-cta">community.aws ↗</span>
          </a>
          <a className="hub-card" href="https://aws.amazon.com/developer/community/usergroups/" target="_blank" rel="noopener">
            <div className="hub-card-icon hub-card-icon--drop" aria-hidden="true" />
            <div className="hub-card-title">AWS User Groups</div>
            <div className="hub-card-desc">Find a local group of builders meeting near you.</div>
            <span className="hub-card-cta">Find a group ↗</span>
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
        {/* Until MEETUP_URL is set, show a non-clickable "coming soon" instead of a dead link. */}
        {MEETUP_URL
          ? <a className="ds-btn ds-btn--secondary" href={MEETUP_URL} target="_blank" rel="noopener">📍 Join our Meetup group</a>
          : <span className="ds-btn ds-btn--secondary is-soon" aria-disabled="true">📍 Meetup group — coming soon</span>}
      </div>

      {EVENTS.length === 0 ? (
        <div className="empty">No events scheduled yet — check our Meetup for what's coming.</div>
      ) : (
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
      )}
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
      {GALLERY.length === 0 ? (
        <div className="empty">Photos from past events coming soon.</div>
      ) : (
        <div className="gallery-grid">
          {GALLERY.map((g, i) => (
            <div className="gallery-item" key={i}>
              <img src={g.src} alt={g.alt} loading="lazy" />
            </div>
          ))}
        </div>
      )}
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
        {m.github && <a className="m-social" href={`https://github.com/${m.github}`} target="_blank" rel="noopener" title="GitHub" aria-label="GitHub"><BrandIcon name="github" /></a>}
        {m.linkedin && <a className="m-social" href={m.linkedin} target="_blank" rel="noopener" title="LinkedIn" aria-label="LinkedIn"><BrandIcon name="linkedin" /></a>}
        {m.twitter && <a className="m-social" href={`https://twitter.com/${m.twitter.replace('@', '')}`} target="_blank" rel="noopener" title="X" aria-label="X"><BrandIcon name="x" /></a>}
      </div>
    </div>
  );
}

// ---- Edit own profile (persists via PUT /me) ----
// Editable fields the form tracks. Matric and email are deliberately NOT here —
// they're shown read-only below (identity fields set at registration).
const EDITABLE = ['fullName', 'department', 'level', 'bio', 'github', 'linkedin', 'twitter', 'phone'];

function EditProfile({ me, idToken, onClose, onSaved, showToast }) {
  const [form, setForm] = useState(() =>
    EDITABLE.reduce((acc, k) => ({ ...acc, [k]: me[k] || '' }), {})
  );
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState(avatarSrc(me));
  const [errors, setErrors] = useState({});
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

  // Same required fields the registration flow enforces (matric/email aside,
  // since those aren't editable here).
  function validate() {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required';
    if (!form.department) e.department = 'Select your faculty';
    if (!form.level) e.level = 'Select your level';
    if (!form.github.trim()) e.github = 'GitHub username is required';
    if (form.phone.trim() && !/^0[789][01]\d{8}$/.test(form.phone.replace(/\s/g, '')))
      e.phone = 'Enter a valid Nigerian number';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      // Send only the fields that actually changed.
      const updates = {};
      for (const k of EDITABLE) {
        const next = k === 'phone' ? form[k].replace(/\s/g, '') : form[k];
        if (next !== (me[k] || '')) updates[k] = next;
      }
      if (avatarFile) updates.avatarKey = await uploadAvatar(idToken, avatarFile);

      if (Object.keys(updates).length === 0) { onClose(); return; }

      const res = await api.updateMe(idToken, updates);
      // Show the new photo immediately via the local preview; the next /me
      // refetch swaps in the presigned URL the backend now returns.
      const optimistic = avatarFile ? { avatarUrl: preview } : {};
      onSaved({ ...me, ...updates, ...optimistic, ...(res.profile || {}) });
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

          <div className="field"><label className="ds-label">Full name</label><input className="ds-input" value={form.fullName} onChange={set('fullName')} />{errors.fullName && <div className="ds-error">{errors.fullName}</div>}</div>

          <div className="field"><label className="ds-label">Department / Faculty</label>
            <select className="ds-input" value={form.department} onChange={set('department')}>
              <option value="">Select your faculty</option>
              {FACULTIES.map((f) => <option key={f}>{f}</option>)}
            </select>
            {errors.department && <div className="ds-error">{errors.department}</div>}
          </div>

          <div className="field"><label className="ds-label">Academic level</label>
            <select className="ds-input" value={form.level} onChange={set('level')}>
              <option value="">Select level</option>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
            {errors.level && <div className="ds-error">{errors.level}</div>}
          </div>

          <div className="field"><label className="ds-label">Bio</label><textarea className="ds-input" rows={3} maxLength={160} value={form.bio} onChange={set('bio')} /></div>
          <div className="field"><label className="ds-label">GitHub</label><div className="gh-field"><span className="gh-prefix">github.com/</span><input value={form.github} onChange={set('github')} autoCapitalize="none" /></div>{errors.github && <div className="ds-error">{errors.github}</div>}</div>
          <div className="field"><label className="ds-label">LinkedIn</label><input className="ds-input" value={form.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/…" /></div>
          <div className="field"><label className="ds-label">Twitter / X</label><input className="ds-input" value={form.twitter} onChange={set('twitter')} autoCapitalize="none" /></div>
          <div className="field"><label className="ds-label">Phone <span className="opt">(private)</span></label><input className="ds-input" value={form.phone} onChange={set('phone')} />{errors.phone && <div className="ds-error">{errors.phone}</div>}</div>

          {/* Identity fields — shown for reference, set at registration, not editable here. */}
          <div className="field"><label className="ds-label">Matric number <span className="opt">🔒 can't be changed</span></label><input className="ds-input" value={me.matric || '—'} disabled /></div>
          <div className="field"><label className="ds-label">Email <span className="opt">🔒 can't be changed</span></label><input className="ds-input" value={me.email || '—'} disabled /></div>

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
