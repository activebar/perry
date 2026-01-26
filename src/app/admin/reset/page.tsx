import { Suspense } from 'react'
import ResetClient from './reset-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function AdminResetPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-right">
            <p className="font-semibold">טוען…</p>
            <p className="mt-2 text-sm text-zinc-600">מכין מסך איפוס מנהל.</p>
          </div>
        </main>
      }
    >
      <ResetClient />
    </Suspense>
  )
}
