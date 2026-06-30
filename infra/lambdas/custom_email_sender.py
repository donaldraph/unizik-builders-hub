"""Cognito CustomEmailSender trigger — route every Cognito-generated email
through Resend instead of Cognito's own sender (SES / default).

Once this trigger is attached to the pool, Cognito sends NO email itself. For
each code-bearing flow it invokes this Lambda with the code ENCRYPTED under our
KMS key (AWS Encryption SDK envelope format, base64 in request.code). We decrypt
it and send the email via the Resend HTTP API — the same path admin_verify.py
already uses for the welcome mail. This is fully independent of the SES sandbox.

DEPENDENCY: aws-encryption-sdk (for the decrypt) is NOT in the shared lambdas/
folder; it ships as a Lambda layer (infra/layers/encryption-sdk) attached ONLY
to this function, so the other dependency-free triggers stay untouched.

FAILURE POLICY:
  - decrypt failure  -> raise. It means a misconfiguration (wrong key, missing
    grant, commitment-policy mismatch). Failing loudly is what surfaces it in
    testing; a silent swallow would ship a pool that can never send a code.
  - Resend send failure -> logged, swallowed. Mirrors the repo's "never block an
    auth flow on a mail hiccup" stance: the account/operation still completes and
    the user can trigger a resend, rather than the whole SignUp call 500-ing.
"""
import base64
import html
import json
import os
import urllib.error
import urllib.request

import aws_encryption_sdk
from aws_encryption_sdk import CommitmentPolicy

# KMS key Cognito uses to encrypt the code. Same key the Lambda decrypts with;
# arn injected by CDK (see auth-stack.ts). Built once at cold start.
KEY_ARN = os.environ["CUSTOM_SENDER_KMS_KEY_ARN"]

# Cognito encrypts WITHOUT key commitment, so the client must allow decrypting
# non-committing messages. StrictAwsKmsMasterKeyProvider pins decryption to our
# one key (never trusts a key id embedded in the ciphertext).
_esdk = aws_encryption_sdk.EncryptionSDKClient(
    commitment_policy=CommitmentPolicy.FORBID_ENCRYPT_ALLOW_DECRYPT
)
_key_provider = aws_encryption_sdk.StrictAwsKmsMasterKeyProvider(key_ids=[KEY_ARN])

# Resend — identical setup to admin_verify.py. The unizikbuilders.tech domain
# (send subdomain) is the verified identity, so no-reply@ needs no extra setup.
RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
CODE_FROM = os.environ.get("CODE_FROM", "AWS Student Builders UNIZIK <no-reply@unizikbuilders.tech>")


def _decrypt_code(b64_ciphertext):
    """Decrypt the base64 code Cognito put in request.code -> plaintext str.

    Cognito HTML-escapes reserved chars (< > etc.) in temporary passwords before
    encrypting; numeric codes are unaffected. html.unescape is a no-op on plain
    codes, so we apply it unconditionally to reverse the escaping for temp pwds.
    """
    plaintext, _header = _esdk.decrypt(
        source=base64.b64decode(b64_ciphertext),
        key_provider=_key_provider,
    )
    return html.unescape(plaintext.decode("utf-8"))


def _send(to_email, subject, body):
    """Best-effort send via Resend. Logs and swallows on failure (see policy)."""
    if not to_email:
        print("email skipped: no recipient on event")
        return
    if not RESEND_API_KEY:
        print("email skipped: RESEND_API_KEY not set")
        return
    payload = json.dumps({
        "from": CODE_FROM,
        "to": [to_email],
        "subject": subject,
        "text": body,
    }).encode("utf-8")
    req = urllib.request.Request(
        RESEND_API_URL,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            # Resend sits behind Cloudflare, which 403s the default urllib UA.
            "User-Agent": "asbu-custom-email-sender/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp.read()
        print(f"email sent to {to_email}: {subject!r}")
    except urllib.error.HTTPError as e:
        print(f"email failed for {to_email}: {e.code} {e.read().decode('utf-8', 'replace')}")
    except (urllib.error.URLError, OSError) as e:
        print(f"email failed for {to_email}: {e}")


# subject/body per Cognito flow. {code} -> decrypted code/temp-password,
# {name} -> the user's name (falls back to a neutral greeting). The triggerSource
# strings are Cognito's canonical CustomEmailSender_* values.
_TEMPLATES = {
    "CustomEmailSender_SignUp": (
        "Confirm your email",
        "{greeting}\n\nYour AWS Student Builders UNIZIK verification code is:\n\n"
        "    {code}\n\nEnter it to finish creating your account. If you didn't "
        "sign up, you can ignore this email.\n\n— AWS Student Builders UNIZIK",
    ),
    "CustomEmailSender_ResendCode": (
        "Your new verification code",
        "{greeting}\n\nHere's a fresh verification code:\n\n    {code}\n\n"
        "— AWS Student Builders UNIZIK",
    ),
    "CustomEmailSender_ForgotPassword": (
        "Reset your password",
        "{greeting}\n\nUse this code to reset your password:\n\n    {code}\n\n"
        "If you didn't request a reset, you can safely ignore this email.\n\n"
        "— AWS Student Builders UNIZIK",
    ),
    "CustomEmailSender_Authentication": (
        "Your sign-in code",
        "{greeting}\n\nYour one-time sign-in code is:\n\n    {code}\n\n"
        "— AWS Student Builders UNIZIK",
    ),
    "CustomEmailSender_UpdateUserAttribute": (
        "Verify your email change",
        "{greeting}\n\nUse this code to confirm your new email address:\n\n"
        "    {code}\n\n— AWS Student Builders UNIZIK",
    ),
    "CustomEmailSender_VerifyUserAttribute": (
        "Verify your email change",
        "{greeting}\n\nUse this code to confirm your new email address:\n\n"
        "    {code}\n\n— AWS Student Builders UNIZIK",
    ),
    "CustomEmailSender_AdminCreateUser": (
        "Your account is ready",
        "{greeting}\n\nAn account was created for you. Your temporary password "
        "is:\n\n    {code}\n\nYou'll be asked to set a new one when you first "
        "sign in.\n\n— AWS Student Builders UNIZIK",
    ),
}

# Flows with no code to decrypt (a notice, not a code). Sent as-is.
_NOTICE_TEMPLATES = {
    "CustomEmailSender_AccountTakeOverNotification": (
        "Security alert on your account",
        "{greeting}\n\nWe noticed a sign-in to your AWS Student Builders UNIZIK "
        "account that looked unusual. If this was you, no action is needed. If "
        "not, reset your password right away.\n\n— AWS Student Builders UNIZIK",
    ),
}


def handler(event, context):
    src = event.get("triggerSource", "")
    req = event.get("request", {})
    attrs = req.get("userAttributes", {})
    to_email = (attrs.get("email") or "").strip()
    name = (attrs.get("name") or attrs.get("given_name") or "").strip()
    greeting = f"Hi {name}," if name else "Hi,"

    # Notice flows carry no code.
    if src in _NOTICE_TEMPLATES:
        subject, body = _NOTICE_TEMPLATES[src]
        _send(to_email, subject, body.format(greeting=greeting))
        return event

    template = _TEMPLATES.get(src)
    if not template:
        # Unknown/unhandled flow: don't fabricate an email, just record it.
        print(f"custom_email_sender: no template for triggerSource {src!r}")
        return event

    # decrypt errors propagate on purpose (see module docstring FAILURE POLICY).
    code = _decrypt_code(req["code"])
    subject, body = template
    _send(to_email, subject, body.format(greeting=greeting, code=code))
    return event
