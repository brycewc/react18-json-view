import { isValidElement } from 'react'
import type { Collapsed, CustomizeNode, CustomizeOptions } from '../types'
import { objectSize, isReactComponent, safeCall } from '../utils'
import { FlatRow, RowKind, getNodeType } from './row'
import { pathKey, chunkKey } from './path'
import { ExpandState, isContainerExpanded, isChunkExpanded } from './expand-state'

export const CHUNK_SIZE = 100
export const LARGE_ARRAY_THRESHOLD = 100

export interface FlattenOpts {
	expand: ExpandState
	collapsed: Collapsed
	collapseObjectsAfterLength: number
	customizeNode?: CustomizeNode
	ignoreLargeArray: boolean
	/** pathKey of a container currently showing its add-property input row */
	addingKey?: string
}

type Frame =
	| { t: 'node'; value: any; path: (string | number)[]; depth: number; indexOrName: string | number | undefined; parentType: 'object' | 'array' | null }
	| { t: 'chunk'; array: any[]; path: (string | number)[]; depth: number; index: number; start: number; end: number }
	| { t: 'emit'; row: FlatRow }

function makeId(path: (string | number)[], kind: RowKind, expandKey?: string): string {
	if (kind === 'chunk' || kind === 'chunk-open' || kind === 'chunk-close') return expandKey + ':' + kind
	return pathKey(path) + ':' + kind
}

/**
 * Turn `root` + the expand-state overrides into an ordered flat array of visible
 * rows. Collapsed subtrees are never walked, so cost is O(visible rows).
 */
export function flatten(root: any, opts: FlattenOpts): FlatRow[] {
	const { expand, collapsed, collapseObjectsAfterLength, customizeNode, ignoreLargeArray, addingKey } = opts
	const rows: FlatRow[] = []
	const stack: Frame[] = [{ t: 'node', value: root, path: [], depth: 1, indexOrName: undefined, parentType: null }]

	while (stack.length) {
		const frame = stack.pop()!

		if (frame.t === 'emit') {
			rows.push(frame.row)
			continue
		}

		if (frame.t === 'chunk') {
			processChunk(frame, expand, rows, stack)
			continue
		}

		const { value, path, depth, indexOrName, parentType } = frame
		const ownDepth = path.length + 1

		// customizeNode runs first, exactly like json-node.tsx short-circuit
		let customOptions: CustomizeOptions | undefined
		if (typeof customizeNode === 'function') {
			const ret = safeCall(customizeNode, [{ node: value, depth: ownDepth, indexOrName }])
			if (ret) {
				if (isValidElement(ret)) {
					rows.push(mkRow({ kind: 'custom', path, depth, indexOrName, parentType, value, customRender: ret }))
					continue
				} else if (isReactComponent(ret)) {
					rows.push(mkRow({ kind: 'custom', path, depth, indexOrName, parentType, value, customRender: ret as React.ComponentType<any> }))
					continue
				} else if (typeof ret === 'object') {
					customOptions = ret as CustomizeOptions
				}
			}
		}

		const nodeType = getNodeType(value)
		const isArr = nodeType === 'array'
		const isObj = nodeType === 'object'

		if (!isArr && !isObj) {
			rows.push(mkRow({ kind: 'value', path, depth, indexOrName, parentType, value, nodeType, customOptions }))
			continue
		}

		const key = pathKey(path)
		const size = objectSize(value)
		const largeArray = isArr && !ignoreLargeArray && (value as any[]).length > LARGE_ARRAY_THRESHOLD
		const expanded = isContainerExpanded(expand, key, value, ownDepth, indexOrName, { collapsed, collapseObjectsAfterLength }, largeArray, customOptions)
		const openBracket = isArr ? '[' : '{'
		const closeBracket = isArr ? ']' : '}'

		if (!expanded) {
			rows.push(mkRow({ kind: 'collapsed', path, depth, indexOrName, parentType, value, nodeType, bracket: openBracket, size, expandKey: key, customOptions }))
			continue
		}

		rows.push(mkRow({ kind: 'open', path, depth, indexOrName, parentType, value, nodeType, bracket: openBracket, size, expandKey: key, customOptions }))

		const closeRow = mkRow({ kind: 'close', path, depth, indexOrName, parentType, value, nodeType, bracket: closeBracket, size, expandKey: key })
		stack.push({ t: 'emit', row: closeRow })

		// children, pushed reversed so the first child pops first
		if (largeArray) {
			const arr = value as any[]
			const chunkCount = Math.ceil(arr.length / CHUNK_SIZE)
			for (let c = chunkCount - 1; c >= 0; c--) {
				const start = c * CHUNK_SIZE
				const end = Math.min(arr.length, start + CHUNK_SIZE)
				stack.push({ t: 'chunk', array: arr, path, depth: depth + 1, index: c, start, end })
			}
		} else if (isArr) {
			const arr = value as any[]
			for (let i = arr.length - 1; i >= 0; i--) {
				stack.push({ t: 'node', value: arr[i], path: [...path, i], depth: depth + 1, indexOrName: i, parentType: 'array' })
			}
		} else {
			const entries = Object.entries(value)
			for (let i = entries.length - 1; i >= 0; i--) {
				const [k, v] = entries[i]
				stack.push({ t: 'node', value: v, path: [...path, k], depth: depth + 1, indexOrName: k, parentType: 'object' })
			}
		}

		// add-input row emits right after the open row (top of stack)
		if (addingKey !== undefined && addingKey === key) {
			stack.push({ t: 'emit', row: mkRow({ kind: 'add-input', path, depth: depth + 1, indexOrName, parentType: isArr ? 'array' : 'object', value: null }) })
		}
	}

	return rows
}

function processChunk(frame: Extract<Frame, { t: 'chunk' }>, expand: ExpandState, rows: FlatRow[], stack: Frame[]) {
	const { array, path, depth, index, start, end } = frame
	const key = chunkKey(path, index)
	const chunkMeta = { index, start, end: end - 1 }
	const expanded = isChunkExpanded(expand, key)

	if (!expanded) {
		rows.push(
			mkRow({ kind: 'chunk', path, depth, indexOrName: undefined, parentType: 'array', value: array.slice(start, end), nodeType: 'array', bracket: '[', expandKey: key, chunk: chunkMeta })
		)
		return
	}

	rows.push(
		mkRow({ kind: 'chunk-open', path, depth, indexOrName: undefined, parentType: 'array', value: array.slice(start, end), nodeType: 'array', bracket: '[', expandKey: key, chunk: chunkMeta })
	)
	const closeRow = mkRow({ kind: 'chunk-close', path, depth, indexOrName: undefined, parentType: 'array', value: null, nodeType: 'array', bracket: ']', expandKey: key, chunk: chunkMeta })
	stack.push({ t: 'emit', row: closeRow })

	for (let i = end - 1; i >= start; i--) {
		stack.push({ t: 'node', value: array[i], path: [...path, i], depth: depth + 1, indexOrName: i, parentType: 'array' })
	}
}

function mkRow(partial: Omit<FlatRow, 'id' | 'parentPath' | 'nodeType'> & { nodeType?: FlatRow['nodeType'] }): FlatRow {
	const nodeType = partial.nodeType ?? getNodeType(partial.value)
	return {
		...partial,
		nodeType,
		parentPath: partial.path.slice(0, -1),
		id: makeId(partial.path, partial.kind, partial.expandKey)
	}
}
