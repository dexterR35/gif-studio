# ADR 0013 — Enhanced = replace source + rollback

**Status:** Accepted  
**Phase:** 3  
**Date:** 2026-07-20

## Context

Early designs treated “enhanced” (upscale / restore) as an invisible underlay beneath the source. MEGA §2 overrides that: users expect the enhanced pixels to **become** the working source, with a way to restore the original.

## Decision

1. Applying enhance **replaces** the active source asset id on the background / source layer.
2. The previous source is retained as `rollbackAssetId` (or equivalent) so Undo / “Restore original” can swap back.
3. V1 `enhancedLayer` underlay semantics are migrated accordingly in `migrateV1ToV2` / layer migration — not as a permanent dual stack.

## Consequences

- No dual-write of enhance into both underlay and source.
- Export and preview both see the replaced source unless rolled back.

## Rejected alternatives

- Invisible A/B underlay as the durable model — rejected by MEGA overlay.
- Destructive replace without rollback asset — rejected for safety.
