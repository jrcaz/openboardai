import { z } from 'zod'

// --- Boards ---

export const CreateBoardRequest = z.object({
  title: z.string().trim().min(1).max(200).optional(),
})
export type CreateBoardRequest = z.infer<typeof CreateBoardRequest>

export const UpdateBoardRequest = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  // tldraw store snapshot is a structurally complex JSON document;
  // we accept any JSON object and let tldraw validate on load.
  snapshot: z.record(z.unknown()).optional(),
})
export type UpdateBoardRequest = z.infer<typeof UpdateBoardRequest>

export const BoardResponse = z.object({
  id: z.string(),
  title: z.string(),
  snapshot: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type BoardResponse = z.infer<typeof BoardResponse>

// Lightweight board record for the dashboard listing — omits the (potentially
// large) tldraw snapshot so the list stays fast.
export const BoardSummary = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type BoardSummary = z.infer<typeof BoardSummary>

export const BoardListResponse = z.array(BoardSummary)
export type BoardListResponse = z.infer<typeof BoardListResponse>

// Whether an ownerless (pre-accounts) board can be claimed by the current user.
// `title` is the legacy board's title, shown on the claim screen; null when the
// board isn't claimable.
export const BoardClaimStatus = z.object({
  claimable: z.boolean(),
  title: z.string().nullable(),
})
export type BoardClaimStatus = z.infer<typeof BoardClaimStatus>

// --- AI generate ---

export const ChatMessage = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(8000),
})
export type ChatMessage = z.infer<typeof ChatMessage>

export const AiContextShape = z.object({
  id: z.string(),
  type: z.string(),
  text: z.string().max(4000),
  // Optional pointer to image bytes the server should attach to the model
  // call as a vision input. Either `imageId` (resolved against aiImages.id)
  // or `dataUrl` (data: URL or remote http(s) URL) — never both required.
  imageRef: z
    .object({
      imageId: z.string().optional(),
      dataUrl: z.string().max(8 * 1024 * 1024).optional(),
      mediaType: z.string().optional(),
    })
    .optional(),
  // Optional pointer to an HTML widget stored in aiHtmls. The server fetches
  // the document and inlines it into the system prompt so the model can see
  // what the widget actually renders.
  htmlRef: z
    .object({
      htmlId: z.string(),
    })
    .optional(),
})
export type AiContextShape = z.infer<typeof AiContextShape>

export const GenerateRequest = z.object({
  boardId: z.string(),
  messages: z.array(ChatMessage).min(1).max(50),
  mode: z.enum(['prompt', 'selection-qa']).default('prompt'),
  context: z
    .object({
      shapes: z.array(AiContextShape).max(20).default([]),
    })
    .optional(),
  resultShapeId: z.string().optional(),
  model: z.string().min(1).max(200).optional(),
})
export type GenerateRequest = z.infer<typeof GenerateRequest>

// --- AI image generation ---

export const ImageAspect = z.enum(['1:1', '16:9', '9:16'])
export type ImageAspect = z.infer<typeof ImageAspect>

export const GenerateImageRequest = z.object({
  boardId: z.string(),
  prompt: z.string().trim().min(1).max(2000),
  aspect: ImageAspect.default('1:1'),
  resultShapeId: z.string().optional(),
  model: z.string().min(1).max(200).optional(),
})
export type GenerateImageRequest = z.infer<typeof GenerateImageRequest>

export const GenerateImageResponse = z.object({
  imageId: z.string(),
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mediaType: z.string(),
  prompt: z.string(),
})
export type GenerateImageResponse = z.infer<typeof GenerateImageResponse>

// --- AI video generation ---

export const VideoAspect = z.enum(['16:9', '9:16'])
export type VideoAspect = z.infer<typeof VideoAspect>

export const GenerateVideoRequest = z.object({
  boardId: z.string(),
  prompt: z.string().trim().min(1).max(2000),
  aspect: VideoAspect.default('16:9'),
  generateAudio: z.boolean().default(true),
  /** When set, perform image-to-video using this aiImages.id as the first frame. */
  sourceImageId: z.string().optional(),
  resultShapeId: z.string().optional(),
  model: z.string().min(1).max(200).optional(),
})
export type GenerateVideoRequest = z.infer<typeof GenerateVideoRequest>

export const GenerateVideoResponse = z.object({
  videoId: z.string(),
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().nullable(),
  mediaType: z.string(),
  hasAudio: z.boolean(),
  prompt: z.string(),
})
export type GenerateVideoResponse = z.infer<typeof GenerateVideoResponse>

// --- AI html generation ---

export const GenerateHtmlRequest = z.object({
  boardId: z.string(),
  prompt: z.string().trim().min(1).max(4000),
  title: z.string().trim().max(120).optional(),
  resultShapeId: z.string().optional(),
  model: z.string().min(1).max(200).optional(),
})
export type GenerateHtmlRequest = z.infer<typeof GenerateHtmlRequest>

export const GenerateHtmlResponse = z.object({
  htmlId: z.string(),
  url: z.string(),
  title: z.string(),
  prompt: z.string(),
  byteSize: z.number().int().nonnegative(),
})
export type GenerateHtmlResponse = z.infer<typeof GenerateHtmlResponse>

// Max characters for an uploaded HTML doc — 2 MB worth of UTF-16 source.
const MAX_HTML_UPLOAD_CHARS = 2_000_000

export const UploadHtmlRequest = z.object({
  boardId: z.string(),
  title: z.string().trim().min(1).max(200),
  html: z.string().min(1).max(MAX_HTML_UPLOAD_CHARS),
})
export type UploadHtmlRequest = z.infer<typeof UploadHtmlRequest>

export const UploadHtmlResponse = z.object({
  htmlId: z.string(),
  url: z.string(),
  title: z.string(),
  byteSize: z.number().int().nonnegative(),
})
export type UploadHtmlResponse = z.infer<typeof UploadHtmlResponse>

// --- OpenRouter model catalog ---

export const Modality = z.enum(['text', 'image', 'video'])
export type Modality = z.infer<typeof Modality>

export const ModelPricing = z.object({
  prompt: z.number().optional(),
  completion: z.number().optional(),
  image: z.number().optional(),
  request: z.number().optional(),
})
export type ModelPricing = z.infer<typeof ModelPricing>

export const ModelInfo = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  contextLength: z.number().int().nullable(),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  pricing: ModelPricing,
  provider: z.string().nullable(),
  isDefault: z.boolean(),
})
export type ModelInfo = z.infer<typeof ModelInfo>

export const ModelsResponse = z.object({
  data: z.array(ModelInfo),
  cachedAt: z.number(),
})
export type ModelsResponse = z.infer<typeof ModelsResponse>

// --- .obx file format (board save/import) ---

export const OBX_VERSION = 1 as const

export const ObxManifest = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  originalBoardId: z.string(),
  title: z.string(),
  counts: z.object({
    images: z.number().int().nonnegative(),
    videos: z.number().int().nonnegative(),
  }),
})
export type ObxManifest = z.infer<typeof ObxManifest>

export const ObxBoard = z.object({
  title: z.string(),
  snapshot: z.record(z.unknown()),
})
export type ObxBoard = z.infer<typeof ObxBoard>

export const ObxImageMeta = z.object({
  prompt: z.string(),
  model: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mediaType: z.string(),
})
export type ObxImageMeta = z.infer<typeof ObxImageMeta>

export const ObxVideoMeta = ObxImageMeta.extend({
  durationMs: z.number().int().nullable(),
  hasAudio: z.boolean(),
  sourceImageId: z.string().nullable(),
})
export type ObxVideoMeta = z.infer<typeof ObxVideoMeta>

export const UploadImageRequest = z.object({
  id: z.string().min(1).max(64),
  boardId: z.string(),
  prompt: z.string(),
  model: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mediaType: z.string(),
  bytesBase64: z.string(),
  resultShapeId: z.string().nullable().optional(),
})
export type UploadImageRequest = z.infer<typeof UploadImageRequest>

export const UploadVideoRequest = UploadImageRequest.extend({
  durationMs: z.number().int().nullable(),
  hasAudio: z.boolean(),
  sourceImageId: z.string().nullable(),
})
export type UploadVideoRequest = z.infer<typeof UploadVideoRequest>

export const UploadAssetResponse = z.object({
  id: z.string(),
})
export type UploadAssetResponse = z.infer<typeof UploadAssetResponse>
