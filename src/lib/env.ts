import { z } from 'zod'

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  GDRIVE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GDRIVE_ROOT_FOLDER_ID: z.string().optional(),
  EVENT_SLUG: z.string().default('ido'),
  FOOTER_LABEL: z.string().optional(),
  FOOTER_URL: z.string().optional()
})

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SITE_NAME: z.string().optional()
})

export function getPublicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SITE_NAME: process.env.SITE_NAME
  })
}

export function getServerEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    GDRIVE_SERVICE_ACCOUNT_JSON: process.env.GDRIVE_SERVICE_ACCOUNT_JSON,
    GDRIVE_ROOT_FOLDER_ID: process.env.GDRIVE_ROOT_FOLDER_ID,
    EVENT_SLUG: process.env.EVENT_SLUG,
    FOOTER_LABEL: process.env.FOOTER_LABEL,
    FOOTER_URL: process.env.FOOTER_URL
  })
}
