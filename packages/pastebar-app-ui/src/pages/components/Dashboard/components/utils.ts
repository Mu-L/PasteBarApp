import {
  Active,
  closestCorners,
  DataRef,
  DroppableContainer,
  getFirstCollision,
  KeyboardCode,
  KeyboardCoordinateGetter,
  Over,
  UniqueIdentifier,
} from '@dnd-kit/core'
import { bbCode } from '~/libs/bbcode'
import {
  BookOpenText,
  Contact,
  FileText,
  MessageSquareText,
  NotebookPen,
} from 'lucide-react'

import { BOARD, CLIP, TAB } from '../Dashboard'
import { Board, BoardDragData } from './Board'
import { TabDragData } from './BoardTabs'
import { Clip, ClipDragData } from './ClipCard'

// Note icon constants and types
export const NOTE_ICON_TYPES = {
  MESSAGE: 'MessageSquareText',
  FILE: 'FileText',
  BOOK: 'BookOpenText',
  CONTACT: 'Contact',
  NOTEBOOK: 'NotebookPen',
} as const

export type NoteIconType = (typeof NOTE_ICON_TYPES)[keyof typeof NOTE_ICON_TYPES]

// Icon component map for memoized note icon retrieval
const iconMap = {
  [NOTE_ICON_TYPES.MESSAGE]: MessageSquareText,
  [NOTE_ICON_TYPES.FILE]: FileText,
  [NOTE_ICON_TYPES.BOOK]: BookOpenText,
  [NOTE_ICON_TYPES.CONTACT]: Contact,
  [NOTE_ICON_TYPES.NOTEBOOK]: NotebookPen,
} as const

export function getNoteIconComponent(iconType: NoteIconType | undefined) {
  return iconMap[iconType || NOTE_ICON_TYPES.MESSAGE] || MessageSquareText
}

const directions: string[] = [
  KeyboardCode.Down,
  KeyboardCode.Right,
  KeyboardCode.Up,
  KeyboardCode.Left,
]

type DraggableData = BoardDragData | ClipDragData | TabDragData

export function hasDraggableData<T extends Active | Over>(
  entry: T | null | undefined
): entry is T & {
  data: DataRef<DraggableData>
} {
  if (!entry) {
    return false
  }

  const data = entry.data.current

  return data?.type === BOARD || data?.type === TAB || data?.type === CLIP ? true : false
}

type ChildItem = {
  id: UniqueIdentifier
  children?: ChildItem[]
}

export const getActiveIdFromPinned = (activeId: UniqueIdentifier) =>
  activeId.toString().split('::pinned')[0]

export function collectChildrenIds(item: {
  id: UniqueIdentifier
  children?: ChildItem[]
}) {
  let ids = [] as UniqueIdentifier[]

  if (item.children && item.children.length > 0) {
    item.children.forEach(child => {
      ids.push(child.id)
      ids = ids.concat(collectChildrenIds(child))
    })
  }

  return ids
}

export const coordinateGetter: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect } }
) => {
  if (directions.includes(event.code)) {
    event.preventDefault()

    if (!active || !collisionRect) {
      return
    }

    const filteredContainers: DroppableContainer[] = []

    droppableContainers.getEnabled().forEach(entry => {
      if (!entry || entry?.disabled) {
        return
      }

      const rect = droppableRects.get(entry.id)

      if (!rect) {
        return
      }

      const data = entry.data.current

      if (data) {
        const { type, children } = data

        if (
          type === 'Column' &&
          children?.length > 0 &&
          active.data.current?.type !== 'Column'
        ) {
          return
        }
      }

      switch (event.code) {
        case KeyboardCode.Down:
          if (active.data.current?.type === 'Column') {
            return
          }
          if (collisionRect.top < rect.top) {
            // find all droppable areas below
            filteredContainers.push(entry)
          }
          break
        case KeyboardCode.Up:
          if (active.data.current?.type === 'Column') {
            return
          }
          if (collisionRect.top > rect.top) {
            // find all droppable areas above
            filteredContainers.push(entry)
          }
          break
        case KeyboardCode.Left:
          if (collisionRect.left >= rect.left + rect.width) {
            // find all droppable areas to left
            filteredContainers.push(entry)
          }
          break
        case KeyboardCode.Right:
          // find all droppable areas to right
          if (collisionRect.left + collisionRect.width <= rect.left) {
            filteredContainers.push(entry)
          }
          break
      }
    })
    const collisions = closestCorners({
      active,
      collisionRect: collisionRect,
      droppableRects,
      droppableContainers: filteredContainers,
      pointerCoordinates: null,
    })
    const closestId = getFirstCollision(collisions, 'id')

    if (closestId != null) {
      const newDroppable = droppableContainers.get(closestId)
      const newNode = newDroppable?.node.current
      const newRect = newDroppable?.rect.current

      if (newNode && newRect) {
        return {
          x: newRect.left,
          y: newRect.top,
        }
      }
    }
  }

  return undefined
}

export function getValueMorePreviewLines(value: string) {
  if (!value) {
    return value
  }
  // Normalize line breaks to Unix style for consistent processing
  const normalizedValue = value.replace(/\r\n/g, '\n')

  if (normalizedValue.length > 160) {
    const lines = normalizedValue.split('\n').length
    const preview = normalizedValue.substring(0, 160)
    const previewLines = preview.split('\n').length
    const moreLine = lines - previewLines
    return moreLine > 0 ? moreLine : null
  } else {
    return null
  }
}

export function getValuePreview(
  value: string,
  isImageData: boolean = false,
  isLargeView: boolean = false
): {
  valuePreview: string
  morePreviewLines: number | null
  morePreviewChars: number | null
} {
  if (!value || isLargeView) {
    return {
      valuePreview:
        isImageData && value ? value.substring(0, 200) + '...' : value || 'No content',
      morePreviewLines: null,
      morePreviewChars: null,
    }
  }

  const normalizedValue = value.replace(/\r\n/g, '\n')
  const valueLines = normalizedValue.split('\n')

  if (valueLines.length >= 5 && !isImageData) {
    const valueLines = normalizedValue.split('\n')

    const previewLines = valueLines.slice(0, 5).join('\n')
    const morePreviewLines = normalizedValue.split('\n').length - 5

    return {
      valuePreview: bbCode.closeTags(previewLines),
      morePreviewLines: morePreviewLines > 0 ? morePreviewLines : null,
      morePreviewChars: !morePreviewLines ? normalizedValue.length - 160 : null,
    }
  }
  if (normalizedValue.length > 60 && !isImageData) {
    const morePreviewChars = normalizedValue.length - 60

    return {
      valuePreview: bbCode.closeTags(normalizedValue.substring(0, 60)) + '...',
      morePreviewLines: null,
      morePreviewChars: morePreviewChars > 0 ? morePreviewChars : null,
    }
  } else {
    const previewLines = normalizedValue.split('\n')
    const morePreviewLines = normalizedValue.split('\n').length - previewLines.length

    if (isImageData) {
      return {
        valuePreview: normalizedValue.substring(0, 60) + '...',
        morePreviewLines: null,
        morePreviewChars: null,
      }
    }

    return {
      valuePreview: normalizedValue,
      morePreviewLines: morePreviewLines > 0 ? morePreviewLines : null,
      morePreviewChars: null,
    }
  }
}

// Type guard to check if a node is a Board
const isBoard = (node: Board | Clip): node is Board => {
  return (node as Board).isBoard !== undefined && node.type === BOARD
}

// Function to find a board by ID
export const findBoardsById = (
  tree: (Board | Clip)[],
  id: UniqueIdentifier | null
): Board | undefined => {
  const searchTree = (nodes: (Board | Clip)[]): Board | undefined => {
    if (!nodes || !id) {
      return undefined
    }
    for (const node of nodes) {
      if (node.id === id && isBoard(node)) {
        return node
      }
      if (isBoard(node) && node.children) {
        const found = searchTree(node.children)
        if (found) {
          return found
        }
      }
    }
    return undefined
  }

  return searchTree(tree)
}

// Note options parsing and utilities
export interface NoteOptions {
  showIcon?: boolean
  iconType?: NoteIconType
  iconVisibility?: 'always' | 'hover' | 'none'
  iconColor?: string
}

export interface ItemOptions {
  noteOptions?: NoteOptions
}

export function parseItemOptions(itemOptions: string | null | undefined): ItemOptions {
  if (!itemOptions?.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(itemOptions)
    // Validate that parsed result is an object and not null
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ItemOptions
    }
    return {}
  } catch (error) {
    // Log error in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.warn('Failed to parse itemOptions JSON:', error)
    }
    return {}
  }
}

export function getNoteOptions(
  itemOptions: string | null | undefined,
  globalSettings?: { isNoteIconsEnabled?: boolean; defaultNoteIconType?: NoteIconType }
): NoteOptions {
  const parsed = parseItemOptions(itemOptions)
  return {
    showIcon: globalSettings?.isNoteIconsEnabled ?? true,
    iconType: globalSettings?.defaultNoteIconType ?? NOTE_ICON_TYPES.MESSAGE,
    iconVisibility: 'always',
    iconColor: 'text-yellow-600 dark:text-yellow-500',
    ...parsed.noteOptions,
  }
}

export function shouldShowNoteIcon(
  description: string | null | undefined,
  itemOptions: string | null | undefined,
  globalSettings?: { isNoteIconsEnabled?: boolean; defaultNoteIconType?: NoteIconType }
): boolean {
  if (!description?.trim()) {
    return false
  }

  const noteOptions = getNoteOptions(itemOptions, globalSettings)
  return noteOptions.showIcon === true
}
