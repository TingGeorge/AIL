# Activity expansion scratch tools

Rebuild order:

```sh
node .scratch/catalog-expansion/activity/generate-core.mjs
node .scratch/catalog-expansion/activity/enrich-groups.mjs
bun run .scratch/catalog-expansion/activity/validate.ts
```

`fetch-log.tsv` contains sandbox-blocked `000` responses and is not verification evidence. The final JSON quotes were audited against official pages opened with `web.run`; do not reinterpret the `000` files as successful snapshots.
