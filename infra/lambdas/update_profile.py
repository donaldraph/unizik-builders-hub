"""PUT /me — edit my own profile. Only editable fields; matric/email are fixed."""
from botocore.exceptions import ClientError
from common import respond, user_sub, parse_body, TABLE

EDITABLE = ["fullName", "bio", "github", "linkedin", "twitter", "avatarKey", "phone"]


def handler(event, context):
    sub = user_sub(event)
    if not sub:
        return respond(401, {"error": "unauthenticated"})

    data, err = parse_body(event)
    if err:
        return err

    updates = {k: data[k] for k in EDITABLE if k in data}
    if not updates:
        return respond(400, {"error": "no editable fields supplied"})

    expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
    names = {f"#{k}": k for k in updates}
    values = {f":{k}": v for k, v in updates.items()}

    try:
        TABLE.update_item(
            Key={"PK": f"USER#{sub}", "SK": "PROFILE"},
            UpdateExpression=expr,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ConditionExpression="attribute_exists(PK)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(404, {"error": "no profile to update"})
        raise

    return respond(200, {"ok": True, "updated": list(updates.keys())})
