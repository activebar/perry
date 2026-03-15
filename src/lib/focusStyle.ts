
export function focusStyle(x, y){
  const px = (x ?? 0.5) * 100
  const py = (y ?? 0.5) * 100
  return {
    objectPosition: `${px}% ${py}%`,
    objectFit: 'cover'
  }
}
