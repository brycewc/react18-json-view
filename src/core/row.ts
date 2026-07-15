import type { ReactElement } from 'react'
import type { CustomizeOptions } from '../types'

// One visible line in the flattened tree.
//
// depth = VISUAL indentation level (root = 1); padding-left = (depth - 1) * 1em.
// This differs from the callback/collapse "own depth" (= path.length + 1) only
// inside large-array chunks, which add a visual indent level without a real path
// segment. Callback depths are derived from `path` in the mutation layer, not
// from `depth`, to preserve the exact legacy semantics.
export type RowKind =
	| 'open' // "[key: ]{" or "[key: ]["  — expanded container header
	| 'close' // "}" or "]"                 — expanded container footer
	| 'collapsed' // "[key: ]{...} N Items"      — folded container (children not walked)
	| 'value' // "[key: ]primitive"          — leaf
	| 'custom' // customizeNode element/component (subtree not walked)
	| 'chunk' // folded large-array bucket "[ start ... end ]"
	| 'chunk-open' // "[" of an expanded bucket
	| 'chunk-close' // "]" of an expanded bucket
	| 'add-input' // transient add-property input row

export type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'bigint' | 'function' | 'symbol'

export interface FlatRow {
	id: string
	path: (string | number)[]
	parentPath: (string | number)[]
	depth: number
	kind: RowKind
	indexOrName: string | number | undefined
	parentType: 'object' | 'array' | null
	value: any
	nodeType: NodeType
	bracket?: '{' | '}' | '[' | ']'
	size?: number
	/** expand-state key for container/chunk rows (open/collapsed/chunk*) */
	expandKey?: string
	customOptions?: CustomizeOptions
	customRender?: ReactElement | React.ComponentType<any>
	chunk?: { index: number; start: number; end: number }
}

export function getNodeType(node: any): NodeType {
	if (node === null) return 'null'
	if (Array.isArray(node)) return 'array'
	const t = typeof node
	if (t === 'object') return 'object'
	return t as NodeType
}
