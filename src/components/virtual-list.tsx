import { useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import Row from './row'
import type { FlatRow } from '../core/row'

interface Props {
	rows: FlatRow[]
	flagsFor: (row: FlatRow) => { editing: boolean; deleting: boolean; adding: boolean; stringTruncated?: boolean }
	className: string
	style?: React.CSSProperties
	height?: number | string
	maxHeight?: number | string
	estimatedRowHeight: number
	overscan: number
	scrollRef?: React.RefObject<HTMLElement | null>
}

export default function VirtualList({ rows, flagsFor, className, style, height, maxHeight, estimatedRowHeight, overscan, scrollRef }: Props) {
	const rootRef = useRef<HTMLElement>(null)
	// External mode: the caller's element scrolls and this list may sit below other
	// content in it. Self mode: the root <code> below is itself the scroll element.
	const external = scrollRef != null

	// In external mode the list can start partway down the scroll container, so the
	// virtualizer needs that leading offset (scrollMargin) to map scroll position to
	// rows. Measured from layout, refreshed when the row count changes; 0 in self mode.
	const [scrollMargin, setScrollMargin] = useState(0)
	useLayoutEffect(() => {
		if (!external) {
			setScrollMargin(0)
			return
		}
		const scrollEl = scrollRef.current
		const listEl = rootRef.current
		if (!scrollEl || !listEl) return
		setScrollMargin(listEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop)
	}, [external, scrollRef, rows.length])

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => (external ? scrollRef.current : rootRef.current),
		estimateSize: () => estimatedRowHeight,
		overscan,
		scrollMargin
	})

	const items = virtualizer.getVirtualItems()

	return (
		// Root is <code> to match the non-virtualized path so the UA monospace font
		// applies identically in both modes. In self mode it owns the scroll box
		// (jv-scroll class + overflow + height/maxHeight); in external mode the
		// caller's element scrolls, so drop the scroll class and box styling and let
		// this be a plain sizer host.
		<code
			ref={rootRef as React.RefObject<HTMLElement>}
			className={external ? className : className + ' jv-scroll'}
			style={external ? style : { overflow: 'auto', height, maxHeight, ...style }}
		>
			<div className="jv-sizer" style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: 'max-content' }}>
				{/* rows */}
				{items.map(vi => {
					const row = rows[vi.index]
					const flags = flagsFor(row)
					return (
						<Row
							key={row.id}
							row={row}
							index={vi.index}
							{...flags}
							measureRef={virtualizer.measureElement}
							style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start - scrollMargin}px)` }}
						/>
					)
				})}
			</div>
		</code>
	)
}
