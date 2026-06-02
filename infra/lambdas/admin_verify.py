"""POST /admin/verify — admins only. Approve or reject a pending member."""
from botocore.exceptions import ClientError
from common import respond, is_admin, parse_body, TABLE

DECISIONS = {"VERIFIED", "REJECTED"}


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
        TABLE.update_item(
            Key={"PK": f"USER#{sub}", "SK": "PROFILE"},
            UpdateExpression="SET #s = :s, GSI1PK = :g",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": decision, ":g": f"STATUS#{decision}"},
            ConditionExpression="attribute_exists(PK)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(404, {"error": "member not found"})
        raise

    return respond(200, {"ok": True, "sub": sub, "status": decision})
