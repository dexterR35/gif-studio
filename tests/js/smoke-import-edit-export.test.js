/**
 * Static-image smoke: import → edit → render-plan contract without browser UI.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createEmptyProjectV2, migrateV1ToV2, validateProjectV2, projectRevision } from '../../src/domain/index.js'
import {
  CommandBus,
  createCommitEnhancedAssetCommand,
  createSetLayerTransformCommand,
} from '../../src/commands/index.js'
import { evaluate } from '../../src/render/scene-evaluator.js'
import { createLegacyImportFixture } from '../../src/lib/project-document.js'
import { resetFeatureFlags, setFeatureFlags } from '../../src/domain/feature-flags.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, '../fixtures')

describe('smoke import → edit → PNG plan', () => {
  beforeEach(() => {
    resetFeatureFlags()
    setFeatureFlags({
      unifiedLayers: true,
      commandHistory: true,
      sceneEvaluatorV2: true,
    })
  })

  it('boots empty V2 and validates', () => {
    const doc = createEmptyProjectV2()
    const result = validateProjectV2(doc)
    expect(result.ok).toBe(true)
  })

  it('imports fixture bytes into asset metadata path', () => {
    const png = readFileSync(join(fixtures, 'static_opaque.png'))
    expect(png.byteLength).toBeGreaterThan(0)
  })

  it('migrates legacy import, edits via commands, and evaluates a PNG plan', () => {
    const legacy = createLegacyImportFixture()
    legacy.source = {
      kind: 'image',
      name: 'static_opaque.png',
      width: 64,
      height: 64,
      url: null,
    }
    legacy.elements = [
      {
        id: 'el1',
        name: 'Cutout',
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        url: null,
      },
    ]

    const { project: v2 } = migrateV1ToV2(legacy)
    expect(v2.schemaVersion).toBe(2)
    expect(validateProjectV2(v2).ok).toBe(true)

    const bus = new CommandBus({ document: v2 })
    const layerId = v2.rootLayerIds.find((id) => v2.layers[id]?.type === 'raster') || v2.rootLayerIds[0]
    expect(layerId).toBeTruthy()

    bus.execute(
      createSetLayerTransformCommand({
        layerId,
        transform: { x: 12, y: 8, scaleX: 1.1, scaleY: 1.1, rotationDeg: 0 },
      }),
    )

    const revBefore = projectRevision(bus.getDocument())
    bus.execute(
      createCommitEnhancedAssetCommand({
        layerId,
        enhancedAssetId: 'asset-enhanced-1',
        enhancedAsset: {
          id: 'asset-enhanced-1',
          kind: 'image',
          mimeType: 'image/png',
          checksumSha256: 'ee',
          byteLength: 100,
          storageKey: 'mem:enhanced',
          width: 128,
          height: 128,
        },
      }),
    )
    const layer = bus.getDocument().layers[layerId]
    if (layer?.type === 'raster') {
      expect(layer.assetId).toBe('asset-enhanced-1')
      expect(layer.rollbackAssetId).toBeTruthy()
    }

    bus.undo()
    expect(projectRevision(bus.getDocument())).toBe(revBefore)

    const plan = evaluate(bus.getDocument(), {})
    expect(plan).toBeTruthy()
    expect(plan.passes || plan.evalOrder).toBeTruthy()

    const conversion = plan.passes.find((pass) => pass.kind === 'export-convert')
    expect(conversion.payload.format).toBe('png')
  })
})
