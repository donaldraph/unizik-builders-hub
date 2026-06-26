#!/usr/bin/env bash
# Build the AWS Encryption SDK layer for the Cognito CustomEmailSender Lambda.
#
# Downloads Linux/x86_64 wheels (matching the Lambda runtime, NOT the build host)
# so the compiled `cryptography` binaries are valid on Lambda. cryptography
# publishes abi3 manylinux wheels, so --only-binary works without Docker.
#
# Output layout: build/python/<packages> — the `python/` prefix is what a Python
# Lambda layer must use for its site-packages to be importable.
#
# Re-run after changing requirements.txt. Output dir is gitignored; CI rebuilds it.
set -euo pipefail
cd "$(dirname "$0")"

OUT="build/python"
rm -rf build
mkdir -p "$OUT"

pip install \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: \
  --target "$OUT" \
  -r requirements.txt

echo "Layer built into $(pwd)/$OUT"
