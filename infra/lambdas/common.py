"""Shared helpers for every Lambda. Keeps the handlers small and consistent."""
import json
import os
import boto3

_dynamodb = boto3.resource("dynamodb")
TABLE = _dynamodb.Table(os.environ["TABLE_NAME"])

_s3 = boto3.client("s3")
AVATAR_BUCKET = os.environ.get("AVATAR_BUCKET")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
}

# Fields that must never appear in the public member directory.
PRIVATE_FIELDS = {"email", "matric", "phone"}
# Internal key prefixes that should never leak in any response.
INTERNAL_PREFIXES = ("PK", "SK", "GSI")
# The only attributes the public directory may read from the database — an
# allowlist, so a newly added attribute stays private until it's listed here.
# This is the first of two layers: the directory query projects exactly these,
# so PII never loads out of DynamoDB; public_view() then strips PII again as a
# defence-in-depth second layer in case a caller ever skips the projection.
PUBLIC_FIELDS = (
    "sub", "fullName", "department", "level", "tag",
    "bio", "github", "linkedin", "twitter", "avatarKey",
)


def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", **CORS_HEADERS},
        "body": json.dumps(body),
    }


def _claims(event):
    try:
        return event["requestContext"]["authorizer"]["claims"]
    except (KeyError, TypeError):
        return {}


def user_sub(event):
    """The Cognito sub — the stable identity we key everything on."""
    return _claims(event).get("sub")


def user_groups(event):
    """cognito:groups can arrive as a list or a stringified list; handle both."""
    raw = _claims(event).get("cognito:groups", "")
    if isinstance(raw, list):
        return set(raw)
    raw = raw.strip().strip("[]")
    return {g.strip() for g in raw.replace(",", " ").split() if g.strip()}


def is_admin(event):
    return "admin" in user_groups(event)


def presign_avatar(key, expires=3600):
    """Turn a stored avatar object key into a short-lived GET URL.

    The bucket blocks all public access, so the raw key can't load in an
    <img>. We hand back a presigned URL the browser can fetch directly.
    """
    if not key or not AVATAR_BUCKET:
        return None
    return _s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": AVATAR_BUCKET, "Key": key},
        ExpiresIn=expires,
    )


def _with_avatar_url(view):
    """Attach a loadable avatarUrl when the view carries an avatarKey."""
    url = presign_avatar(view.get("avatarKey"))
    if url:
        view["avatarUrl"] = url
    return view


def strip_internal(item):
    """Remove DynamoDB key attributes before returning an item to its owner."""
    return _with_avatar_url(
        {k: v for k, v in item.items() if not k.startswith(INTERNAL_PREFIXES)}
    )


def public_projection():
    """ProjectionExpression kwargs so a query never reads PII from the table.

    Returned ready to splat into TABLE.query(). Every field is aliased via
    ExpressionAttributeNames so the allowlist can include DynamoDB reserved
    words (e.g. status, level) without breaking the expression.
    """
    names = {f"#{f}": f for f in PUBLIC_FIELDS}
    return {
        "ProjectionExpression": ", ".join(names),
        "ExpressionAttributeNames": names,
    }


def public_view(item):
    """What anyone in the directory may see: no PII, no internal keys."""
    return _with_avatar_url(
        {
            k: v
            for k, v in item.items()
            if k not in PRIVATE_FIELDS and not k.startswith(INTERNAL_PREFIXES)
        }
    )


def parse_body(event):
    try:
        return json.loads(event.get("body") or "{}"), None
    except json.JSONDecodeError:
        return None, respond(400, {"error": "invalid JSON body"})
