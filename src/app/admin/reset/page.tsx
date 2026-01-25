import { Suspense } from 'react'
import ResetClient from './client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="p-6 text-right">טוען…</div>}>
      <ResetClient />
    </Suspense>
  )
}
