#!/usr/bin/env bash

echo "RUN_ID: $RUN_ID"
echo "RUN_NUMBER: $RUN_NUMBER"

curl -s -H "Authorization: token ${GITHUB_ACCESS_TOKEN}" -X GET https://api.github.com/repos/badsyntax/vscode-gradle/actions/runs/${RUN_ID}/artifacts

curl -s -H "Authorization: token ${GITHUB_ACCESS_TOKEN}" -X GET https://api.github.com/repos/badsyntax/vscode-gradle/actions/runs/${RUN_ID}/artifacts | jq '.artifacts[] | ("* [lib](" + .archive_download_url + ") (" + (.size_in_bytes * 0.000001|tostring)) + "MB)"'

ARTIFACTS_LIST=$(curl -s -H "Authorization: token ${GITHUB_ACCESS_TOKEN}" -X GET https://api.github.com/repos/badsyntax/vscode-gradle/actions/runs/${RUN_ID}/artifacts | jq '.artifacts[] | ("* [lib](" + .archive_download_url + ") (" + (.size_in_bytes * 0.000001|tostring)) + "MB)"')

echo "ARTIFACTS_LIST: ${ARTIFACTS_LIST}"

curl -s -H "Authorization: token ${GITHUB_ACCESS_TOKEN}" \
  -X POST -d "{\"body\": \"TEST Generated artifacts:${ARTIFACTS_LIST}\"}" \
  "https://api.github.com/repos/badsyntax/vscode-gradle/issues/${PR_NUMBER}/comments"
