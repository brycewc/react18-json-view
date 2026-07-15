import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import JsonView from '../../components/json-view'

/** Characterization: current DOM/text output. Locks parity targets for the rewrite. */

describe('object / array rendering', () => {
	test('renders object keys as .json-view--property and primitive values', () => {
		render(<JsonView src={{ name: 'Alice', age: 30, ok: true, nothing: null }} enableClipboard={false} />)
		expect(screen.getByText('name')).toHaveClass('json-view--property')
		expect(screen.getByText('age')).toHaveClass('json-view--property')
		// values
		expect(screen.getByText('"Alice"')).toHaveClass('json-view--string')
		expect(screen.getByText('30')).toHaveClass('json-view--number')
		expect(screen.getByText('true')).toHaveClass('json-view--boolean')
		expect(screen.getByText('null')).toHaveClass('json-view--null')
	})

	test('array indices render as .json-view--index when displayArrayIndex is default (true)', () => {
		render(<JsonView src={[10, 20]} enableClipboard={false} />)
		expect(screen.getByText('0')).toHaveClass('json-view--index')
		expect(screen.getByText('1')).toHaveClass('json-view--index')
	})

	test('array indices are hidden when displayArrayIndex is false', () => {
		render(<JsonView src={[10, 20]} displayArrayIndex={false} enableClipboard={false} />)
		expect(screen.queryByText('0')).toBeNull()
		expect(screen.queryByText('1')).toBeNull()
		expect(screen.getByText('10')).toBeInTheDocument()
	})

	test('renders function / symbol / bigint values without crashing', () => {
		const src = { fn: function () {}, sym: Symbol('x'), big: BigInt(10) }
		const { container } = render(<JsonView src={src} enableClipboard={false} />)
		const text = container.textContent || ''
		expect(text).toContain('fn')
		expect(text).toContain('10n') // bigint suffix
		expect(text).toContain('Symbol(x)')
	})

	test('nested indentation uses per-row padding-left (depth - 1 em)', () => {
		// The flattened renderer replaces nested .jv-indent divs with inline
		// padding-left = (depth - 1)em on each row.
		render(<JsonView src={{ a: { b: 1 } }} enableClipboard={false} />)
		const aRow = screen.getByText('a').closest('.jv-row') as HTMLElement
		const bRow = screen.getByText('b').closest('.jv-row') as HTMLElement
		expect(aRow.style.paddingLeft).toBe('1em') // depth 2
		expect(bRow.style.paddingLeft).toBe('2em') // depth 3
	})
})

describe('collapse behavior', () => {
	test('collapsed={true} renders the "..." button and hides children', () => {
		render(<JsonView src={{ a: 1, b: 2 }} collapsed={true} enableClipboard={false} />)
		expect(screen.getByText('...')).toBeInTheDocument()
		expect(screen.queryByText('a')).toBeNull()
	})

	test('collapsed as a number collapses only below that depth', () => {
		render(<JsonView src={{ a: { b: 1 } }} collapsed={1} enableClipboard={false} />)
		// depth-1 root stays open (key `a` visible), depth-2 object is folded
		expect(screen.getByText('a')).toBeInTheDocument()
		expect(screen.queryByText('b')).toBeNull()
	})

	test('displaySize renders the "N Items" label', () => {
		render(<JsonView src={{ a: 1, b: 2, c: 3 }} displaySize={true} enableClipboard={false} />)
		expect(screen.getByText(/3 Items/)).toBeInTheDocument()
	})
})

describe('long strings', () => {
	test('directly mode truncates after collapseStringsAfterLength with an ellipsis', () => {
		const { container } = render(<JsonView src={{ s: 'abcdefghij' }} collapseStringsAfterLength={5} collapseStringMode="directly" enableClipboard={false} />)
		const text = container.textContent || ''
		expect(text).toContain('abcde')
		expect(text).toContain('...')
		expect(text).not.toContain('fghij')
	})

	test('strings at or below the threshold render in full', () => {
		render(<JsonView src={{ s: 'short' }} collapseStringsAfterLength={99} enableClipboard={false} />)
		expect(screen.getByText('"short"')).toBeInTheDocument()
	})

	test('clicking a truncated string expands it (central truncation state)', () => {
		const { container } = render(<JsonView src={{ s: 'abcdefghij' }} collapseStringsAfterLength={5} collapseStringMode="directly" enableClipboard={false} />)
		expect(container.textContent).not.toContain('fghij')
		const strSpan = container.querySelector('.json-view--string') as HTMLElement
		fireEvent.click(strSpan)
		expect(container.textContent).toContain('abcdefghij')
	})
})

describe('large array chunking (>100 items)', () => {
	test('renders 100-item chunk buttons labelled "start ... end", folded by default', () => {
		const arr = Array.from({ length: 150 }, (_, i) => i)
		const { container } = render(<JsonView src={arr} enableClipboard={false} />)
		const buttons = Array.from(container.querySelectorAll('button.jv-button')).map(b => b.textContent)
		expect(buttons).toContain('0 ... 99')
		expect(buttons).toContain('100 ... 149')
	})

	test('ignoreLargeArray renders elements directly (no chunk buttons)', () => {
		const arr = Array.from({ length: 150 }, (_, i) => i)
		// collapsed={false} keeps the (>99-item) array expanded so elements render inline
		// virtual={false} keeps all rows in the DOM (jsdom has no layout, so the
		// virtualizer would otherwise render 0 rows)
		const { container } = render(<JsonView src={arr} ignoreLargeArray collapsed={false} virtual={false} enableClipboard={false} />)
		const chunkButtons = Array.from(container.querySelectorAll('button.jv-button')).filter(b => /\.\.\./.test(b.textContent || ''))
		expect(chunkButtons.length).toBe(0)
		// element 149 is present (both its index label and value render as "149")
		expect(screen.getAllByText('149').length).toBeGreaterThan(0)
	})
})
