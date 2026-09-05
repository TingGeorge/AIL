#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
out="$root/snapshots"
mkdir -p "$out"
: > "$root/fetch-log.tsv"
while IFS=$'\t' read -r id role url; do
  safe_role="${role//[^a-zA-Z0-9_-]/_}"
  target="$out/${id}__${safe_role}.html"
  meta=$(curl -sS -L --max-time 45 --connect-timeout 15 -A 'Mozilla/5.0 AIL-catalog-research/1.0' -o "$target" -w $'%{http_code}\t%{url_effective}\t%{content_type}' "$url" 2>"$target.stderr" || true)
  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$role" "$url" "$meta" >> "$root/fetch-log.tsv"
done < "$root/urls.tsv"
