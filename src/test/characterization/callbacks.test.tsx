import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import JsonView from '../../components/json-view'

/**
 * Characterization tests: these lock the CURRENT observable callback behavior
 * of the recursive renderer so the virtualization rewrite can be proven
 * byte-compatible. They intentionally encode quirks (notably the edit-vs-delete
 * `depth` inconsistency) — do NOT "fix" them here; replicate them in the rewrite.
 */

function editLeaf(pair: HTMLElement, newText: string) {
	// enter edit mode via the pencil (first .json-view--edit in the leaf's pair)
	const editIcon = pair.querySelector('.json-view--edit') as HTMLElement
	fireEvent.click(editIcon)
	const editable = pair.querySelector('[contenteditable]') as HTMLElement
	editable.textContent = newText
	// after entering edit mode, the first .json-view--edit is the Done control
	const doneIcon = pair.querySelector('.json-view--edit') as HTMLElement
	fireEvent.click(doneIcon)
}

describe('onEdit / onChange (leaf edit)', () => {
	test('reports container depth (=1) and empty parentPath for a root-object leaf', () => {
		const onEdit = vi.fn()
		const onChange = vi.fn()
		const src = { name: 'Alice' }
		render(<JsonView src={src} editable={{ edit: true }} onEdit={onEdit} onChange={onChange} enableClipboard={false} />)

		const pair = screen.getByText('name').closest('.json-view--pair') as HTMLElement
		editLeaf(pair, '"Bob"')

		expect(onEdit).toHaveBeenCalledTimes(1)
		expect(onEdit.mock.calls[0][0]).toMatchObject({
			newValue: 'Bob',
			oldValue: 'Alice',
			depth: 1,
			indexOrName: 'name',
			parentType: 'object',
			parentPath: []
		})
		expect(onChange).toHaveBeenCalledTimes(1)
		expect(onChange.mock.calls[0][0]).toMatchObject({
			type: 'edit',
			depth: 1,
			indexOrName: 'name',
			parentType: 'object',
			parentPath: []
		})
	})

	test('nested leaf edit reports parent container depth and parentPath', () => {
		const onEdit = vi.fn()
		const src = { outer: { inner: 1 } }
		render(<JsonView src={src} editable={{ edit: true }} onEdit={onEdit} enableClipboard={false} />)

		const pair = screen.getByText('inner').closest('.json-view--pair') as HTMLElement
		editLeaf(pair, '2')

		// `outer` object node is at depth 2 (root object depth 1 -> child object depth 2)
		expect(onEdit.mock.calls[0][0]).toMatchObject({
			newValue: 2,
			oldValue: 1,
			depth: 2,
			indexOrName: 'inner',
			parentType: 'object',
			parentPath: ['outer']
		})
	})
})

describe('onDelete / onChange (leaf delete)', () => {
	test('reports leaf depth (=container+1) — the edit/delete depth quirk', () => {
		const onDelete = vi.fn()
		const onChange = vi.fn()
		const src = { name: 'Alice' }
		render(<JsonView src={src} editable={{ delete: true }} onDelete={onDelete} onChange={onChange} enableClipboard={false} />)

		const pair = screen.getByText('name').closest('.json-view--pair') as HTMLElement
		// click the leaf trash (first .json-view--edit in the pair), then confirm via Done
		fireEvent.click(pair.querySelector('.json-view--edit') as HTMLElement)
		fireEvent.click(pair.querySelector('.json-view--edit') as HTMLElement)

		expect(onDelete).toHaveBeenCalledTimes(1)
		expect(onDelete.mock.calls[0][0]).toMatchObject({
			value: 'Alice',
			depth: 2, // NOTE: edit reported depth 1 for this same leaf; delete reports 2
			indexOrName: 'name',
			parentType: 'object',
			parentPath: []
		})
		expect(onChange.mock.calls[0][0]).toMatchObject({ type: 'delete', depth: 2, indexOrName: 'name', parentType: 'object', parentPath: [] })
	})
})

describe('onAdd / onChange (add property to object)', () => {
	test('reports container depth and parentPath', () => {
		const onAdd = vi.fn()
		const onChange = vi.fn()
		const src = { a: 1 }
		render(<JsonView src={src} editable={{ add: true }} onAdd={onAdd} onChange={onChange} enableClipboard={false} />)

		// object-level add icon lives after the opening brace, not inside a pair
		const root = document.querySelector('.json-view') as HTMLElement
		const addIcon = root.querySelector('.json-view--edit') as HTMLElement
		fireEvent.click(addIcon)
		const input = root.querySelector('.json-view--input') as HTMLInputElement
		fireEvent.change(input, { target: { value: 'b' } })
		fireEvent.keyDown(input, { key: 'Enter' })

		expect(onAdd).toHaveBeenCalledTimes(1)
		expect(onAdd.mock.calls[0][0]).toMatchObject({ indexOrName: 'b', depth: 1, parentType: 'object', parentPath: [] })
		expect(onChange.mock.calls[0][0]).toMatchObject({ type: 'add', indexOrName: 'b', depth: 1, parentType: 'object', parentPath: [] })
	})
})

describe('onCollapse (fold toggle)', () => {
	// INTENTIONAL BEHAVIOR CHANGE in the virtualization rewrite (semver-major):
	// the legacy renderer fired onCollapse once per container on MOUNT and used an
	// INVERTED isCollapsing flag (collapsing reported false). Replicating the
	// mount-fire under windowing would spam the callback on every scroll, and the
	// inverted flag was a bug. The rewrite fires onCollapse only on user toggle,
	// with isCollapsing:true when the node is being collapsed.
	test('does not fire on mount; fires with isCollapsing:true on collapse click', () => {
		const onCollapse = vi.fn()
		const src = { a: 1, b: 2 }
		render(<JsonView src={src} onCollapse={onCollapse} enableClipboard={false} />)

		expect(onCollapse).not.toHaveBeenCalled()

		const chevron = document.querySelector('.jv-size-chevron') as HTMLElement
		fireEvent.click(chevron)

		expect(onCollapse).toHaveBeenCalledTimes(1)
		expect(onCollapse.mock.calls[0][0]).toMatchObject({ isCollapsing: true, depth: 1, indexOrName: undefined })
		expect(onCollapse.mock.calls[0][0].node).toBe(src)
	})

	test('fires with isCollapsing:false when expanding a folded node', () => {
		const onCollapse = vi.fn()
		render(<JsonView src={{ a: 1 }} collapsed={true} onCollapse={onCollapse} enableClipboard={false} />)
		fireEvent.click(screen.getByText('...'))
		expect(onCollapse).toHaveBeenCalledTimes(1)
		expect(onCollapse.mock.calls[0][0]).toMatchObject({ isCollapsing: false, depth: 1 })
	})
})
