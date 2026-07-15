import type { Collapsed, CustomizeOptions } from '../types'
import { isCollapsed, isCollapsed_largeArray } from '../utils'

// The store holds ONLY explicit user overrides (true = expanded, false = folded).
// Everything else resolves lazily from the existing isCollapsed helpers, so
// collapsed subtrees are never walked and there is no full-tree pre-pass.
export type ExpandState = Map<string, boolean>

export interface ExpandOpts {
	collapsed: Collapsed
	collapseObjectsAfterLength: number
}

/**
 * Whether a container node is expanded. `ownDepth` is the node's own depth
 * (= path.length + 1), matching what the legacy ObjectNode passed to isCollapsed.
 */
export function isContainerExpanded(
	overrides: ExpandState,
	key: string,
	node: any,
	ownDepth: number,
	indexOrName: number | string | undefined,
	opts: ExpandOpts,
	largeArray: boolean,
	customOptions?: CustomizeOptions
): boolean {
	if (overrides.has(key)) return overrides.get(key)!
	const collapsedResult = largeArray
		? isCollapsed_largeArray(node, ownDepth, indexOrName, opts.collapsed, opts.collapseObjectsAfterLength, customOptions)
		: isCollapsed(node, ownDepth, indexOrName, opts.collapsed, opts.collapseObjectsAfterLength, customOptions)
	return !collapsedResult
}

/** Large-array chunks default to folded (legacy LargeArrayNode useState(true)). */
export function isChunkExpanded(overrides: ExpandState, key: string): boolean {
	return overrides.get(key) ?? false
}
