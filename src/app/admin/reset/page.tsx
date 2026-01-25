import { Suspense } from 'react'
import ResetClient from './ResetClient'

export default function AdminResetPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md p-4">טוען...</div>}>
      <ResetClient />
    </Suspense>
  )
}
