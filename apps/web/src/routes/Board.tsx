import { useParams } from 'wouter'
import { BoardEditor } from '../board/BoardEditor'

export function BoardPage() {
  const params = useParams<{ boardId: string }>()
  // Key by boardId so navigating between boards (e.g. creating a new board
  // while one is open) fully remounts the editor. Without this the URL changes
  // but BoardEditor's tldraw store, snapshot ref and save listener stay bound to
  // the previous board — leaving the user stuck on the old canvas.
  return <BoardEditor key={params.boardId} boardId={params.boardId} />
}
