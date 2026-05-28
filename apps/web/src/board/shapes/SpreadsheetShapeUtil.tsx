import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BaseBoxShapeTool,
  BaseBoxShapeUtil,
  HTMLContainer,
  type RecordProps,
  T,
  type TLBaseShape,
  type TLShape,
  stopEventPropagation,
  useEditor,
  useValue,
} from 'tldraw'
import { updateCustomShape } from './customShape'
import { evaluateSheet, isErrorDisplay } from './spreadsheet/formula'
import { MAX_COLS, MAX_ROWS, cellKey, colLabel } from './spreadsheet/grid'

export const SPREADSHEET_TYPE = 'spreadsheet' as const

export type SpreadsheetShape = TLBaseShape<
  typeof SPREADSHEET_TYPE,
  {
    w: number
    h: number
    title: string
    rows: number
    cols: number
    // Sparse map of raw cell input keyed by address ("A1" -> "=A2+1"). Computed
    // values are derived at render time, never stored (Excel-style).
    cells: Record<string, string>
    // Sparse per-column width overrides keyed by column label ("A" -> px).
    colWidths: Record<string, number>
  }
>

// @ts-expect-error tldraw 4.5+ narrowed TLBaseBoxShape to a closed union of built-in shapes; custom shape types are no longer accepted as generic args.
export class SpreadsheetShapeUtil extends BaseBoxShapeUtil<SpreadsheetShape> {
  static override type = SPREADSHEET_TYPE
  static override props: RecordProps<SpreadsheetShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    rows: T.number,
    cols: T.number,
    cells: T.dict(T.string, T.string),
    colWidths: T.dict(T.string, T.number),
  }

  override getDefaultProps(): SpreadsheetShape['props'] {
    return {
      w: 480,
      h: 280,
      title: 'Spreadsheet',
      rows: 6,
      cols: 4,
      cells: {},
      colWidths: {},
    }
  }

  override canResize() {
    return true
  }

  override component(shape: SpreadsheetShape) {
    return <SpreadsheetComponent shape={shape} />
  }

  override indicator(shape: SpreadsheetShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={14} ry={14} />
  }
}

/**
 * Toolbar tool that creates a spreadsheet by clicking (default size) or
 * dragging a box (custom size) on the canvas — same pattern as tldraw's own
 * FrameShapeTool. New shape props come from `getDefaultProps`.
 */
export class SpreadsheetShapeTool extends BaseBoxShapeTool {
  static override id = SPREADSHEET_TYPE
  static override initial = 'idle'
  // @ts-expect-error tldraw 4.5+ narrowed the box-shape union to built-in types; our custom type isn't assignable but is valid at runtime.
  override shapeType = SPREADSHEET_TYPE

  override onCreate(shape: TLShape | null) {
    if (shape) this.editor.select(shape.id)
    this.editor.setCurrentTool('select')
  }
}

const ROW_HEADER_W = 38
const DEFAULT_COL_W = 92
const ROW_H = 26

interface ActiveCell {
  c: number
  r: number
}

function SpreadsheetComponent({ shape }: { shape: SpreadsheetShape }) {
  const editor = useEditor()
  const { w, h, title, rows, cols, cells, colWidths } = shape.props

  // "Interacting" routes pointer/keyboard into the grid so the user can select
  // and edit cells; default off so the shape can be dragged/selected on canvas.
  const [isInteracting, setInteracting] = useState(false)
  const [isHovered, setHovered] = useState(false)
  const [active, setActive] = useState<ActiveCell | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const gridRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Set by Enter/Tab inside the cell input so the trailing blur (fired when the
  // input unmounts) doesn't run commit() a second time with a stale closure.
  const committingRef = useRef(false)

  const evaluated = useMemo(() => evaluateSheet(cells, rows, cols), [cells, rows, cols])

  const isSelected = useValue(
    'spreadsheet-selected',
    () => editor.getOnlySelectedShapeId() === shape.id,
    [editor, shape.id],
  )

  // Leaving the selection drops interact mode (mirrors ai-html behavior).
  useEffect(() => {
    if (!isSelected && isInteracting) {
      setInteracting(false)
      setEditing(false)
    }
  }, [isSelected, isInteracting])

  // Focus the grid when entering interact mode so navigation keys work; focus
  // the cell input whenever we start editing one.
  useEffect(() => {
    if (isInteracting && !editing) gridRef.current?.focus()
  }, [isInteracting, editing])
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const colW = (c: number) => colWidths[colLabel(c)] ?? DEFAULT_COL_W

  const writeCell = (c: number, r: number, raw: string) => {
    const key = cellKey(c, r)
    const next = { ...cells }
    if (raw.trim() === '') delete next[key]
    else next[key] = raw
    updateCustomShape<SpreadsheetShape>(editor, {
      id: shape.id,
      type: SPREADSHEET_TYPE,
      props: { cells: next },
    })
  }

  const moveActive = (dc: number, dr: number) => {
    setActive((a) => {
      const c = Math.min(Math.max((a?.c ?? 0) + dc, 0), cols - 1)
      const r = Math.min(Math.max((a?.r ?? 0) + dr, 0), rows - 1)
      return { c, r }
    })
  }

  const beginEdit = (c: number, r: number, initial?: string) => {
    setActive({ c, r })
    setDraft(initial ?? cells[cellKey(c, r)] ?? '')
    setEditing(true)
  }

  const commit = (dc = 0, dr = 0) => {
    if (active) writeCell(active.c, active.r, draft)
    setEditing(false)
    if (dc !== 0 || dr !== 0) moveActive(dc, dr)
  }

  const addRow = () => {
    if (rows >= MAX_ROWS) return
    updateCustomShape<SpreadsheetShape>(editor, {
      id: shape.id,
      type: SPREADSHEET_TYPE,
      props: { rows: rows + 1 },
    })
  }
  const addCol = () => {
    if (cols >= MAX_COLS) return
    updateCustomShape<SpreadsheetShape>(editor, {
      id: shape.id,
      type: SPREADSHEET_TYPE,
      props: { cols: cols + 1 },
    })
  }

  // Keyboard navigation while a cell is selected but not being edited.
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return
    if (!active) {
      if (e.key.length === 1 || e.key === 'Enter' || e.key.startsWith('Arrow')) {
        setActive({ c: 0, r: 0 })
        e.preventDefault()
      }
      return
    }
    switch (e.key) {
      case 'ArrowUp':
        moveActive(0, -1)
        break
      case 'ArrowDown':
      case 'Enter':
        moveActive(0, 1)
        break
      case 'ArrowLeft':
        moveActive(-1, 0)
        break
      case 'ArrowRight':
      case 'Tab':
        moveActive(1, 0)
        break
      case 'F2':
        beginEdit(active.c, active.r)
        break
      case 'Backspace':
      case 'Delete':
        writeCell(active.c, active.r, '')
        break
      case 'Escape':
        setInteracting(false)
        return
      default:
        // A printable character starts editing the cell with that character.
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          beginEdit(active.c, active.r, e.key)
        } else {
          return
        }
    }
    e.preventDefault()
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      committingRef.current = true
      commit(0, 1)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      committingRef.current = true
      commit(1, 0)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      committingRef.current = true
      setEditing(false)
    }
  }

  // A blur fires when the cell <input> unmounts (after Enter/Tab/Escape
  // committed via the keydown handler) or when focus genuinely leaves it
  // (click elsewhere). Only commit in the latter case.
  const onInputBlur = () => {
    if (committingRef.current) {
      committingRef.current = false
      return
    }
    if (editing) commit()
  }

  const activeRaw =
    active && editing
      ? draft
      : active
      ? cells[cellKey(active.c, active.r)] ?? ''
      : ''

  const borderClass = isInteracting
    ? 'border-emerald-400 ring-2 ring-emerald-200'
    : 'border-neutral-200'

  return (
    <HTMLContainer id={shape.id} style={{ pointerEvents: 'all', width: w, height: h }}>
      <div
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border ${borderClass} bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06),0_18px_38px_-18px_rgba(5,150,105,0.28)] transition-colors duration-300`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <HeaderBar
          title={title}
          isInteracting={isInteracting}
          showToggle={isHovered || isSelected || isInteracting}
          hasActiveCell={!!active}
          activeLabel={active ? cellKey(active.c, active.r) : ''}
          formulaValue={activeRaw}
          onFormulaChange={(v) => {
            if (!active) return
            setDraft(v)
            setEditing(true)
          }}
          onFormulaKeyDown={onInputKeyDown}
          onFormulaBlur={onInputBlur}
          onToggleInteract={() => {
            setInteracting((v) => !v)
            setEditing(false)
          }}
          onAddRow={addRow}
          onAddCol={addCol}
        />

        <div className="relative flex-1 overflow-hidden">
          <div
            ref={gridRef}
            tabIndex={isInteracting ? 0 : -1}
            className="h-full w-full overflow-auto outline-none"
            onKeyDown={onGridKeyDown}
            onPointerDown={isInteracting ? stopEventPropagation : undefined}
            onWheel={isInteracting ? (e) => e.stopPropagation() : undefined}
          >
            <table
              className="border-collapse select-none text-[12px]"
              style={{ tableLayout: 'fixed' }}
            >
              <thead>
                <tr>
                  <CornerHeader />
                  {Array.from({ length: cols }, (_, c) => (
                    <th
                      key={c}
                      className="sticky top-0 z-10 border-b border-r border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500"
                      style={{ width: colW(c), height: ROW_H }}
                    >
                      {colLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }, (_, r) => (
                  <tr key={r}>
                    <th
                      className="sticky left-0 z-10 border-b border-r border-neutral-200 bg-neutral-50 text-center text-[11px] font-semibold text-neutral-500"
                      style={{ width: ROW_HEADER_W, height: ROW_H }}
                    >
                      {r + 1}
                    </th>
                    {Array.from({ length: cols }, (_, c) => {
                      const key = cellKey(c, r)
                      const cell = evaluated.get(key)
                      const isActive = active?.c === c && active?.r === r
                      const isEditingThis = isActive && editing
                      const isNumber = typeof cell?.value === 'number'
                      const isErr = !!cell?.error || (cell ? isErrorDisplay(cell.display) : false)
                      return (
                        <td
                          key={c}
                          className={`relative border-b border-r border-neutral-100 px-1.5 align-middle ${
                            isActive
                              ? 'outline outline-2 -outline-offset-2 outline-emerald-500'
                              : ''
                          } ${isErr ? 'text-red-600' : 'text-neutral-800'} ${
                            isNumber ? 'text-right' : 'text-left'
                          }`}
                          style={{ width: colW(c), height: ROW_H }}
                          onPointerDown={
                            isInteracting
                              ? (e) => {
                                  stopEventPropagation(e)
                                  if (!isEditingThis) {
                                    setActive({ c, r })
                                    setEditing(false)
                                  }
                                }
                              : undefined
                          }
                          onDoubleClick={
                            isInteracting ? () => beginEdit(c, r) : undefined
                          }
                        >
                          {isEditingThis ? (
                            <input
                              ref={inputRef}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={onInputKeyDown}
                              onBlur={onInputBlur}
                              onPointerDown={stopEventPropagation}
                              className="absolute inset-0 h-full w-full border-0 bg-white px-1.5 text-left text-[12px] text-neutral-900 outline-none"
                            />
                          ) : (
                            <span className="block truncate">{cell?.display ?? ''}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* When not interacting, a transparent layer offers double-click to edit
              while leaving single pointer events for the canvas (drag via header). */}
          {!isInteracting && (
            <div
              className="absolute inset-0 cursor-cell"
              onPointerDown={stopEventPropagation}
              onDoubleClick={(e) => {
                e.stopPropagation()
                editor.select(shape.id)
                setInteracting(true)
                if (!active) setActive({ c: 0, r: 0 })
              }}
              title="Double-click to edit"
            />
          )}
        </div>
      </div>
    </HTMLContainer>
  )
}

function CornerHeader() {
  return (
    <th
      className="sticky left-0 top-0 z-20 border-b border-r border-neutral-200 bg-neutral-100"
      style={{ width: ROW_HEADER_W, height: ROW_H }}
    />
  )
}

function HeaderBar({
  title,
  isInteracting,
  showToggle,
  hasActiveCell,
  activeLabel,
  formulaValue,
  onFormulaChange,
  onFormulaKeyDown,
  onFormulaBlur,
  onToggleInteract,
  onAddRow,
  onAddCol,
}: {
  title: string
  isInteracting: boolean
  showToggle: boolean
  hasActiveCell: boolean
  activeLabel: string
  formulaValue: string
  onFormulaChange: (v: string) => void
  onFormulaKeyDown: (e: React.KeyboardEvent) => void
  onFormulaBlur: () => void
  onToggleInteract: () => void
  onAddRow: () => void
  onAddCol: () => void
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-neutral-100 bg-gradient-to-b from-white to-neutral-50/60 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-4 items-center rounded-full bg-emerald-100 px-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700">
            Sheet
          </span>
          <span className="truncate text-[11.5px] font-medium text-neutral-700" title={title}>
            {title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isInteracting && (
            <>
              <button
                onPointerDown={stopEventPropagation}
                onClick={(e) => {
                  e.stopPropagation()
                  onAddRow()
                }}
                className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 transition hover:bg-neutral-200"
                title="Add a row"
              >
                + Row
              </button>
              <button
                onPointerDown={stopEventPropagation}
                onClick={(e) => {
                  e.stopPropagation()
                  onAddCol()
                }}
                className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 transition hover:bg-neutral-200"
                title="Add a column"
              >
                + Col
              </button>
            </>
          )}
          {showToggle && (
            <button
              onPointerDown={stopEventPropagation}
              onClick={(e) => {
                e.stopPropagation()
                onToggleInteract()
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                isInteracting
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
              title={isInteracting ? 'Done editing (Esc)' : 'Edit cells'}
            >
              {isInteracting ? 'Editing' : 'Edit'}
            </button>
          )}
        </div>
      </div>

      {isInteracting && (
        <div className="flex items-center gap-1.5">
          <span className="w-9 shrink-0 text-center text-[10.5px] font-semibold text-neutral-400">
            {activeLabel || '—'}
          </span>
          <input
            value={formulaValue}
            onChange={(e) => onFormulaChange(e.target.value)}
            onKeyDown={onFormulaKeyDown}
            onBlur={onFormulaBlur}
            onPointerDown={stopEventPropagation}
            disabled={!hasActiveCell}
            placeholder={
              hasActiveCell ? 'Enter a value or =formula' : 'Select a cell to edit'
            }
            className="h-5 min-w-0 flex-1 rounded border border-neutral-200 bg-white px-1.5 text-[11px] text-neutral-800 outline-none focus:border-emerald-400 disabled:bg-neutral-50 disabled:text-neutral-400"
          />
        </div>
      )}
    </div>
  )
}
