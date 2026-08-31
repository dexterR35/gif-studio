/** Central route map for the image studio app. */
export const ROUTES = {
  home: '/',
  studio: {
    root: '/studio',
    ai: '/studio/ai',
    text: '/studio/text',
    scale: '/studio/scale',
    output: '/studio/output',
  },
}

/** Primary editing workspaces. */
export const WORKSPACES = [
  'ai',
  'text',
  'scale',
  'output',
]

/** Workspaces that keep layers + inspector (not full-width focus panels). */
export const LAYER_WORKSPACES = new Set(['ai', 'text'])

export function workspacePath(workspace = 'ai') {
  return `/studio/${workspace}`
}

export function workspaceFromPath(pathname) {
  const match = pathname.match(/^\/studio\/([^/]+)/)
  return match?.[1] && WORKSPACES.includes(match[1]) ? match[1] : 'ai'
}
