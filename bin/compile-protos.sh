#!/usr/bin/env bash

PROTOC_GEN_TS_PATH="../node_modules/.bin/protoc-gen-ts"
OUT_DIR="../lib"

mkdir -p "$OUT_DIR"

protoc \
    --plugin="protoc-gen-ts=${PROTOC_GEN_TS_PATH}" \
    --js_out="import_style=commonjs,binary:${OUT_DIR}" \
    --proto_path="../proto/" \
    --ts_out="${OUT_DIR}" \
    ../proto/com/github/badsyntax/gradletasks/*.proto
