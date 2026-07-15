import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import JsonView from '../components/json-view'

// jsdom has no layout, so give the scroll container and rows fake sizes and
// prove that only a viewport-sized window of rows is mounted.
const VIEWPORT = 200
const ROW_H = 20

let original: PropertyDescriptor | undefined

beforeAll(() => {
	original = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')
	Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
		configurable: true,
		value(this: HTMLElement) {
			const h = this.classList?.contains('jv-scroll') ? VIEWPORT : ROW_H
			return { height: h, width: 400, top: 0, left: 0, bottom: h, right: 400, x: 0, y: 0, toJSON() {} } as DOMRect
		}
	})
})
afterAll(() => {
	if (original) Object.defineProperty(Element.prototype, 'getBoundingClientRect', original)
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
