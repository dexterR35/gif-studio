/**
 * Discriminated ToolState transitions.
 * Illegal combinations are unrepresentable; Escape cancels the current gesture.
 */

export const TOOL_KINDS = Object.freeze([
  'move',
  'select-rect',
  'select-lasso',
  'select-polygon',
  'select-pen',
  'mask-brush',
  'redact',
])

/**
 * @param {string} kind
 */
export function createInitialToolState(kind = 'move') {
  switch (kind) {
    case 'move':
      return { kind: 'move', phase: 'idle' }
    case 'select-rect':
      return { kind: 'select-rect', phase: 'ready' }
    case 'select-lasso':
      return { kind: 'select-lasso', phase: 'ready', points: [] }
    case 'select-polygon':
      return { kind: 'select-polygon', phase: 'placing', points: [] }
    case 'select-pen':
      return { kind: 'select-pen', phase: 'placing', points: [] }
    case 'mask-brush':
      return { kind: 'mask-brush', phase: 'ready' }
    case 'redact':
      return { kind: 'redact', phase: 'ready' }
    default:
      return { kind: 'move', phase: 'idle' }
  }
}

/**
 * @param {object} state
 * @returns {boolean}
 */
export function isGestureActive(state) {
  if (!state) return false
  switch (state.kind) {
    case 'move':
      return state.phase === 'dragging'
    case 'select-rect':
    case 'redact':
      return state.phase === 'drawing'
    case 'select-lasso':
      return state.phase === 'drawing'
    case 'select-polygon':
    case 'select-pen':
      return (state.points?.length ?? 0) > 0
    case 'mask-brush':
      return state.phase === 'painting'
    default:
      return false
  }
}

/**
 * Cancel current gesture → idle/ready for the same tool.
 * @param {object} state
 */
export function cancelToolGesture(state) {
  return createInitialToolState(state?.kind || 'move')
}

/**
 * Switch tool kind (always cancels gesture).
 * @param {object} _state
 * @param {string} kind
 */
export function switchTool(_state, kind) {
  if (!TOOL_KINDS.includes(kind)) {
    return { ok: false, error: `unknown tool kind: ${kind}`, state: _state }
  }
  return { ok: true, state: createInitialToolState(kind) }
}

/**
 * Apply a tool event. Returns { ok, state, error? }.
 *
 * Events:
 * - { type: 'pointerdown', pointerId?, point? }
 * - { type: 'pointermove', point? }
 * - { type: 'pointerup' }
 * - { type: 'add-point', point }
 * - { type: 'escape' }
 * - { type: 'switch', kind }
 *
 * @param {object} state
 * @param {object} event
 */
export function transitionTool(state, event) {
  if (!state || !event) {
    return { ok: false, error: 'missing state or event', state }
  }

  if (event.type === 'escape') {
    return { ok: true, state: cancelToolGesture(state) }
  }

  if (event.type === 'switch') {
    return switchTool(state, event.kind)
  }

  switch (state.kind) {
    case 'move':
      return transitionMove(state, event)
    case 'select-rect':
    case 'redact':
      return transitionRectTool(state, event)
    case 'select-lasso':
      return transitionLasso(state, event)
    case 'select-polygon':
    case 'select-pen':
      return transitionPolygonLike(state, event)
    case 'mask-brush':
      return transitionMaskBrush(state, event)
    default:
      return { ok: false, error: `unhandled tool kind: ${state.kind}`, state }
  }
}

function transitionMove(state, event) {
  if (event.type === 'pointerdown') {
    if (state.phase !== 'idle') {
      return { ok: false, error: 'move: pointerdown only from idle', state }
    }
    return {
      ok: true,
      state: { kind: 'move', phase: 'dragging', pointerId: event.pointerId },
    }
  }
  if (event.type === 'pointerup' || event.type === 'pointercancel') {
    if (state.phase !== 'dragging') {
      return { ok: false, error: 'move: pointerup only while dragging', state }
    }
    return { ok: true, state: { kind: 'move', phase: 'idle' } }
  }
  if (event.type === 'pointermove') {
    if (state.phase !== 'dragging') {
      return { ok: false, error: 'move: pointermove only while dragging', state }
    }
    return { ok: true, state }
  }
  return { ok: false, error: `move: illegal event ${event.type}`, state }
}

function transitionRectTool(state, event) {
  const kind = state.kind
  if (event.type === 'pointerdown') {
    if (state.phase !== 'ready') {
      return { ok: false, error: `${kind}: pointerdown only from ready`, state }
    }
    const p = event.point || { x: 0, y: 0 }
    return {
      ok: true,
      state: {
        kind,
        phase: 'drawing',
        draft: { x: p.x, y: p.y, w: 0, h: 0 },
      },
    }
  }
  if (event.type === 'pointermove') {
    if (state.phase !== 'drawing') {
      return { ok: false, error: `${kind}: pointermove only while drawing`, state }
    }
    const p = event.point || { x: 0, y: 0 }
    const draft = state.draft || { x: 0, y: 0, w: 0, h: 0 }
    return {
      ok: true,
      state: {
        ...state,
        draft: {
          x: draft.x,
          y: draft.y,
          w: p.x - draft.x,
          h: p.y - draft.y,
        },
      },
    }
  }
  if (event.type === 'pointerup' || event.type === 'pointercancel') {
    if (state.phase !== 'drawing') {
      return { ok: false, error: `${kind}: pointerup only while drawing`, state }
    }
    return { ok: true, state: createInitialToolState(kind) }
  }
  return { ok: false, error: `${kind}: illegal event ${event.type}`, state }
}

function transitionLasso(state, event) {
  if (event.type === 'pointerdown') {
    if (state.phase !== 'ready') {
      return { ok: false, error: 'select-lasso: pointerdown only from ready', state }
    }
    const p = event.point || { x: 0, y: 0 }
    return {
      ok: true,
      state: { kind: 'select-lasso', phase: 'drawing', points: [p] },
    }
  }
  if (event.type === 'pointermove' || event.type === 'add-point') {
    if (state.phase !== 'drawing') {
      return { ok: false, error: 'select-lasso: add points only while drawing', state }
    }
    const p = event.point || { x: 0, y: 0 }
    return {
      ok: true,
      state: { ...state, points: [...(state.points || []), p] },
    }
  }
  if (event.type === 'pointerup' || event.type === 'pointercancel') {
    if (state.phase !== 'drawing') {
      return { ok: false, error: 'select-lasso: pointerup only while drawing', state }
    }
    return { ok: true, state: createInitialToolState('select-lasso') }
  }
  return { ok: false, error: `select-lasso: illegal event ${event.type}`, state }
}

function transitionPolygonLike(state, event) {
  const kind = state.kind
  if (event.type === 'add-point' || event.type === 'pointerdown') {
    if (state.phase !== 'placing') {
      return { ok: false, error: `${kind}: add-point only while placing`, state }
    }
    const p = event.point || { x: 0, y: 0 }
    return {
      ok: true,
      state: { ...state, phase: 'placing', points: [...(state.points || []), p] },
    }
  }
  if (event.type === 'complete') {
    return { ok: true, state: createInitialToolState(kind) }
  }
  if (event.type === 'pointerup') {
    // polygon/pen use click-to-place; pointerup alone is a no-op success
    return { ok: true, state }
  }
  return { ok: false, error: `${kind}: illegal event ${event.type}`, state }
}

function transitionMaskBrush(state, event) {
  if (event.type === 'pointerdown') {
    if (state.phase !== 'ready') {
      return { ok: false, error: 'mask-brush: pointerdown only from ready', state }
    }
    return {
      ok: true,
      state: {
        kind: 'mask-brush',
        phase: 'painting',
        stroke: { points: [event.point || { x: 0, y: 0 }] },
      },
    }
  }
  if (event.type === 'pointermove') {
    if (state.phase !== 'painting') {
      return { ok: false, error: 'mask-brush: pointermove only while painting', state }
    }
    const stroke = state.stroke || { points: [] }
    return {
      ok: true,
      state: {
        ...state,
        stroke: { points: [...stroke.points, event.point || { x: 0, y: 0 }] },
      },
    }
  }
  if (event.type === 'pointerup' || event.type === 'pointercancel') {
    if (state.phase !== 'painting') {
      return { ok: false, error: 'mask-brush: pointerup only while painting', state }
    }
    return { ok: true, state: createInitialToolState('mask-brush') }
  }
  return { ok: false, error: `mask-brush: illegal event ${event.type}`, state }
}
