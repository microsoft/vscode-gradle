#!/usr/bin/env bash

OUT_DIR="proto-test/out"
TS_OUT_DIR="proto-test/src"
IN_DIR="../proto"
PROTOC="$(npm bin)/grpc_tools_node_protoc"
PROTOC_GEN_TS="$(npm bin)/protoc-gen-ts"

mkdir -p "$OUT_DIR"
mkdir -p "$TS_OUT_DIR"

$PROTOC \
		-I=${IN_DIR} \
		--plugin=protoc-gen-ts=$PROTOC_GEN_TS \
		--js_out=import_style=commonjs:$OUT_DIR \
		--grpc_out=:$OUT_DIR \
		--ts_out=service=grpc-node:$TS_OUT_DIR,mode=grpc-js \
		"$IN_DIR"/*.proto