import * as React from "react";

type ButtonVariant = "primary" | "ghost" | "default";

function cx(...xs: Array<string | undefined | false | null>) {
  return xs.filter(Boolean).join(" ");
}

export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6", className)} {...props} />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm", className)}
      {...props}
    />
  );
}

export function Button(
  { className, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
) {
  const v: "primary" | "ghost" = variant === "ghost" ? "ghost" : "primary"; // default + primary
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none";
  const styles = v === "ghost" ? "bg-transparent text-zinc-900 hover:bg-zinc-100" : "bg-black text-white hover:bg-zinc-800";
  return <button className={cx(base, styles, className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300",
        className
      )}
      {...props}
    />
  );
}
