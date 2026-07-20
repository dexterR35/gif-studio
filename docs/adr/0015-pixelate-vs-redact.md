# ADR 0015 — Pixelate vs secure redact

**Status:** Accepted  
**Phase:** 5  
**Date:** 2026-07-20

## Context

The censor / pixelate tool suggests privacy protection, but mosaic/pixelate is reversible enough (or bypassable via source assets) that it must not be marketed as secure redaction.

## Decision

1. **Pixelate** = visual effect layer / region (current censor → pixelate migration). Suitable for stylization, not compliance redaction.
2. **Secure redact** (if added later) = irreversible burn-in or removal of pixels from durable assets, separate tool and schema type.
3. UI copy and analytics must not claim “redacted” for pixelate-only operations.

## Consequences

- Migration notes label censor → pixelate.
- Capability honesty / docs warn users about privacy limits.

## Rejected alternatives

- Treating pixelate as GDPR-grade redaction — rejected.
- Silent upgrade of pixelate to destructive redact — rejected; must be explicit.
