# Contributing

Runtime: Bun 1+.

```sh
bun i
bunx @trebired/code-discipline check
bun run typecheck
bun run build
bun run verify:pack
```

Generated output (`dist/`, tarballs, `.tmp/`) stays out of Git. Code Discipline owns alias consistency; run `bunx @trebired/code-discipline fix imports` after adding or moving files.
