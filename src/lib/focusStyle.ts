export type FocusStyleValue = number | null | undefined

export function focusStyle(x: FocusStyleValue, y: FocusStyleValue): {
  objectPosition: string
  objectFit: 'cover'
} {
  const px = (x ?? 0.5) * 100
  const py = (y ?? 0.5) * 100

  return {
    objectPosition: `${px}% ${py}%`,
    objectFit: 'cover',
  }
}
