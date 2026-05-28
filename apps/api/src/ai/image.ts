import { generateImage } from 'ai'
import { nanoid } from 'nanoid'
import { db, schema } from '../db/client.js'
import { DEFAULTS } from './openrouter.js'
import type { ImageAspect } from '@openboard-ai/shared'

// Recorded canvas dimensions per aspect. OpenRouter's image SDK only honors
// `aspectRatio` (not size); these are nominal sizes used for layout/display.
const DIMS_FOR: Record<ImageAspect, { w: number; h: number }> = {
  '1:1': { w: 1024, h: 1024 },
  '16:9': { w: 1536, h: 864 },
  '9:16': { w: 864, h: 1536 },
}

export interface PersistedImage {
  imageId: string
  width: number
  height: number
  mediaType: string
  aspect: ImageAspect
  prompt: string
  model: string
}

export async function generateAndPersistImage({
  openrouter,
  boardId,
  prompt,
  aspect = '1:1',
  model,
  resultShapeId,
}: {
  openrouter: ReturnType<typeof import('@openrouter/ai-sdk-provider').createOpenRouter>
  boardId: string
  prompt: string
  aspect?: ImageAspect
  model?: string
  resultShapeId?: string | null
}): Promise<PersistedImage> {
  const selected = model?.trim() || process.env.OPENROUTER_IMAGE_MODEL || DEFAULTS.image
  const dims = DIMS_FOR[aspect]

  const { image } = await generateImage({
    model: openrouter.imageModel(selected),
    prompt,
    aspectRatio: aspect,
  })

  const id = nanoid(12)
  const mediaType = image.mediaType ?? 'image/png'
  const bytes = Buffer.from(image.uint8Array)

  await db.insert(schema.aiImages).values({
    id,
    boardId,
    prompt,
    model: selected,
    width: dims.w,
    height: dims.h,
    mediaType,
    bytes,
    resultShapeId: resultShapeId ?? null,
  })

  return {
    imageId: id,
    width: dims.w,
    height: dims.h,
    mediaType,
    aspect,
    prompt,
    model: selected,
  }
}
