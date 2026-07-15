import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import JsonView from '../components/json-view'

// jsdom has no layout, so give the scroll container and rows fake sizes and
// prove that only a viewport-sized window of rows is mounted. @tanstack/react-virtual
// (v3.14+) reads offsetWidth/offsetHeight for both the scroll rect and row measurement.
const VIEWPORT = 200
const ROW_H = 20

const sizeGetter = (dim: 'height' | 'width') =>
	function (this: HTMLElement) {
		if (dim === 'width') return 400
		return this.classList?.contains('jv-scroll') ? VIEWPORT : ROW_H
	}

let originals: Record<string, PropertyDescriptor | undefined> = {}

beforeAll(() => {
	originals.offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
	originals.offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: sizeGetter('height') })
	Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: sizeGetter('width') })
})
afterAll(() => {
	if (originals.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originals.offsetHeight)
	if (originals.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originals.offsetWidth)
})

describe('virtualization windowing', () => {
	test('only a window of rows is mounted for a large array (default auto)', () => {
		const arr = Array.from({ length: 5000 }, (_, i) => i)
		const { container } = render(<JsonView src={arr} ignoreLargeArray collapsed={false} estimatedRowHeight={ROW_H} overscan={5} enableClipboard={false} />)

		// virtual path engaged
		expect(container.querySelector('.jv-scroll')).toBeInTheDocument()
		expect(container.querySelector('.jv-sizer')).toBeInTheDocument()

		const rendered = container.querySelectorAll('.jv-row').length
		// 5000 elements -> 5002 rows; a ~200px viewport at 20px/row should mount
		// far fewer than the full set.
		expect(rendered).toBeGreaterThan(0)
		expect(rendered).toBeLessThan(80)
	})

	test('small documents stay non-virtualized under auto (no scroll container)', () => {
		const { container } = render(<JsonView src={{ a: 1, b: 2 }} enableClipboard={false} />)
		expect(container.querySelector('.jv-scroll')).toBeNull()
		expect(container.querySelector('code.json-view')).toBeInTheDocument()
	})

	test('explicit height forces virtualization even for small documents', () => {
		const { container } = render(<JsonView src={{ a: 1 }} height={100} enableClipboard={false} />)
		expect(container.querySelector('.jv-scroll')).toBeInTheDocument()
	})
})
