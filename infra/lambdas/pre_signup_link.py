"""Cognito PreSignUp trigger — account linking.

One human -> one Cognito user (one sub), even when they use BOTH email/password
and Google with the same email. Without this, a Google sign-in for an email that
already has a native account creates a SECOND Cognito user, hence a duplicate
member record (keyed on the new sub) in DynamoDB.

SECURITY: we link a Google identity into an existing native user ONLY when that
native user's email is already VERIFIED. Linking on an unverified email is an
account-takeover vector — an attacker could pre-create a native account with a
victim's email and have the victim's real Google identity linked into it. In
this pool a native user only becomes email_verified after entering the emailed
code, so a verified native account proves inbox control. Google asserts its
emails as verified, so the Google side is trusted.

We only ever link in the federated -> native direction. The reverse (a native
email/password sign-up for an email that already belongs to a Google user) is
BLOCKED, not linked: at native sign-up the email is not yet verified, so there
is no safe basis to merge — we tell the user to continue with Google instead.

Mirrors common.py's style (module-level client, small handler) but does not
import it: common.py reads TABLE_NAME at import time, which this trigger lacks.
"""
import boto3

cognito = boto3.client("cognito-idp")


def _attrs(user):
    """Flatten a ListUsers attribute list into a {name: value} dict."""
    return {a["Name"]: a["Value"] for a in user.get("Attributes", [])}


def _users_by_email(pool_id, email):
    """All pool users carrying this email (native and/or federated)."""
    resp = cognito.list_users(
        UserPoolId=pool_id, Filter=f'email = "{email}"', Limit=10
    )
    return resp.get("Users", [])


def _find_native_verified_user(pool_id, email):
    """An existing NATIVE user with this email whose email is verified, or None.
    Federated users (they carry an 'identities' attr) are skipped — we only ever
    link INTO a native account, never into another federated one."""
    for u in _users_by_email(pool_id, email):
        a = _attrs(u)
        if "identities" in a:                       # already federated -> skip
            continue
        if a.get("email_verified", "false").lower() != "true":
            continue                                # SECURITY: never link into unverified
        return u
    return None


def _has_federated_user(pool_id, email):
    """True if a federated (e.g. Google) user already owns this email."""
    return any("identities" in _attrs(u) for u in _users_by_email(pool_id, email))


def _link_google_to_native(pool_id, native_username, google_subject):
    """Attach the Google identity to the native user so future Google logins
    authenticate AS the native user (same sub, same member record)."""
    cognito.admin_link_provider_for_user(
        UserPoolId=pool_id,
        DestinationUser={"ProviderName": "Cognito",
                         "ProviderAttributeValue": native_username},
        SourceUser={"ProviderName": "Google",
                    "ProviderAttributeName": "Cognito_Subject",
                    "ProviderAttributeValue": google_subject},
    )


def handler(event, context):
    src = event.get("triggerSource", "")
    attrs = event.get("request", {}).get("userAttributes", {})
    email = (attrs.get("email") or "").strip().lower()
    pool_id = event["userPoolId"]

    # ---- Federated (Google) sign-up: the main linking path ------------------
    if src == "PreSignUp_ExternalProvider":
        username = event.get("userName", "")        # "Google_<subject>"
        provider, _, subject = username.partition("_")
        if provider != "Google" or not subject or not email:
            return event                            # nothing to link -> pass through
        if attrs.get("email_verified", "true").lower() != "true":
            return event                            # Google side must be verified
        try:
            native = _find_native_verified_user(pool_id, email)
            if native:
                _link_google_to_native(pool_id, native["Username"], subject)
                print(f"[link] Google -> native linked for {email}")
        except Exception as e:                       # never block a sign-in on a link hiccup
            print(f"[link] skipped/failed for {email}: {e}")
        return event

    # ---- Native (email/password) sign-up ------------------------------------
    if src == "PreSignUp_SignUp":
        # If a Google account already owns this email, refuse to create a second
        # (native) user. Refusing is always safe — it never links anything — and
        # it keeps the email to one Cognito user. The person should sign in with
        # Google instead.
        if email and _has_federated_user(pool_id, email):
            raise Exception(
                "An account with this email already exists via Google. "
                "Please use Continue with Google."
            )
        return event

    return event
