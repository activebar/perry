import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function GalleryAdminRemoved() {
  // Old demo route removed – manage galleries & approvals inside /admin
  redirect('/admin?tab=galleries')
}
