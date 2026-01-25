import React from 'react'

// NOTE: These UI primitives are intentionally tiny, but they must accept standard DOM props
// (className, dir, id, data-*, etc.). Vercel/Next builds run type-checking, so keep typings broad.

export function Container(
  props: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }
) {
  const { children, className = '', ...rest } = props
  return (
    <div {...rest} className={`mx-auto w-full max-w-3xl px-4 py-6 ${className}`.trim()}>
      {children}
    </div>
  )
}

export function Card(
  props: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }
) {
  const { children, className = '', ...rest } = props
  return (
    <div
      {...rest}
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 p-4 ${className}`.trim()}
    >
      {children}
    </div>
  )
}

type ButtonVariant = 'primary' | 'ghost' | 'default'

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
) {
  const { variant = 'primary', className = '', ...rest } = props
  const base = 'rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed'
  const resolved: Exclude<ButtonVariant, 'default'> = variant === 'default' ? 'primary' : variant
  const v = resolved === 'primary'
    ? 'bg-zinc-900 text-white hover:bg-zinc-800'
    : 'bg-transparent text-zinc-900 hover:bg-zinc-100'
  return <button {...rest} className={`${base} ${v} ${className}`} />
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return <input {...rest} className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/20 ${className}`} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props
  return <textarea {...rest} className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/20 ${className}`} />
}
