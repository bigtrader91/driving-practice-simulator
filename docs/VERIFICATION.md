# Verification

The feature branch is checked with the same command used by GitHub Actions:

```bash
npm run check
```

This command performs two stages:

1. `npm run validate` verifies the simulator's control and safety invariants, including primary-button pointer capture, ±540° wheel limits, steering-ratio conversion, W/S pedal semantics, gear interlocks, collision rollback, camera roll limits, mirror cameras, guide rendering, unique bindings and all ten course identifiers.
2. `npm run build` runs the TypeScript project build followed by the Vite production bundle.

The `Simulator CI` workflow executes these stages on feature-branch pushes and pull requests targeting `main`.
