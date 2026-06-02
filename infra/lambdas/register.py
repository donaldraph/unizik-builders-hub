"""POST /register — create my profile after sign-up. Auth required."""
import time
from botocore.exceptions import ClientError
from common import respond, user_sub, parse_body, TABLE

REQUIRED = ["fullName", "matric", "department", "level", "email", "phone", "tag"]


def handler(event, context):
    sub = user_sub(event)
    if not sub:
        return respond(401, {"error": "unauthenticated"})

    data, err = parse_body(event)
    if err:
        return err

    missing = [f for f in REQUIRED if not str(data.get(f, "")).strip()]
    if missing:
        return respond(400, {"error": "missing required fields", "fields": missing})

    if not data.get("consent"):
        return respond(400, {"error": "consent is required to register"})

    now = str(int(time.time()))
    item = {
        "PK": f"USER#{sub}",
        "SK": "PROFILE",
        "GSI1PK": "STATUS#PENDING",
        "GSI1SK": now,
        "sub": sub,
        "fullName": data["fullName"],
        "matric": data["matric"],          # private
        "email": data["email"],            # private
        "phone": data["phone"],            # private
        "department": data["department"],
        "level": data["level"],
        "tag": data["tag"],
        "bio": data.get("bio", ""),
        "github": data.get("github", ""),
        "linkedin": data.get("linkedin", ""),
        "twitter": data.get("twitter", ""),
        "avatarKey": data.get("avatarKey", ""),
        "status": "PENDING",
        "createdAt": now,
        "consent": True,
    }

    try:
        TABLE.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(409, {"error": "profile already exists"})
        raise

    return respond(201, {"ok": True, "status": "PENDING"})
