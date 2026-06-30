"""POST /admin/verify — admins only. Approve or reject a pending member."""
import json
import os
import urllib.error
import urllib.request

from botocore.exceptions import ClientError
from common import respond, is_admin, parse_body, TABLE

DECISIONS = {"VERIFIED", "REJECTED"}

# Welcome mail goes out through Resend's HTTP API. welcome@ is covered by the
# verified unizikbuilders.tech (send subdomain) identity in Resend.
RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
WELCOME_FROM = os.environ.get("WELCOME_FROM", "welcome@unizikbuilders.tech")

# {name} is interpolated into the subject only; the body copy is the same for
# everyone. The WhatsApp invite + logo URL are shared by the text and HTML parts
# so the link never drifts between them.
WELCOME_SUBJECT = "You're in, {name}."
WHATSAPP_URL = "https://chat.whatsapp.com/GYoJlCzgnX65PkKq6R1qX3"
# Logo is served from the SPA's public/ dir (it deploys to CloudFront with the
# frontend), so the image asset and this Lambda ship from the same repo + deploy.
WELCOME_LOGO_URL = os.environ.get(
    "WELCOME_LOGO_URL", "https://aws.unizikbuilders.tech/email/asbu-mark.png"
)

WELCOME_BODY = """You're in.

No long intro.

You showed up. Now it's time to build.

What we're building is bigger than a study group: cloud, AI, and Security engineers out of UNIZIK who can compete anywhere — hired, certified, shipping real things. You're part of that now.

Come join the conversation. Tell us what you're trying to build, and let's get to work:

{wa}

— AWS Student Builders, UNIZIK"""

# HTML twin of WELCOME_BODY for clients that render it (Gmail, etc.); the text
# part above stays as the fallback. Table + inline-style layout is the only
# thing email clients render reliably, and there's no <style> block so the only
# braces str.format() sees are the {logo} and {wa} placeholders.
WELCOME_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>You're in.</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f8;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e6ef;">
<tr><td style="background-color:#232F3E;padding:26px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;padding-right:14px;"><img src="{logo}" width="42" height="42" alt="AWS Student Builders UNIZIK" style="display:block;border:0;width:42px;height:42px;"></td>
<td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;">
<div style="font-size:16px;font-weight:700;letter-spacing:0.5px;color:#ffffff;line-height:1.2;">AWS STUDENT BUILDERS</div>
<div style="font-size:12px;font-weight:700;letter-spacing:3px;color:#FF9900;line-height:1.3;">UNIZIK</div>
</td>
</tr></table>
</td></tr>
<tr><td style="padding:36px 32px 4px 32px;font-family:Arial,Helvetica,sans-serif;">
<h1 style="margin:0;font-size:30px;line-height:1.1;color:#232F3E;">You're in.</h1>
<p style="margin:6px 0 26px 0;font-size:15px;line-height:1.6;color:#8a93a3;">No long intro.</p>
<p style="margin:0 0 18px 0;font-size:16px;line-height:1.7;color:#232F3E;">You showed up. Now it's time to build.</p>
<p style="margin:0 0 18px 0;font-size:16px;line-height:1.7;color:#232F3E;">What we're building is bigger than a study group: <strong>cloud, AI, and Security engineers</strong> out of UNIZIK who can compete anywhere &mdash; hired, certified, shipping real things. You're part of that now.</p>
<p style="margin:0 0 28px 0;font-size:16px;line-height:1.7;color:#232F3E;">Come join the conversation. Tell us what you're trying to build, and let's get to work:</p>
</td></tr>
<tr><td style="padding:0 32px 38px 32px;" align="left">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="border-radius:8px;background-color:#FF9900;">
<a href="{wa}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#232F3E;text-decoration:none;">Join the WhatsApp&nbsp;&rarr;</a>
</td>
</tr></table>
</td></tr>
<tr><td style="padding:22px 32px;background-color:#f7f8fb;border-top:1px solid #e2e6ef;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0;font-size:13px;line-height:1.5;color:#5b6472;">&mdash; AWS Student Builders, UNIZIK</p>
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr>
<td align="center" style="padding:16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#aab2c0;">You're getting this because your membership at AWS Student Builders, UNIZIK was approved.</td>
</tr></table>
</td></tr>
</table>
</body>
</html>"""


def _send_welcome(member):
    """Best-effort welcome email on approval, via the Resend HTTP API.

    Never blocks the status change: by the time we get here the member is
    already VERIFIED in the table, so a mail failure is logged and swallowed
    rather than surfaced as a 500 the admin can't act on.
    """
    email = member.get("email")
    if not email:
        return
    if not RESEND_API_KEY:
        print("welcome email skipped: RESEND_API_KEY not set")
        return
    name = member.get("fullName", "")
    payload = json.dumps({
        "from": WELCOME_FROM,
        "to": [email],
        "subject": WELCOME_SUBJECT.format(name=name),
        "text": WELCOME_BODY.format(wa=WHATSAPP_URL),
        "html": WELCOME_HTML.format(logo=WELCOME_LOGO_URL, wa=WHATSAPP_URL),
    }).encode("utf-8")
    req = urllib.request.Request(
        RESEND_API_URL,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            # Resend's API is fronted by Cloudflare, which blocks the default
            # Python-urllib User-Agent as a bot (403 "error code: 1010").
            "User-Agent": "asbu-admin-verify/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        print(f"welcome email failed for {email}: {e.code} {e.read().decode('utf-8', 'replace')}")
    except (urllib.error.URLError, OSError) as e:
        print(f"welcome email failed for {email}: {e}")


def handler(event, context):
    if not is_admin(event):
        return respond(403, {"error": "admin access required"})

    data, err = parse_body(event)
    if err:
        return err

    sub = data.get("sub")
    decision = data.get("decision")
    if not sub or decision not in DECISIONS:
        return respond(400, {"error": "need 'sub' and 'decision' (VERIFIED or REJECTED)"})

    try:
        # ALL_NEW returns the updated item so we can pull email + fullName for the
        # welcome mail without a second round-trip to DynamoDB.
        result = TABLE.update_item(
            Key={"PK": f"USER#{sub}", "SK": "PROFILE"},
            UpdateExpression="SET #s = :s, GSI1PK = :g",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": decision, ":g": f"STATUS#{decision}"},
            ConditionExpression="attribute_exists(PK)",
            ReturnValues="ALL_NEW",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(404, {"error": "member not found"})
        raise

    # Welcome mail only on approval, not rejection.
    if decision == "VERIFIED":
        _send_welcome(result.get("Attributes", {}))

    return respond(200, {"ok": True, "sub": sub, "status": decision})
