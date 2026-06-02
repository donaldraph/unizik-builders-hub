"""Shared helpers for every Lambda. Keeps the handlers small and consistent."""
import json
import os
import boto3

_dynamodb = boto3.resource("dynamodb")
TABLE = _dynamodb.Table(os.environ["TABLE_NAME"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
}

# Fields that must never appear in the public member directory.
PRIVATE_FIELDS = {"email", "matric", "phone"}
# Internal key prefixes that should never leak in any response.
INTERNAL_PREFIXES = ("PK", "SK", "GSI")


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


def strip_internal(item):
    """Remove DynamoDB key attributes before returning an item to its owner."""
    return {k: v for k, v in item.items() if not k.startswith(INTERNAL_PREFIXES)}


def public_view(item):
    """What anyone in the directory may see: no PII, no internal keys."""
    return {
        k: v
        for k, v in item.items()
        if k not in PRIVATE_FIELDS and not k.startswith(INTERNAL_PREFIXES)
    }


def parse_body(event):
    try:
        return json.loads(event.get("body") or "{}"), None
    except json.JSONDecodeError:
        return None, respond(400, {"error": "invalid JSON body"})
