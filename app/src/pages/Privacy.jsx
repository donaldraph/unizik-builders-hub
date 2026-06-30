import { Link } from 'react-router-dom';

// Public, no-auth page. Google's verification reviewers and prospective
// members read this before creating an account, so it must render without a
// session. Same brand language as the rest of the app (dark editorial band +
// light reading panel), tuned for long-form reading instead of the auth split.

// The peaked-arch wordmark, matching Brand in Shell.jsx / ArchMark in Auth.jsx.
const ArchMark = () => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="4" y="18" width="7" height="16" fill="#1A4FAF" />
    <rect x="29" y="18" width="7" height="16" fill="#1A4FAF" />
    <rect x="2" y="15" width="36" height="6" rx="3" fill="#FF9900" />
    <rect x="17" y="5" width="6" height="13" fill="rgba(255,255,255,0.9)" />
    <polygon points="17,5 20,0 23,5" fill="#FF9900" />
  </svg>
);

function Section({ title, children }) {
  return (
    <section className="privacy-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="privacy-page">
      <header className="privacy-nav">
        <Link className="ds-logo" to="/">
          <span className="ds-logo-mark"><ArchMark /></span>
          <span className="ds-logo-text">
            <span className="ds-logo-name"><span className="ds-logo-aws">AWS</span><span className="ds-logo-rest"> STUDENT BUILDERS</span></span>
            <span className="ds-logo-sub">UNIZIK</span>
          </span>
        </Link>
        <Link className="privacy-nav-link" to="/auth">Sign in →</Link>
      </header>

      <div className="privacy-hero" data-theme="dark">
        <div className="privacy-hero-inner ds-animate-in">
          <p className="ds-eyebrow">// AWS Student Builders · UNIZIK</p>
          <h1 className="privacy-hero-title">Privacy Policy</h1>
          <p className="privacy-hero-date">Last updated: June 2026</p>
        </div>
      </div>

      <main className="privacy-article ds-animate-in">
        <p className="privacy-lede">
          This is the privacy policy for AWS Student Builders UNIZIK — the membership
          platform at aws.unizikbuilders.tech, run by the AWS Student Builder Group at
          Nnamdi Azikiwe University (UNIZIK).
        </p>
        <p>
          We're a small student community, not a company with a legal team. This policy
          is written so you can actually read it and understand what we do with your
          information.
        </p>

        <Section title="What we collect">
          <p>When you sign up, we collect:</p>
          <ul>
            <li>Your full name</li>
            <li>Your matric number</li>
            <li>Your department/faculty and academic level</li>
            <li>Your email address</li>
            <li>Your phone number</li>
            <li>
              A password (if you sign up with email — we never see the actual password;
              it's handled by Amazon Cognito, our authentication provider)
            </li>
            <li>Your GitHub username</li>
            <li>Optionally: a profile photo, a short bio, your LinkedIn URL, and your Twitter/X handle</li>
          </ul>
          <p>
            If you sign in with Google instead of email, Google shares your name, email,
            and profile picture with us — nothing more.
          </p>
          <p>
            We don't ask for your payment details or your exact location, and nothing here
            goes further than what's needed to confirm you're a real UNIZIK student and let
            you join the community.
          </p>
        </Section>

        <Section title="What's public vs. what stays private">
          <p>
            <strong>Visible to other verified members in the directory:</strong> your name,
            your builder tag, your bio, your profile photo, and any social links you add
            (GitHub, LinkedIn, Twitter/X).
          </p>
          <p>
            <strong>Kept private, visible only to you and our admin team:</strong> your
            matric number, your email address, your phone number, your department, and your
            academic level.
          </p>
        </Section>

        <Section title="Why we collect it">
          <ul>
            <li>Your matric number, department, and level let us confirm you're an actual UNIZIK student before approving your membership.</li>
            <li>Your email and phone number let us reach you about your account and the community.</li>
            <li>Your name, photo, bio, and social links make up your profile in the member directory, so other members can see who you are and what you're building.</li>
            <li>We use your email to send you account-related messages: your sign-up verification code, a welcome message when you're approved, and occasional updates about events or opportunities.</li>
          </ul>
        </Section>

        <Section title="Who sees your information">
          <ul>
            <li>Other verified members can see the public parts of your profile in the member directory (see above).</li>
            <li>Our admin team can see your full registration details, including the private fields, to review and approve new members.</li>
            <li>We don't sell your information. We don't share it with advertisers. We don't hand it over to anyone outside this community for any commercial purpose.</li>
          </ul>
        </Section>

        <Section title="How we store it">
          <p>
            Your account and profile data live in Amazon Web Services (AWS) — the same
            infrastructure that powers this site. Authentication is handled by Amazon
            Cognito. We don't run our own separate database of passwords; Cognito manages
            that securely, and we never see your raw password. Profile photos are stored in
            Amazon S3.
          </p>
        </Section>

        <Section title="Email">
          <p>
            Account emails (verification codes, password resets, welcome messages) are sent
            through Resend, an email delivery service, from addresses on our own domain
            (unizikbuilders.tech). If we ever send broader community announcements, they'll
            only go to members who signed up — we don't buy or rent email lists, and we
            don't email anyone who isn't already part of the community.
          </p>
        </Section>

        <Section title="Google sign-in">
          <p>
            If you choose "Continue with Google," we receive your name, email, and profile
            picture from Google — that's all. We don't get access to your Google Drive, your
            contacts, your calendar, or anything else in your Google account. You can review
            or revoke this access anytime from your own Google Account settings.
          </p>
        </Section>

        <Section title="Your choices">
          <ul>
            <li>You can ask us to delete your account and remove your data from our system at any time — just contact an admin.</li>
            <li>You can update most of your profile information yourself once you're signed in.</li>
            <li>If you signed in with Google, you can disconnect that access from your Google Account settings whenever you want.</li>
          </ul>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change how we handle your data in any meaningful way, we'll update this
            page. We're not going to quietly change the rules on you.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            If you have questions about any of this, reach out to us through the community —
            or email <a className="privacy-mail" href="mailto:donaldraph@unizikbuilders.tech">donaldraph@unizikbuilders.tech</a>.
          </p>
        </Section>

        <p className="privacy-foot">
          <Link to="/">← Back to AWS Student Builders UNIZIK</Link>
        </p>
      </main>
    </div>
  );
}
