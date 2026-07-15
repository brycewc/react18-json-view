import '@testing-library/jest-dom/vitest'

// jsdom lacks ResizeObserver (required by @tanstack/react-virtual) and
// Element.prototype.scrollTo / scrollToIndex targets. Polyfill both so
// virtualized components can mount in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
	Element.prototype.scrollTo = function () {} as unknown as typeof Element.prototype.scrollTo
}

// json-node's edit() schedules a focus/selection in a setTimeout. If the edit
// is committed synchronously in a test, the contentEditable unmounts and the
// timer fires with a null node, which jsdom's selectAllChildren rejects. Make
// it a safe no-op for tests.
if (typeof Selection !== 'undefined') {
	Selection.prototype.selectAllChildren = function () {}
}

// jsdom does not implement `innerText` (returns undefined). The component's
// in-place edit commit reads `valueRef.current.innerText`, so alias it to
// `textContent` for tests. Layout-aware differences between the two don't
// matter here — edited values are single-line text.
if (typeof HTMLElement !== 'undefined' && !Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText')) {
	Object.defineProperty(HTMLElement.prototype, 'innerText', {
		configurable: true,
		get() {
			return this.textContent
		},
		set(value: string) {
			this.textContent = value
		}
	})
}
