"""GET /admin/pending — admins only. The verification queue, full detail."""
from boto3.dynamodb.conditions import Key
from common import respond, is_admin, strip_internal, TABLE


def handler(event, context):
    if not is_admin(event):
        return respond(403, {"error": "admin access required"})

    resp = TABLE.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq("STATUS#PENDING"),
        ScanIndexForward=True,  # oldest waiting first
    )
    pending = [strip_internal(i) for i in resp.get("Items", [])]

    return respond(200, {"pending": pending, "count": len(pending)})
