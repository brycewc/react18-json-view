import { useRef } from 'react'
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
}

export default function VirtualList({ rows, flagsFor, className, style, height, maxHeight, estimatedRowHeight, overscan }: Props) {
	const parentRef = useRef<HTMLElement>(null)
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => estimatedRowHeight,
		overscan
	})

	const items = virtualizer.getVirtualItems()

	return (
		// Root is <code> to match the non-virtualized path so the UA monospace font
		// applies identically in both modes.
		<code ref={parentRef as React.RefObject<HTMLElement>} className={className + ' jv-scroll'} style={{ overflow: 'auto', height, maxHeight, ...style }}>
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
							style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
						/>
					)
				})}
			</div>
		</code>
	)
}
