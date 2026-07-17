/** Central route map for the GIF studio app. */
export const ROUTES = {
  home: '/',
  gif: {
    root: '/gif',
    motion: '/gif/motion',
    elements: '/gif/elements',
    text: '/gif/text',
    frames: '/gif/frames',
    edit: '/gif/edit',
    output: '/gif/output',
    preview: '/gif/preview',
  },
}

export const GIF_WORKSPACES = [
  'motion',
  'elements',
  'text',
  'frames',
  'edit',
  'output',
  'preview',
]

export function gifWorkspacePath(workspace = 'motion') {
  return `/gif/${workspace}`
}

export function workspaceFromPath(pathname) {
  const match = pathname.match(/^\/gif\/([^/]+)/)
  return match?.[1] && GIF_WORKSPACES.includes(match[1]) ? match[1] : 'motion'
}
