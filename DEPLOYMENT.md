# Deployment Guide

This takes the project from a folder on your machine to a live system on AWS. It's written in phases on purpose: you can get the backend running and preview the whole app **locally** before you ever touch the domain. Don't skip ahead — each phase assumes the one before it worked.

A quick map of what you're deploying:

```
landing/  → static page        → S3 + CloudFront  (apex: unizikbuilders.tech)
app/      → React membership app → S3 + CloudFront  (aws.unizikbuilders.tech)
infra/    → the AWS backend, as code → Cognito, API Gateway, Lambda, DynamoDB, S3, WAF
```

---

## Phase 0 — Prerequisites

You need these before anything else. Install/verify them once.

- **An AWS account** with admin access for setup.
- **AWS CLI** installed and configured (`aws configure`) — run `aws sts get-caller-identity` to confirm it works.
- **Node.js 18 or newer** — check with `node -v`.
- **The AWS region decided.** Use **us-east-1**. CloudFront requires its TLS certificate in us-east-1, and deploying everything there keeps it simple.

You do **not** need the domain yet. That's Phase 4.

---

## Phase 1 — Get the code and install dependencies

Unzip the project, then install both halves:

```bash
cd unizik-builders-hub

# backend
cd infra && npm install && cd ..

# frontend
cd app && npm install && cd ..
```

---

## Phase 2 — Deploy the backend (no domain needed)

This creates Cognito, the API, the Lambdas, DynamoDB, and the avatar bucket. It does **not** need your domain, so we deploy these three stacks now and leave hosting for later.

```bash
cd infra

# First time only, per account+region:
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1

# Deploy just the backend stacks (skip hosting for now):
npx cdk deploy asbu-dev-data asbu-dev-auth asbu-dev-api
```

When it finishes, CDK prints **outputs**. Copy these four — you need them next:

- `ApiUrl` (from the api stack)
- `LoginDomain` (from the auth stack)
- `UserPoolClientId` (from the auth stack)
- *(the redirect URI you'll set yourself — for local dev it's `http://localhost:5173/callback`)*

If you ever lose them: `aws cloudformation describe-stacks --stack-name asbu-dev-auth` shows them again.

---

## Phase 3 — Wire and preview the app locally

Create `app/.env.local` from the example and paste in your Phase 2 outputs:

```bash
cd app
cp .env.example .env.local
# then edit .env.local:
#   VITE_API_URL=<ApiUrl>
#   VITE_COGNITO_DOMAIN=https://<LoginDomain>
#   VITE_USER_POOL_CLIENT_ID=<UserPoolClientId>
#   VITE_REDIRECT_URI=http://localhost:5173/callback
```

One thing to set in Cognito so local login works: the app client's callback URL must include `http://localhost:5173/callback`. The dev stack already sets that. Now run it:

```bash
npm run dev
```

Open `http://localhost:5173`. You can sign up with email, land in the four-step register flow, submit, and hit the "pending" screen. To see the dashboard, you need to verify yourself as a member (Phase 5 explains the admin step), or temporarily flip your own record's status to `VERIFIED` in the DynamoDB console.

At this point the **whole system works locally against real AWS.** The landing page you can open directly (`landing/index.html`) anytime.

---

## Phase 4 — The domain and going live (when you're ready)

This is the part that needs `unizikbuilders.tech`.

1. **Create a Route 53 hosted zone** for `unizikbuilders.tech`, then go to your `.tech` registrar and point the domain's nameservers at the four Route 53 nameservers. DNS propagation can take a few hours — do this first.
2. **Deploy everything**, this time including hosting and as the prod stage:
   ```bash
   cd infra
   npx cdk deploy --all -c stage=prod
   ```
   This provisions the CloudFront distributions, the ACM certificate (validated automatically through your hosted zone), and the DNS records for `unizikbuilders.tech` and `aws.unizikbuilders.tech`. It also uploads the landing page automatically.
3. **Build and ship the app frontend.** CDK deploys the landing page for you but not the React build, so:
   ```bash
   cd app
   # update .env.local first: VITE_REDIRECT_URI=https://aws.unizikbuilders.tech/callback
   npm run build
   aws s3 sync dist "s3://<AppBucketName>" --delete
   aws cloudfront create-invalidation --distribution-id <AppDistributionId> --paths "/*"
   ```
   `AppBucketName` and `AppDistributionId` are outputs of the hosting stack.

After DNS propagates: `unizikbuilders.tech` serves the landing page and `aws.unizikbuilders.tech` serves the app, both on HTTPS.

---

## Phase 5 — Post-deploy setup

**Make yourself an admin.** Admin rights come from the Cognito `admin` group, not a password in the code. After you've signed up once:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username <your-cognito-username> \
  --group-name admin
```

Sign out and back in (so a fresh token carries the group claim) and the "Verify Members" tab appears. From there you approve real members — which is also how you get yourself from PENDING to VERIFIED.

**Google sign-in (optional).** To enable it, create OAuth credentials in the Google Cloud console, add your Cognito domain as an authorized origin and `<LoginDomain>/oauth2/idpresponse` as the redirect URI, then redeploy auth with the creds passed as context:

```bash
npx cdk deploy asbu-prod-auth -c stage=prod \
  -c googleClientId=XXX -c googleClientSecret=YYY
```

The app's "Continue with Google" button already points at the right flow; it just needs the provider wired.

**Email (not built yet — be aware).** The architecture plans SES welcome/verification emails, but I haven't coded the SES-sending Lambda yet because it depends on your domain clearing the SES sandbox. When you're ready: verify the domain in SES with SPF/DKIM/DMARC records, request production access (approval takes a day or two), and we add a small Lambda triggered on successful registration. Until then, registration works fine — it just doesn't send a welcome email.

---

## Phase 6 — CI/CD (optional, later)

`.github/workflows/deploy.yml` automates all of the above on every push to `main`, authenticating via GitHub OIDC (no stored AWS keys). Turn it on only after you've deployed by hand once and created the OIDC role in IAM. The workflow file has the required variables listed at the top.

---

## Tearing it down

Everything is reproducible, so it's also fully removable:

```bash
cd infra
npx cdk destroy --all
```

The dev stacks delete cleanly. Prod buckets and the user pool are set to **retain** on purpose, so member data and uploads aren't wiped by an accidental destroy — you remove those manually if you truly mean to.
