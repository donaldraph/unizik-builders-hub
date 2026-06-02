"""GET /directory — verified members, public view only (no PII)."""
from boto3.dynamodb.conditions import Key
from common import respond, user_sub, public_view, TABLE


def handler(event, context):
    if not user_sub(event):
        return respond(401, {"error": "unauthenticated"})

    params = event.get("queryStringParameters") or {}
    tag = params.get("tag")

    query = {
        "IndexName": "GSI1",
        "KeyConditionExpression": Key("GSI1PK").eq("STATUS#VERIFIED"),
        "ScanIndexForward": False,  # newest first
    }

    items = []
    resp = TABLE.query(**query)
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = TABLE.query(ExclusiveStartKey=resp["LastEvaluatedKey"], **query)
        items.extend(resp.get("Items", []))

    members = [public_view(i) for i in items]
    if tag:
        members = [m for m in members if m.get("tag") == tag]

    return respond(200, {"members": members, "count": len(members)})
