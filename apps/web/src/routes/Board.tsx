import { useParams } from 'wouter'
import { BoardEditor } from '../board/BoardEditor'

export function BoardPage() {
  const params = useParams<{ boardId: string }>()
  return <BoardEditor boardId={params.boardId} />
}
