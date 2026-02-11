import { cookies } from 'next/headers'

export const DEVICE_COOKIE = 'device_id'

export function getDeviceId(): string | null {
  const c = cookies().get(DEVICE_COOKIE)
  return c?.value || null
}
