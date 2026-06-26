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

# {name} is interpolated with the member's fullName before sending (both the
# subject and the body); leave the {name} token wherever you want their name.
WELCOME_SUBJECT = "You're in, {name}."
WELCOME_BODY = """{name},

You're welcome — officially one of us now.

You showed up. Now it's time to build.

What we're building is bigger than a study group: cloud and AI engineers out of UNIZIK who can hold their own anywhere — hired, certified, shipping real things. You're part of that now.

Come join the conversation. Tell us what you're trying to build, and let's get to work:

https://chat.whatsapp.com/GYoJICzgnX65PkKq6R1qX3

— AWS Student Builders UNIZIK"""


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
        "text": WELCOME_BODY.format(name=name),
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
