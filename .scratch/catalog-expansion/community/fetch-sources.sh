#!/bin/zsh
set -u
root=${0:A:h}
log="$root/fetch-log.tsv"
printf 'key\tchecked_at\tcurl_exit\thttp_status\teffective_url\tcontent_type\tbytes\terror\n' > "$log"
while IFS=$'\t' read -r key expected url; do
  [[ -n "$key" ]] || continue
  checked=$(date '+%Y-%m-%dT%H:%M:%S%z')
  body="$root/$key.body"
  meta="$root/$key.meta.tmp"
  err="$root/$key.error.txt"
  : > "$err"
  curl -sS -L --max-time 35 --connect-timeout 12 \
    -A 'AIL catalog research/expansion-2026-09-05' \
    -o "$body" -w '%{http_code}\t%{url_effective}\t%{content_type}\t%{size_download}' \
    "$url" > "$meta" 2> "$err"
  code=$?
  metadata=$(cat "$meta")
  error=$(tr '\n\t' '  ' < "$err")
  printf '%s\t%s\t%s\t%s\t%s\n' "$key" "$checked" "$code" "$metadata" "$error" >> "$log"
  rm -f "$meta"
done < "$root/urls.tsv"
