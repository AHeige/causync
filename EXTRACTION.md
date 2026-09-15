# Standalone extraction

Causync was extracted from `Collabro-App/collabro` at `origin/dev` commit `fe763e721c28fe694b9d4812514245d4430467f3` under Sefira task `UP-851`.

The package root mirrors the former `packages/causync` directory. Core unit tests now live in `tests/` with standalone imports. `examples/sefira-demo/` preserves the Sefira marketing page, interactive fault lab, and browser test as host-integration references; those files intentionally retain Sefira and Next.js imports and are not part of the published package build.

Future package development should happen here first. Sefira, Daycape, and other applications should consume released package versions or an explicit local workspace dependency instead of copying runtime source.
