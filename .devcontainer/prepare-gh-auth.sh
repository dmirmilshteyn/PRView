#!/bin/sh
set -eu

# Runs on the host: macOS Keychain credentials cannot be mounted into Linux.
auth_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/gh-auth"
umask 077
mkdir -p "$auth_directory"
temporary_file="$(mktemp "$auth_directory/.hosts.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM
account="$(gh api --hostname github.com user --jq .login)"
token="$(gh auth token --hostname github.com)"

{
  printf 'github.com:\n    git_protocol: https\n    user: %s\n    oauth_token: %s\n    users:\n        %s:\n            oauth_token: %s\n' "$account" "$token" "$account" "$token"
} > "$temporary_file"
unset token

chmod 600 "$temporary_file"
mv "$temporary_file" "$auth_directory/hosts.yml"
printf 'version: "1"\n' > "$auth_directory/config.yml"
printf 'Prepared read-only GitHub authentication for the devcontainer.\n'
