import { describe, test, expect } from 'vitest'
import { flatten, FlattenOpts } from './flatten'
import { ExpandState } from './expand-state'
import { pathKey, chunkKey } from './path'

function opts(over: Partial<FlattenOpts> = {}): FlattenOpts {
	return {
		expand: new Map(),
		collapsed: undefined,
		collapseObjectsAfterLength: 99,
		ignoreLargeArray: false,
		...over
	}
}

const sig = (rows: ReturnType<typeof flatten>) => rows.map(r => `${r.kind}:${String(r.indexOrName)}@${r.depth}`)

describe('flatten — primitives & containers', () => {
	test('primitive root is a single value row at depth 1', () => {
		const rows = flatten('hello', opts())
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ kind: 'value', path: [], depth: 1, nodeType: 'string', parentType: null, value: 'hello' })
	})

	test('simple object: open, values, close in order with correct depths', () => {
		const rows = flatten({ a: 1, b: 'x' }, opts())
		expect(sig(rows)).toEqual(['open:undefined@1', 'value:a@2', 'value:b@2', 'close:undefined@1'])
		expect(rows[1]).toMatchObject({ path: ['a'], parentType: 'object', nodeType: 'number' })
	})

	test('nested object depths follow visual nesting', () => {
		const rows = flatten({ a: { b: 1 } }, opts())
		expect(sig(rows)).toEqual(['open:undefined@1', 'open:a@2', 'value:b@3', 'close:a@2', 'close:undefined@1'])
		expect(rows[2]).toMatchObject({ path: ['a', 'b'] })
	})

	test('array elements carry numeric indexOrName and array parentType', () => {
		const rows = flatten([10, 20], opts())
		expect(sig(rows)).toEqual(['open:undefined@1', 'value:0@2', 'value:1@2', 'close:undefined@1'])
		expect(rows[1]).toMatchObject({ indexOrName: 0, parentType: 'array', path: [0] })
	})

	test('node types are classified (null vs object vs number vs bool)', () => {
		const rows = flatten({ n: null, s: 'x', b: true, num: 3 }, opts())
		const byName = Object.fromEntries(rows.filter(r => r.kind === 'value').map(r => [r.indexOrName, r.nodeType]))
		expect(byName).toEqual({ n: 'null', s: 'string', b: 'boolean', num: 'number' })
	})
})

describe('flatten — collapse defaults', () => {
	test('collapsed=true yields a single collapsed row, children not walked', () => {
		const rows = flatten({ a: 1, b: 2 }, opts({ collapsed: true }))
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ kind: 'collapsed', depth: 1 })
	})

	test('collapsed as number collapses strictly below that depth', () => {
		const rows = flatten({ a: { b: 1 } }, opts({ collapsed: 1 }))
		// root (depth 1) open; inner object (own depth 2 > 1) collapsed
		expect(sig(rows)).toEqual(['open:undefined@1', 'collapsed:a@2', 'close:undefined@1'])
	})

	test('collapseObjectsAfterLength folds oversized containers by default', () => {
		const rows = flatten({ a: 1, b: 2, c: 3 }, opts({ collapseObjectsAfterLength: 2 }))
		expect(rows[0].kind).toBe('collapsed')
	})

	test('expand override re-opens a would-be-collapsed node', () => {
		const expand: ExpandState = new Map([[pathKey([]), true]])
		const rows = flatten({ a: 1 }, opts({ collapsed: true, expand }))
		expect(rows[0].kind).toBe('open')
	})
})

describe('flatten — large-array chunking', () => {
	const arr = Array.from({ length: 150 }, (_, i) => i)

	test('folds into chunk rows (folded by default) under the array', () => {
		const rows = flatten(arr, opts())
		const kinds = rows.map(r => r.kind)
		expect(kinds).toEqual(['open', 'chunk', 'chunk', 'close'])
		expect(rows[1].chunk).toEqual({ index: 0, start: 0, end: 99 })
		expect(rows[2].chunk).toEqual({ index: 1, start: 100, end: 149 })
		// chunk rows sit one visual level below the array
		expect(rows[1].depth).toBe(2)
	})

	test('expanding a chunk walks its real-indexed elements at depth+2', () => {
		const expand: ExpandState = new Map([[chunkKey([], 1), true]])
		const rows = flatten(arr, opts({ expand }))
		const open = rows.find(r => r.kind === 'chunk-open')!
		expect(open.depth).toBe(2)
		const el = rows.find(r => r.kind === 'value' && r.indexOrName === 149)!
		expect(el).toMatchObject({ depth: 3, parentType: 'array', path: [149] })
		expect(rows.some(r => r.kind === 'chunk-close')).toBe(true)
	})

	test('ignoreLargeArray renders elements directly (no chunks)', () => {
		const rows = flatten(arr, opts({ ignoreLargeArray: true, collapsed: false }))
		expect(rows.some(r => r.kind.startsWith('chunk'))).toBe(false)
		expect(rows.filter(r => r.kind === 'value')).toHaveLength(150)
	})
})

describe('flatten — customizeNode & path safety', () => {
	test('customizeNode element short-circuits to a custom row (subtree not walked)', () => {
		const el = { $$typeof: Symbol.for('react.element'), type: 'span', props: {}, key: null } as any
		const rows = flatten({ a: { deep: 1 } }, opts({ customizeNode: ({ indexOrName }) => (indexOrName === 'a' ? el : undefined) }))
		expect(sig(rows)).toEqual(['open:undefined@1', 'custom:a@2', 'close:undefined@1'])
	})

	test('customizeNode options object feeds collapse (collapsed:true)', () => {
		const rows = flatten({ a: { b: 1 } }, opts({ customizeNode: ({ indexOrName }) => (indexOrName === 'a' ? { collapsed: true } : undefined) }))
		const aRow = rows.find(r => r.indexOrName === 'a')!
		expect(aRow.kind).toBe('collapsed')
		expect(aRow.customOptions).toEqual({ collapsed: true })
	})

	test('dotted keys do not collide in path ids', () => {
		const rows = flatten({ 'a.b': 1, a: { b: 2 } }, opts())
		const ids = rows.map(r => r.id)
		expect(new Set(ids).size).toBe(ids.length)
	})
})

describe('flatten — add-input injection', () => {
	test('injects an add-input row right after the container open row', () => {
		const rows = flatten({ a: 1 }, opts({ addingKey: pathKey([]) }))
		expect(sig(rows)).toEqual(['open:undefined@1', 'add-input:undefined@2', 'value:a@2', 'close:undefined@1'])
	})
})
