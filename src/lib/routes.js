/** Central route map for the GIF studio app. */
export const ROUTES = {
  home: '/',
  gif: {
    root: '/gif',
    ai: '/gif/ai',
    motion: '/gif/motion',
    text: '/gif/text',
    timeline: '/gif/timeline',
    scale: '/gif/scale',
    output: '/gif/output',
  },
}

/** Tab order: AI → Motion → Text → Timeline → Scale → Export. */
export const GIF_WORKSPACES = [
  'ai',
  'motion',
  'text',
  'timeline',
  'scale',
  'output',
]

/** Workspaces that keep layers + inspector (not full-width focus panels). */
export const LAYER_WORKSPACES = new Set(['ai', 'motion', 'text'])

export function gifWorkspacePath(workspace = 'ai') {
  return `/gif/${workspace}`
}

export function workspaceFromPath(pathname) {
  const match = pathname.match(/^\/gif\/([^/]+)/)
  return match?.[1] && GIF_WORKSPACES.includes(match[1]) ? match[1] : 'ai'
}
