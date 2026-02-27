import { google } from 'googleapis'
import { Readable } from 'stream'
import { getServerEnv } from './env'

type ServiceAccountJson = {
  client_email: string
  private_key: string
}

export async function getDriveClient() {
  const srv = getServerEnv()
  if (!srv.GDRIVE_SERVICE_ACCOUNT_JSON) throw new Error('GDRIVE_SERVICE_ACCOUNT_JSON not set')
  const sa = JSON.parse(srv.GDRIVE_SERVICE_ACCOUNT_JSON) as ServiceAccountJson

  const jwt = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.file']
  })

  await jwt.authorize()
  return google.drive({ version: 'v3', auth: jwt })
}

export async function ensureEventFolderId(): Promise<string> {
  const srv = getServerEnv()
  const root = srv.GDRIVE_ROOT_FOLDER_ID
  if (!root) throw new Error('GDRIVE_ROOT_FOLDER_ID not set')

  const drive = await getDriveClient()
  const slug = srv.EVENT_SLUG || 'ido'

  // Search for folder with name=slug under root
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${slug.replace(/'/g, "\\'")}' and '${root}' in parents and trashed = false`
  const res = await drive.files.list({ q, fields: 'files(id, name)' })
  const existing = res.data.files?.[0]
  if (existing?.id) return existing.id

  const created = await drive.files.create({
    requestBody: {
      name: slug,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [root]
    },
    fields: 'id'
  })

  if (!created.data.id) throw new Error('Failed to create event folder')
  return created.data.id
}

export async function uploadBufferToDrive(params: {
  filename: string
  mimeType: string
  buffer: Buffer
  parents: string[]
}): Promise<{ fileId: string; previewUrl: string }> {
  const drive = await getDriveClient()

  const res = await drive.files.create({
    requestBody: {
      name: params.filename,
      parents: params.parents
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer)
    },
    fields: 'id, webViewLink'
  })

  const fileId = res.data.id
  const previewUrl = res.data.webViewLink
  if (!fileId) throw new Error('Drive upload did not return file id')
  return {
    fileId,
    previewUrl: previewUrl || `https://drive.google.com/file/d/${fileId}/view`
  }
}
