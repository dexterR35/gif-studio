/** Merge class names, skipping falsy values. */
export function cn(...parts) {
  return parts.flat().filter(Boolean).join(' ')
}
