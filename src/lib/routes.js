/** Central route map for the GIF studio app. */
export const ROUTES = {
  home: '/',
  gif: {
    root: '/gif',
    motion: '/gif/motion',
    elements: '/gif/elements',
    text: '/gif/text',
    edit: '/gif/edit',
    timeline: '/gif/timeline',
    output: '/gif/output',
  },
}

export const GIF_WORKSPACES = [
  'motion',
  'text',
  'edit',
  'timeline',
  'output',
]

export function gifWorkspacePath(workspace = 'motion') {
  return `/gif/${workspace}`
}

export function workspaceFromPath(pathname) {
  const match = pathname.match(/^\/gif\/([^/]+)/)
  return match?.[1] && GIF_WORKSPACES.includes(match[1]) ? match[1] : 'motion'
}
