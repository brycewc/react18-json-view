import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Stub `*.svg` imports so the `import { ReactComponent as X } from '../svgs/x.svg'`
// convention resolves in tests without pulling in vite-plugin-svgr (which has a
// conflicting vite peer range). Tests don't care about the SVG content — a
// forwardRef <svg> that passes props/ref through is enough.
function svgStub(): Plugin {
	return {
		name: 'svg-stub',
		enforce: 'pre',
		load(id) {
			if (id.endsWith('.svg')) {
				return [
					"import * as React from 'react'",
					'const Svg = React.forwardRef((props, ref) => React.createElement("svg", Object.assign({}, props, { ref })))',
					'export default Svg',
					'export const ReactComponent = Svg'
				].join('\n')
			}
			return null
		}
	}
}

export default defineConfig({
	plugins: [svgStub(), react()],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./src/test/setup.ts'],
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		css: false
	}
})
