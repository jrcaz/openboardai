import { AiCardShapeUtil } from './AiCardShapeUtil'
import { AiHtmlShapeUtil } from './AiHtmlShapeUtil'
import { AiImageShapeUtil } from './AiImageShapeUtil'
import { AiVideoShapeUtil } from './AiVideoShapeUtil'

// The custom tldraw shapes that back AI-generated content. Shared by the board
// editor and the public read-only viewer so a shared snapshot renders identically.
export const customShapeUtils = [
  AiCardShapeUtil,
  AiImageShapeUtil,
  AiVideoShapeUtil,
  AiHtmlShapeUtil,
]
