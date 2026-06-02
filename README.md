# UNIZIK Builders Hub

> The tech community for builders at Nnamdi Azikiwe University, Awka — and the membership platform behind AWS Student Builders UNIZIK.

I run the AWS Student Builders community at UNIZIK (we were the AWS Cloud Club before the rename). This repo is two things that share a brand and a domain: a landing page that gets students into the community, and a real membership platform where they sign up, build a profile, and show up in a member directory. The landing page brings people in. The platform is what they join.

If you want the engineering reasoning — why these services, what I turned down, how the data is modelled — that's in [`ARCHITECTURE.md`](./ARCHITECTURE.md). This README is the practical side: what's here and how to run it.

---

## The two surfaces

**The hub** (`unizikbuilders.tech`) is a single static page. Its whole job is to turn a cold visitor into a WhatsApp join in one tap, and to make the community feel real before anyone commits. No login, no backend, loads fast on a cheap phone on a weak network — because that's who's visiting, here in Awka.

**The platform** (`app.unizikbuilders.tech`) is the application. Sign up with email or Google, build a profile, edit it whenever, and appear in the member directory. There's an admin path for verifying new members. This is where the real engineering lives — auth, a database, file storage, an API.

I keep them separate on purpose. The landing page should never be slowed down or put at risk by the app, and the app should be free to grow without dragging a marketing page behind it. Same brand, same domain, different deployments.

---

## The communities

| Group | What it's for |
|-------|--------------|
| AWS Student Builders | Cloud engineering, AWS projects, and the Cloud Club at UNIZIK |
| Tech Careers & Internships | Job listings, internship drops, CV reviews, interview prep |
| Open Source Contributors | PRs, contribution guides, building your GitHub presence |
| GitHub Community UNIZIK | Version control, collaboration, building in public |
| Day Zero | The inner circle. From Nothing, To Everything. |
| General | Open floor — introductions, random tech talk, questions |

---

## Stack

**Front end**
- Static landing page — HTML, CSS, vanilla JS, no build step
- Membership app — React (SPA), built with Vite
- Shared design system — one set of tokens (colour, type, spacing) across every surface
- Fonts — Syne (display), Space Mono (mono), DM Sans (body)
- Google Analytics 4 on the landing page

**Back end (all AWS, all defined in code)**
- Amazon Cognito — auth (email + password, and Google sign-in), Essentials tier, Managed Login
- API Gateway + Lambda (Python) — the API
- DynamoDB — member data, single-table design
- S3 — static hosting and profile pictures (uploaded via presigned URLs)
- CloudFront + ACM + Route 53 — CDN, TLS, DNS
- SES — verification and welcome emails
- WAF — rate limiting and bot protection on the public endpoints

**Infrastructure & delivery**
- AWS CDK (TypeScript) — the whole backend is defined in code, not clicked together
- GitHub Actions — CI/CD, authenticating to AWS via OIDC (no long-lived keys)
- CloudWatch + X-Ray — logs, dashboards, alarms, tracing
- AWS Budgets — a cost guardrail, because the endpoints are public

---

## Repo structure

```
.
├── landing/                 # the static hub page (unizikbuilders.tech)
│   └── index.html
├── app/                     # the React membership platform (app.unizikbuilders.tech)
│   ├── src/
│   └── index.html
├── api/                     # Lambda functions (Python)
│   ├── register/
│   ├── profile/
│   ├── directory/
│   └── admin/
├── infra/                   # AWS CDK (TypeScript) — all the infrastructure
│   ├── bin/
│   └── lib/
├── shared/
│   └── design-system.css    # shared tokens, used by every surface
├── ARCHITECTURE.md          # why it's built this way
└── README.md
```

---

## Running it locally

**The landing page** needs nothing. Open `landing/index.html` in a browser, or serve it:

```bash
cd landing
python3 -m http.server 8000
```

**The app** needs Node 18+:

```bash
cd app
npm install
npm run dev
```

It expects a `.env` with the IDs the front end needs to talk to Cognito and the API:

```
VITE_COGNITO_USER_POOL_ID=...
VITE_COGNITO_CLIENT_ID=...
VITE_API_BASE_URL=...
```

Those values come out of the CDK deploy below — the stack prints them as outputs.

---

## Deploying

Everything is reproducible. The infrastructure is one command up and one command down.

**You'll need first:**
- An AWS account, the AWS CLI configured, and CDK bootstrapped in your region (`cdk bootstrap`)
- `unizikbuilders.tech` with its DNS in a Route 53 hosted zone (subdomains like `app.` are free — they're just records in the zone you already own)
- A Google OAuth client (Cloud Console → Credentials) for the Google sign-in option — you pass its client ID and secret into the stack
- SES out of the sandbox: request production access early (it takes a day or two to approve) and verify the domain with SPF, DKIM, and DMARC so mail actually lands

**Backend:**

```bash
cd infra
npm install
cdk deploy --all
```

That stands up Cognito, DynamoDB, the Lambdas, API Gateway, the S3 buckets, CloudFront, and WAF. The outputs give you the user pool ID, client ID, and API URL for the app's `.env`.

**Front end** (both surfaces are static, synced to S3 and served through CloudFront):

```bash
# landing
aws s3 sync landing/ s3://<landing-bucket> --delete
# app
cd app && npm run build && aws s3 sync dist/ s3://<app-bucket> --delete
```

Then invalidate the CloudFront cache so the new files go live. In practice I don't run these by hand — a push to `main` triggers the GitHub Actions pipeline, which builds, syncs, invalidates, and runs `cdk deploy`, all authenticated through OIDC with no stored keys.

---

## Environments

There's at least a `dev` and a `prod`, so I'm never testing against the data real members are in. CDK makes this clean — same code, different context, separate stacks.

---

## A note on privacy

The registration form collects matric numbers, phone numbers, and emails. That's personal data and I treat it that way. The public member directory shows only what's safe to share — name, builder tag, bio, and the social links a member chose to add. The private fields (matric, email, phone) are returned only to the member who owns them and to an admin; the directory query reads a projection that doesn't even include them. There's a real consent step at sign-up and a short privacy notice. Member data is the one thing in this system I can't regenerate, so DynamoDB point-in-time recovery is on.

---

## Status

Honest about where things are:

- **Live / building:** landing page, the design system, registration + login (Cognito), the member directory, profile editing, admin verification, the CDK backend
- **Deferred on purpose:** member-to-member chat (the dashboard has a mock; a real one needs WebSockets and presence — that's its own project), live event RSVPs, the photo gallery. Accounts, profiles, and the directory get to be genuinely solid with real members first, then I build outward.
- **Gone:** the fake member cards and the invented "243 online" counter from the early prototype. Every number on this platform is a real one or it isn't there.

---

## Connect

- WhatsApp community → https://chat.whatsapp.com/GYoJICzgnX65PkKq6R1qX3
- LinkedIn → [AWS Student Builders UNIZIK](https://www.linkedin.com/company/aws-student-builders-unizik/)
- Built by **Donald** — AWS Cloud Club Captain, UNIZIK · [@donaldraph](https://github.com/donaldraph)

---

*If you're a student at UNIZIK and you build things — this community is for you.*
