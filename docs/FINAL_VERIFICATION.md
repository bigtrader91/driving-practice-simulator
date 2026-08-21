# Final branch verification trigger

This commit intentionally contains documentation only. Its purpose is to run the standard `Simulator CI` workflow against the final source commit after all one-time source-finalization workflows have completed and removed themselves.

The workflow executes:

```bash
npm ci
npm run check
```

The invariant validator covers the steering, pedal, transmission, collision, camera, mirror, guide, binding and course requirements. The build step produces the deployable Vite bundle.
