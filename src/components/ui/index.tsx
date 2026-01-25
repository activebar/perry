import React from 'react'

export function Container({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`mx-auto w-full max-w-3xl px-4 py-6 ${className}`} {...props} />
}

export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ${className}`} {...props} />
}

type ButtonVariant = 'primary' | 'ghost'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition border'
  const styles =
    variant === 'ghost'
      ? 'border-transparent bg-transparent hover:bg-zinc-100'
      : 'border-zinc-900 bg-zinc-900 text-white hover:bg-black'

  return <button className={`${base} ${styles} ${className}`} {...props} />
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 ${
        props.className || ''
      }`}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 ${
        props.className || ''
      }`}
    />
  )
}
