"""GET /me — my own profile, full (I'm allowed to see my own PII)."""
from common import respond, user_sub, strip_internal, TABLE


def handler(event, context):
    sub = user_sub(event)
    if not sub:
        return respond(401, {"error": "unauthenticated"})

    res = TABLE.get_item(Key={"PK": f"USER#{sub}", "SK": "PROFILE"})
    item = res.get("Item")
    if not item:
        return respond(404, {"error": "no profile yet", "registered": False})

    return respond(200, {"registered": True, "profile": strip_internal(item)})
