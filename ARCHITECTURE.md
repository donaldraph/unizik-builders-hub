# Architecture & Engineering Decisions

**UNIZIK Builders Hub · AWS Student Builders UNIZIK**
Maintained by Donald — AWS Cloud Club Captain, Nnamdi Azikiwe University, Awka

---

This is the document I wish more student projects had: not a list of services, but the reasoning. Why I picked the things I picked, what I turned down, and where I made a pragmatic call instead of a perfect one. I run the AWS Student Builders community at UNIZIK (we were the AWS Cloud Club before the rename), and I built this platform partly because the community needed it and partly because I wanted a real production system on AWS that I run, not a tutorial I followed. If you're reading this as a reviewer — Campus Expert, Community Builder, a visa panel, a recruiter — this is the part that shows how I think.

## What I'm actually building

There are two surfaces, and they do different jobs, so I treat them as two different things.

The first is the **hub landing page**. It's a single static page whose entire purpose is to take a cold visitor and get them into the WhatsApp community in one tap. No login, no database, nothing to maintain. It loads fast on a cheap Android phone on a weak network in Awka, because that's who's visiting. I measure one thing on it: how many people who land actually click through to WhatsApp.

The second is the **membership platform** — registration, login, and a member dashboard for AWS Student Builders. This is the real application. People create an account, build a profile, edit it later, and show up in a member directory. It needs auth, a database, file storage for profile pictures, and an admin path to verify new members. This is where almost all the engineering lives.

I'm keeping these separate on purpose. The landing page should never be slowed down or put at risk by the application, and the application should be free to grow without dragging a marketing page along with it. They share a brand and a domain. They don't share a deployment.

## How the domain holds both

I own one domain, `unizikbuilders.tech`, and I'm serving both surfaces from it using subdomains:

- `unizikbuilders.tech` → the static hub landing page
- `app.unizikbuilders.tech` → the membership platform

A subdomain costs nothing extra. It's a DNS record under a zone I already control, not a new registration. Route 53 holds the hosted zone, ACM issues free TLS certificates for both names, and each surface gets its own CloudFront distribution. I went with a subdomain split rather than path-based routing (`/`, `/join`, `/dashboard` on one origin) because the two surfaces have genuinely different lifecycles — the app will deploy ten times for every once the landing page changes — and coupling them behind one distribution would mean every app deploy risks the page that brings people in. Subdomains keep the blast radius small. It's also just how a real organisation lays this out, and the whole point is to look like one.

## Hosting the front end — and why not Amplify

Both front ends are static assets sitting in **S3**, served through **CloudFront** with **ACM** certs and **Route 53** for DNS. CloudFront gives me TLS, global caching, and a sensible place to attach a firewall later. S3 is the cheapest durable storage I'll ever find. This pattern is old and boring, which is exactly why I trust it.

The obvious shortcut here is AWS Amplify. It would have given me Git-based deploys, automatic SSL, preview environments, and Cognito wiring almost for free, and for most people I'd tell them to use it. I deliberately didn't, and the reason is specific to me. Amplify's value is that it hides the infrastructure — it abstracts the CloudFront config, the bucket policies, the IAM, the API wiring — and the infrastructure is the exact thing this project is supposed to prove I can do. A cloud engineer who ships through Amplify has a working app and a thin story. I'd rather wire CloudFront to S3 myself, write the origin access control, set the cache behaviours, and own it. Amplify Gen 2 is built on CDK underneath anyway, so I'm just choosing to work one layer down, where the engineering is visible.

I also rejected anything with a server — no EC2, no always-on container — for the front end. There's nothing to run. Static files don't need a machine sitting there waiting, and I'm not going to pay for idle compute or patch an OS to serve HTML.

## Authentication — Cognito, and why I'm not rolling my own

Auth is **Amazon Cognito** on the Essentials tier, with email-and-password sign-up plus Google as a federated sign-in option, fronted by Cognito's Managed Login.

I want to be honest about why I'm not building auth myself: because storing passwords correctly, handling token refresh, doing email verification, surviving a credential-stuffing attempt, and not leaking anything is a genuinely hard problem that has nothing to do with what makes this project interesting. Every hour I spend reinventing a login box is an hour I'm not spending on the parts that are actually mine. Cognito handles the password hashing, the verification emails, the JWTs, and the session lifecycle, and it does it in a way I can defend in a security review.

I picked it over Auth0 and the other hosted identity providers for two reasons. One is cost shape — Cognito Essentials includes a free tier of 10,000 monthly active users for direct and social sign-ins, and I will not come close to that, so this is effectively free at my scale. The other is that AWS is my lane; a project meant to position me as an AWS engineer should use the AWS-native identity service. The honest downside is lock-in — Cognito is harder to migrate away from than a self-hosted option — but for a community that lives entirely on AWS, that's a trade I'm comfortable making.

Two things I'm doing carefully inside Cognito. First, the user's identity everywhere in my system is their Cognito `sub` (a stable UUID), never their email. Emails change; the sub doesn't, and keying anything off email is a bug waiting to happen. Second, I'm using Cognito groups for the admin role rather than the thing the current prototype does, which is a hardcoded secret key sitting in client-side JavaScript that anyone can read in two clicks. Admin status is a claim in a signed token that the backend checks. It is never decided in the browser.

## The API and the compute behind it

The application talks to **API Gateway**, which routes to **Lambda** functions written in **Python**. Cognito sits in front of the protected routes as an authorizer, so a request without a valid token never reaches my code.

I went serverless rather than running a backend on EC2 or Fargate because the workload is bursty and small. Registrations come in clusters — a flyer goes out, fifty people sign up in an afternoon, then it's quiet for days. Paying for a server to sit idle through the quiet stretches makes no sense, and Lambda's scale-to-zero matches the traffic shape exactly. I also don't want to own an operating system, a runtime patch cycle, or a load balancer for what is, most of the time, a handful of requests an hour. Python because it's where my certification prep already is, and because the Lambda cold-start and library story for this kind of light CRUD work is fine.

The functions are small and single-purpose: register a member, get my own profile, update my profile, get a presigned upload URL, list the public directory, and the admin-only verify and list-pending actions. Keeping them narrow makes the IAM permissions narrow, which is the whole game with least privilege.

## The database — DynamoDB, not Postgres

Member data lives in **DynamoDB**, single-table design.

This is the choice I expect to get asked about, because the reflex for "store user records" is a relational database, and I considered RDS with Postgres seriously. I went with DynamoDB because my access patterns are known, fixed, and simple, and there aren't many of them. I'm not running ad-hoc analytical queries or joining across five tables. I'm fetching one member by ID, listing verified members for the directory, and listing pending members for admin review. DynamoDB is built for exactly that shape — known keys, predictable lookups — and it scales to zero cost when nobody's using it, where an RDS instance bills me every hour whether anyone shows up or not. For a student community that might be busy for a week around an event and dead during exams, paying for an idle database is the wrong model.

Here's the table design and the access patterns it serves:

```
Table: ASBU-Members  (single table)

Item                | PK                | SK         | GSI1PK            | GSI1SK
--------------------|-------------------|------------|-------------------|------------
Member profile      | USER#<cognitoSub> | PROFILE    | STATUS#<status>   | <createdAt>

Attributes: fullName, email*, matric*, phone*, department, level, tag,
            bio, github, linkedin, twitter, avatarKey, status, createdAt
            (* = private fields, never returned in the public directory)
```

```
Access patterns:
  Get a member by ID          → GetItem  PK = USER#<sub>, SK = PROFILE
  List the public directory   → Query GSI1  GSI1PK = STATUS#VERIFIED
  List pending registrations  → Query GSI1  GSI1PK = STATUS#PENDING   (admin only)
  Edit own profile            → UpdateItem PK = USER#<sub>
```

The single global secondary index keyed on status is doing the real work — it lets me pull "everyone who's verified" for the directory and "everyone waiting" for the admin queue with one query each, sorted by join date. Filtering the directory by tag (Cloud Engineer, AI/ML, and so on) I'm doing in the function after the query rather than adding a second index, because at a few hundred members the result set is small and a second GSI is complexity I don't need yet. If the community grows into the thousands I'll add a tag index. I'd rather add it when the data tells me to than guess now.

I'm also turning on **point-in-time recovery** on the table. It's a few cents and it means a bad write or a fat-fingered delete is recoverable. Member data is the one thing in this system I can't regenerate, so it's the one thing I back up.

## Profile pictures

Avatars go in a separate **S3** bucket, uploaded straight from the browser using **presigned URLs**.

The flow matters here, so: when a member wants to set a photo, the browser asks my Lambda for a presigned PUT URL, the Lambda generates one scoped to a single object key for a few minutes, and the browser uploads directly to S3 using it. The image never passes through Lambda. I'm doing it this way for three reasons — it keeps large image payloads out of my function (which is billed on duration and has a payload limit), it keeps the bucket from ever being publicly writable, and it means a leaked URL is useless after it expires. The bucket blocks all public access; images are read back through CloudFront with origin access control, not by making the bucket public. The old prototype stored avatars as base64 strings, which would have bloated every DynamoDB item and every API response — that's exactly what object storage is for, so images live in S3 and the database only holds the key.

## Email

Welcome emails and verification go through **SES**.

The one thing I'm planning around here is the sandbox. Every new SES account starts in a sandbox that only sends to addresses you've verified, and you have to request production access to email arbitrary people. That request takes a day or two to approve, so it's the first thing I'm submitting, not the last — I don't want the launch blocked waiting on it. I'm also verifying the domain properly with SPF, DKIM, and DMARC records so the mail actually lands in inboxes instead of spam, which for a "welcome to the club" email is the difference between it working and not. I deleted the thing the prototype was doing — calling Mailchimp directly from the browser with the API key sitting in the JavaScript. That key was readable by anyone and the call would have failed CORS regardless. Any email sending happens server-side, from Lambda, with credentials that never touch the client.

## Protecting the front door

The registration endpoint is public by definition — anyone has to be able to reach it to sign up — which means bots will find it. I'm putting **AWS WAF** in front of the API with rate limiting, and a **CAPTCHA** on the registration form, so a script can't sit there creating ten thousand fake members overnight. This isn't paranoia; an open POST endpoint on the public internet gets probed within days. The rate limit also protects me from a runaway bill, which matters because the whole system scales with usage.

## Privacy and the member directory

This is the part I most want to get right, because it's the part most student projects get wrong.

The registration form collects matric numbers, phone numbers, and email addresses. That's personal data, and under the Nigeria Data Protection Act it's data I'm responsible for. The prototype dashboard displayed every member's matric number and email to every other logged-in member — that's a real exposure, and it's the kind of thing that's invisible until it isn't. So the model is split by field. The public directory — what any logged-in member sees — shows name, profile photo, faculty, level, builder tag, bio, and the social links a member chose to share. The private fields — matric, email, phone — are returned only to the member who owns them and to an admin. This runs as two layers. First, the directory query uses a DynamoDB projection that reads only the public attributes, so the private ones never load out of the table at all — they're not just hidden in the UI, they're never fetched. Second, the API strips any private field server-side before responding, so even a query that forgot its projection couldn't leak one. Either layer alone closes the exposure; together they mean PII never leaves the database for an unauthorised caller.

I'm also adding a real consent checkbox at registration that means something, and a short privacy notice that says what I collect and why. I considered encrypting the matric and phone fields at rest with a KMS key as defence-in-depth, and I may still do it, but I made the call that the access-control boundary plus DynamoDB's encryption at rest is the right level for now, and field-level encryption is something I add if the sensitivity of the data grows. I'd rather document that decision honestly than pretend I encrypted everything.

## Infrastructure as code — CDK

The entire backend is defined in **AWS CDK** using TypeScript. Nothing important is clicked together in the console.

This is the single biggest decision in the project for what I'm trying to prove, so I'll be clear about it. I considered four options. The console is out — clicking resources together by hand isn't reproducible, isn't reviewable, and isn't something I can hand to anyone or rebuild after a mistake. SAM is good for pure serverless but I'd outgrow its templates the moment I wanted to express the CloudFront, WAF, and Cognito setup cleanly. Terraform was the real alternative, and if I were multi-cloud I'd probably use it — but I'm AWS-focused on purpose, and CDK lets me write real code with loops, conditionals, and types instead of templating a config language. I picked CDK. It's AWS-native, it's what Amplify generates under the hood, and the fact that my infrastructure is a typed program I can read top to bottom is the thing that turns this from "a website I made" into "a system I engineered." The IaC is the portfolio artifact as much as the running app is.

Everything is one `cdk deploy` away from existing, and one `cdk destroy` away from gone. That reproducibility is the point.

## CI/CD

Deploys run through **GitHub Actions**, and the pipeline authenticates to AWS using **OIDC** — short-lived federated credentials, not a long-lived access key stored in a secret.

I'm calling this out specifically because the OIDC detail is the kind of thing that separates someone who's deployed once from someone who runs things. Long-lived AWS keys sitting in CI secrets are a standing liability; if the repo leaks, the keys leak. With OIDC, GitHub gets a temporary credential scoped to a role, valid for one run, and there's no static key to steal. Push to the main branch, the front end builds and syncs to S3, the CloudFront cache invalidates, and the CDK stack deploys. I keep at least a `dev` and a `prod` environment so I'm never testing against the data real members are in.

## Watching it run

I'm not flying blind. The Lambdas log structured JSON to **CloudWatch**, I keep a small dashboard for request counts and errors, and I have an alarm that emails me if the registration function starts throwing errors — because a broken sign-up is the one failure that silently costs me members. **X-Ray** tracing is on so I can see where a slow request actually spends its time across API Gateway, Lambda, and DynamoDB rather than guessing.

And even though cost isn't the constraint here, I have an **AWS Budgets** alert wired up. Not because I expect a big bill, but because a public endpoint plus pay-per-use services means a bot attack or a bug could run up usage, and I'd rather get an email at the first sign than a surprise at the end of the month. Putting a guardrail in place is itself part of running something responsibly.

## What I left out, on purpose

Scope discipline is a decision too, so here's what I consciously deferred. The member-to-member chat in the dashboard prototype is a UI mock right now; a real one needs WebSockets and a presence system, and that's its own project — it stays a mock until the directory and verification are solid. Real-time event RSVPs and the photo gallery I'm treating the same way: get accounts, profiles, and the directory genuinely working with real members first, then build outward. I'd rather ship a small thing that's correct than a big thing that's half-wired with fake numbers in it. The fake member cards and the invented "243 online" counter from the prototype are gone — every number on this platform will be a real one or it won't be there.

## What this costs

At the scale of a campus community — call it a few hundred members and modest traffic — this runs at nearly nothing. S3 and CloudFront for static files are pennies. Cognito is inside its free tier. Lambda and API Gateway are pay-per-request and the request volume is low. DynamoDB on-demand bills for what I actually read and write. The only steady monthly line items are the Route 53 hosted zone at around fifty cents and the domain renewal. Everything else scales with use, and the use is small. That's the quiet advantage of building it serverless: an idle community costs almost nothing to keep online, which means it can stay online.

---

*This document is the source of truth for the platform's design. The README covers how to run and deploy it; this covers why it's shaped the way it is.*
