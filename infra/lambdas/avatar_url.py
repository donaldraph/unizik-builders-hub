"""POST /me/avatar-url — get a short-lived presigned PUT URL for my avatar."""
import os
import uuid
import boto3
from common import respond, user_sub

s3 = boto3.client("s3")
BUCKET = os.environ["AVATAR_BUCKET"]

ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def handler(event, context):
    sub = user_sub(event)
    if not sub:
        return respond(401, {"error": "unauthenticated"})

    params = event.get("queryStringParameters") or {}
    content_type = params.get("contentType", "image/jpeg")
    if content_type not in ALLOWED_TYPES:
        return respond(400, {"error": "unsupported image type", "allowed": list(ALLOWED_TYPES)})

    ext = ALLOWED_TYPES[content_type]
    key = f"avatars/{sub}/{uuid.uuid4().hex}.{ext}"

    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=300,
    )

    return respond(200, {"uploadUrl": url, "key": key})
