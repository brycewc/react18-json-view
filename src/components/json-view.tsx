import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Collapsed, CustomizeCollapseStringUI, CustomizeNode, DisplaySize, Editable, NodeMeta } from '../types'
import { stringifyForCopying } from '../utils'
import { flatten } from '../core/flatten'
import { getByPath, getParentByPath, pathKey } from '../core/path'
import type { ExpandState } from '../core/expand-state'
import type { FlatRow } from '../core/row'
import { Config, ConfigContext, Handlers, HandlersContext, OnAdd, OnChange, OnCollapse, OnDelete, OnEdit } from './contexts'
import Row from './row'
import VirtualList from './virtual-list'

export const defaultURLRegExp = /^(((ht|f)tps?):\/\/)?([^!@#$%^&*?.\s-]([^!@#$%^&*?.\s]{0,63}[^!@#$%^&*?.\s])?\.)+[a-z]{2,6}\/?/

// Re-exported for backward compat (previously a single combined context).
export { ConfigContext as JsonViewContext } from './contexts'

export interface JsonViewProps {
	src: any

	collapseStringsAfterLength?: number
	collapseStringMode?: 'directly' | 'word' | 'address'
	customizeCollapseStringUI?: CustomizeCollapseStringUI

	collapseObjectsAfterLength?: number
	collapsed?: Collapsed
	onCollapse?: OnCollapse

	enableClipboard?: boolean

	editable?: Editable
	onEdit?: OnEdit
	onDelete?: OnDelete
	onAdd?: OnAdd
	onChange?: OnChange

	customizeNode?: CustomizeNode
	customizeCopy?: (node: any, nodeMeta?: NodeMeta) => any

	dark?: boolean
	theme?: 'default' | 'a11y' | 'github' | 'vscode' | 'atom' | 'winter-is-coming' | 'vitesse'

	displaySize?: DisplaySize
	displayArrayIndex?: boolean

	style?: React.CSSProperties
	className?: string

	matchesURL?: boolean
	urlRegExp?: RegExp

	ignoreLargeArray?: boolean

	// Virtualization
	virtual?: boolean | 'auto'
	rowVirtualThreshold?: number
	height?: number | string
	maxHeight?: number | string
	estimatedRowHeight?: number
	overscan?: number

	CopyComponent?: Config['CopyComponent']
	CopiedComponent?: Config['CopiedComponent']
	EditComponent?: Config['EditComponent']
	CancelComponent?: Config['CancelComponent']
	DoneComponent?: Config['DoneComponent']
	CustomOperation?: Config['CustomOperation']
}

interface UIState {
	editingKey?: string
	deletingKey?: string
	addingKey?: string
}

export default function JsonView({
	src: _src,

	collapseStringsAfterLength = 99,
	collapseStringMode = 'directly',
	customizeCollapseStringUI,

	collapseObjectsAfterLength = 99,
	collapsed,
	onCollapse,

	enableClipboard = true,

	editable = false,
	onEdit,
	onDelete,
	onAdd,
	onChange,

	dark = false,
	theme = 'default',

	customizeNode,
	customizeCopy = node => stringifyForCopying(node),

	displaySize,
	displayArrayIndex = true,

	style,
	className,

	matchesURL = false,
	urlRegExp = defaultURLRegExp,

	ignoreLargeArray = false,

	virtual = 'auto',
	rowVirtualThreshold = 100,
	height,
	maxHeight,
	estimatedRowHeight = 20,
	overscan = 8,

	CopyComponent,
	CopiedComponent,
	EditComponent,
	CancelComponent,
	DoneComponent,
	CustomOperation
}: JsonViewProps) {
	const [version, setVersion] = useState(0)
	const forceUpdate = useCallback(() => setVersion(v => v + 1), [])

	const [src, setSrc] = useState(_src)
	useEffect(() => setSrc(_src), [_src])

	const [ui, setUI] = useState<UIState>({})

	const expand = useRef<ExpandState>(new Map())
	const stringExpand = useRef<Map<string, boolean>>(new Map())

	// Mirror the legacy reset: changing collapsed / collapseObjectsAfterLength
	// discards user fold overrides so defaults recompute.
	useEffect(() => {
		expand.current.clear()
		forceUpdate()
	}, [collapsed, collapseObjectsAfterLength, forceUpdate])

	// Latest refs so handlers can stay referentially stable (Phase 6 memo win).
	const srcRef = useRef(src)
	srcRef.current = src
	const cbRef = useRef({ onEdit, onDelete, onAdd, onChange, onCollapse })
	cbRef.current = { onEdit, onDelete, onAdd, onChange, onCollapse }

	const handlers = useMemo<Handlers>(() => {
		const fireEdit = (row: FlatRow, newValue: any, oldValue: any) => {
			const depth = row.path.length
			const parentType = row.parentType
			const parentPath = row.parentPath.map(String)
			cbRef.current.onEdit?.({ newValue, oldValue, depth, src: srcRef.current, indexOrName: row.indexOrName as any, parentType, parentPath })
			cbRef.current.onChange?.({ type: 'edit', depth, src: srcRef.current, indexOrName: row.indexOrName as any, parentType, parentPath })
		}

		return {
			toggle(row) {
				const key = row.expandKey!
				const willExpand = row.kind === 'collapsed'
				expand.current.set(key, willExpand)
				cbRef.current.onCollapse?.({ isCollapsing: !willExpand, node: row.value, indexOrName: row.indexOrName, depth: row.path.length + 1 })
				forceUpdate()
			},
			toggleChunk(row) {
				const key = row.expandKey!
				expand.current.set(key, row.kind === 'chunk')
				forceUpdate()
			},
			editValue(row, newValue) {
				const oldValue = row.value
				if (row.path.length === 0) {
					setSrc(newValue)
					cbRef.current.onEdit?.({ newValue, oldValue, depth: 1, src: srcRef.current, indexOrName: row.indexOrName as any, parentType: null, parentPath: [] })
					cbRef.current.onChange?.({ type: 'edit', depth: 1, src: srcRef.current, indexOrName: row.indexOrName as any, parentType: null, parentPath: [] })
				} else {
					const parent = getParentByPath(srcRef.current, row.path)
					if (Array.isArray(parent)) parent[Number(row.indexOrName)] = newValue
					else if (parent) parent[row.indexOrName as string] = newValue
					fireEdit(row, newValue, oldValue)
				}
				setUI(s => ({ ...s, editingKey: undefined }))
				forceUpdate()
			},
			deleteRow(row) {
				const isContainer = row.kind === 'open' || row.kind === 'collapsed'
				if (row.path.length === 0) {
					setSrc(undefined)
					cbRef.current.onDelete?.({ value: srcRef.current, depth: 1, src: srcRef.current, indexOrName: row.indexOrName as any, parentType: null, parentPath: [] })
					cbRef.current.onChange?.({ type: 'delete', depth: 1, src: srcRef.current, indexOrName: row.indexOrName as any, parentType: null, parentPath: [] })
				} else {
					const parent = getParentByPath(srcRef.current, row.path)
					if (Array.isArray(parent)) parent.splice(Number(row.indexOrName), 1)
					else if (parent) delete parent[row.indexOrName as string]
					const depth = row.path.length + 1
					const parentType = isContainer ? (row.nodeType === 'array' ? 'array' : 'object') : row.parentType
					const parentPath = (isContainer ? row.path : row.parentPath).map(String)
					cbRef.current.onDelete?.({ value: row.value, depth, src: srcRef.current, indexOrName: row.indexOrName as any, parentType, parentPath })
					cbRef.current.onChange?.({ type: 'delete', depth, src: srcRef.current, indexOrName: row.indexOrName as any, parentType, parentPath })
				}
				setUI(s => ({ ...s, deletingKey: undefined }))
				forceUpdate()
			},
			addProperty(row, name) {
				const container = getByPath(srcRef.current, row.path)
				if (container && typeof container === 'object') container[name] = null
				const depth = row.path.length + 1
				const parentPath = row.path.map(String)
				cbRef.current.onAdd?.({ indexOrName: name, depth, src: srcRef.current, parentType: 'object', parentPath })
				cbRef.current.onChange?.({ type: 'add', indexOrName: name, depth, src: srcRef.current, parentType: 'object', parentPath })
				setUI(s => ({ ...s, addingKey: undefined }))
				forceUpdate()
			},
			pushArrayItem(row) {
				const arr = getByPath(srcRef.current, row.path)
				if (Array.isArray(arr)) {
					arr.push(null)
					const depth = row.path.length + 1
					const parentPath = row.path.map(String)
					cbRef.current.onAdd?.({ indexOrName: arr.length - 1, depth, src: srcRef.current, parentType: 'array', parentPath })
					cbRef.current.onChange?.({ type: 'add', indexOrName: arr.length - 1, depth, src: srcRef.current, parentType: 'array', parentPath })
				}
				forceUpdate()
			},
			startEdit(row) {
				setUI({ editingKey: pathKey(row.path) })
			},
			cancelEdit() {
				setUI(s => ({ ...s, editingKey: undefined }))
			},
			startDelete(row) {
				setUI({ deletingKey: pathKey(row.path) })
			},
			cancelDelete() {
				setUI(s => ({ ...s, deletingKey: undefined }))
			},
			startAdd(row) {
				setUI({ addingKey: row.expandKey })
			},
			cancelAdd() {
				setUI(s => ({ ...s, addingKey: undefined }))
			},
			setStringExpanded(key, expanded) {
				stringExpand.current.set(key, expanded)
				forceUpdate()
			},
			stringExpanded(key) {
				return stringExpand.current.get(key)
			}
		}
	}, [forceUpdate])

	const config = useMemo<Config>(
		() => ({
			collapseStringsAfterLength,
			collapseStringMode,
			customizeCollapseStringUI,
			enableClipboard,
			editable,
			displaySize,
			displayArrayIndex,
			matchesURL,
			urlRegExp,
			customizeCopy,
			CopyComponent,
			CopiedComponent,
			EditComponent,
			CancelComponent,
			DoneComponent,
			CustomOperation
		}),
		[
			collapseStringsAfterLength,
			collapseStringMode,
			customizeCollapseStringUI,
			enableClipboard,
			editable,
			displaySize,
			displayArrayIndex,
			matchesURL,
			urlRegExp,
			customizeCopy,
			CopyComponent,
			CopiedComponent,
			EditComponent,
			CancelComponent,
			DoneComponent,
			CustomOperation
		]
	)

	const rows = useMemo(
		() => flatten(src, { expand: expand.current, collapsed, collapseObjectsAfterLength, customizeNode, ignoreLargeArray, addingKey: ui.addingKey }),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[src, version, ui.addingKey, collapsed, collapseObjectsAfterLength, customizeNode, ignoreLargeArray]
	)

	const flagsFor = useCallback(
		(row: FlatRow) => {
			const nodeKey = pathKey(row.path)
			return {
				editing: row.kind === 'value' && ui.editingKey === nodeKey,
				deleting: (row.kind === 'value' || row.kind === 'open' || row.kind === 'collapsed') && ui.deletingKey === nodeKey,
				adding: row.kind === 'open' && ui.addingKey === nodeKey,
				stringTruncated: row.kind === 'value' && row.nodeType === 'string' ? stringExpand.current.get(nodeKey) : undefined
			}
		},
		// version is a dep so string-truncation toggles (which bump it) recompute flags
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ui.editingKey, ui.deletingKey, ui.addingKey, version]
	)

	const rootClassName = 'json-view' + (dark ? ' dark' : '') + (theme && theme !== 'default' ? ' json-view_' + theme : '') + (className ? ' ' + className : '')

	const shouldVirtual = virtual === false ? false : virtual === true ? true : rows.length > rowVirtualThreshold || height != null || maxHeight != null
	const resolvedMaxHeight = maxHeight != null ? maxHeight : shouldVirtual && height == null ? '70vh' : undefined

	return (
		<ConfigContext.Provider value={config}>
			<HandlersContext.Provider value={handlers}>
				{shouldVirtual ? (
					<VirtualList
						rows={rows}
						flagsFor={flagsFor}
						className={rootClassName}
						style={style}
						height={height}
						maxHeight={resolvedMaxHeight}
						estimatedRowHeight={estimatedRowHeight}
						overscan={overscan}
					/>
				) : (
					<code className={rootClassName} style={style}>
						{rows.map(row => {
							const flags = flagsFor(row)
							return <Row key={row.id} row={row} {...flags} />
						})}
					</code>
				)}
			</HandlersContext.Provider>
		</ConfigContext.Provider>
	)
}
