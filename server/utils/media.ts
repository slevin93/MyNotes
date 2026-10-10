import { dirname, resolve } from 'node:path'

export type UploadedMediaType = {
  extension: 'gif' | 'jpg' | 'mp4' | 'png' | 'webm' | 'webp'
  kind: 'image' | 'video'
  mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm'
  maxSize: number
  matches: (data: Buffer) => boolean
}

const maxImageSize = 20 * 1024 * 1024
const maxVideoSize = 50 * 1024 * 1024

const mediaTypes: UploadedMediaType[] = [
  {
    extension: 'jpg',
    kind: 'image',
    mimeType: 'image/jpeg',
    maxSize: maxImageSize,
    matches: data => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  },
  {
    extension: 'png',
    kind: 'image',
    mimeType: 'image/png',
    maxSize: maxImageSize,
    matches: data => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  {
    extension: 'gif',
    kind: 'image',
    mimeType: 'image/gif',
    maxSize: maxImageSize,
    matches: data => data.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null
  },
  {
    extension: 'webp',
    kind: 'image',
    mimeType: 'image/webp',
    maxSize: maxImageSize,
    matches: data => data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
  },
  {
    extension: 'mp4',
    kind: 'video',
    mimeType: 'video/mp4',
    maxSize: maxVideoSize,
    matches: data => data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp'
  },
  {
    extension: 'webm',
    kind: 'video',
    mimeType: 'video/webm',
    maxSize: maxVideoSize,
    matches: data => data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  }
]

export function getUploadedMediaType(mimeType: string, data: Buffer) {
  return mediaTypes.find(type => type.mimeType === mimeType && type.matches(data))
}

export function getMediaDirectory() {
  const config = useRuntimeConfig()
  const databasePath = resolve(process.cwd(), config.databasePath)
  return resolve(dirname(databasePath), 'uploads')
}
