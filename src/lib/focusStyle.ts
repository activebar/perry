export function focusStyle(x?: number | null, y?: number | null) {
  const px = Math.round((typeof x === 'number' ? Math.max(0, Math.min(1, x)) : 0.5) * 100)
  const py = Math.round((typeof y === 'number' ? Math.max(0, Math.min(1, y)) : 0.5) * 100)
  return { objectPosition: `${px}% ${py}%` }
}
