import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import JsonView from '../../components/json-view'

describe('customizeNode', () => {
	test('returning a React element replaces the node and skips its subtree', () => {
		const rendered = render(
			<JsonView
				src={{ a: { deep: 1 }, b: 2 }}
				enableClipboard={false}
				customizeNode={({ indexOrName }) => (indexOrName === 'a' ? <span data-testid="custom-a">CUSTOM</span> : undefined)}
			/>
		)
		expect(rendered.getByTestId('custom-a')).toHaveTextContent('CUSTOM')
		// subtree not walked
		expect(screen.queryByText('deep')).toBeNull()
		// sibling still renders normally
		expect(screen.getByText('b')).toBeInTheDocument()
	})

	test('returning a component renders it with node/depth/indexOrName props', () => {
		const Comp = ({ node, indexOrName }: any) => (
			<span data-testid="comp">
				{String(indexOrName)}={String(node)}
			</span>
		)
		render(<JsonView src={{ x: 42 }} enableClipboard={false} customizeNode={({ indexOrName }) => (indexOrName === 'x' ? Comp : undefined)} />)
		expect(screen.getByTestId('comp')).toHaveTextContent('x=42')
	})

	test('returning options applies className to the leaf', () => {
		render(<JsonView src={{ v: 'hi' }} enableClipboard={false} customizeNode={({ indexOrName }) => (indexOrName === 'v' ? { className: 'my-class' } : undefined)} />)
		expect(screen.getByText('"hi"')).toHaveClass('my-class')
	})
})

describe('CustomOperation', () => {
	test('renders after each node', () => {
		const Op = ({ node }: any) => <span className="op">op</span>
		const { container } = render(<JsonView src={{ a: 1, b: 2 }} enableClipboard={false} CustomOperation={Op} />)
		// one per value leaf + one on the container open row
		expect(container.querySelectorAll('.op').length).toBeGreaterThanOrEqual(3)
	})
})

describe('custom Copy component', () => {
	test('uses the provided CopyComponent', () => {
		const Copy = ({ onClick }: any) => (
			<button className="my-copy" onClick={onClick}>
				copy
			</button>
		)
		const { container } = render(<JsonView src={{ a: 1 }} CopyComponent={Copy} />)
		expect(container.querySelector('.my-copy')).toBeInTheDocument()
	})
})
