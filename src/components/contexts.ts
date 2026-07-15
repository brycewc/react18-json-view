import { createContext } from 'react'
import type { CustomizeCollapseStringUI, DisplaySize, Editable, NodeMeta } from '../types'
import type { FlatRow } from '../core/row'

export type OnEdit = (params: {
	newValue: any
	oldValue: any
	depth: number
	src: any
	indexOrName: string | number
	parentType: 'object' | 'array' | null
	parentPath: string[]
}) => void
export type OnDelete = (params: {
	value: any
	indexOrName: string | number
	depth: number
	src: any
	parentType: 'object' | 'array' | null
	parentPath: string[]
}) => void
export type OnAdd = (params: { indexOrName: string | number; depth: number; src: any; parentType: 'object' | 'array'; parentPath: string[] }) => void
export type OnChange = (params: {
	indexOrName: string | number
	depth: number
	src: any
	parentType: 'object' | 'array' | null
	type: 'add' | 'edit' | 'delete'
	parentPath: string[]
}) => void
export type OnCollapse = (params: { isCollapsing: boolean; node: Record<string, any> | Array<any>; indexOrName: string | number | undefined; depth: number }) => void

type RenderComponent<P> = React.FC<P> | React.Component<P>

// Static-ish configuration + custom render components. Kept referentially stable
// (memoized in JsonView) so memoized rows don't re-render on volatile changes.
export interface Config {
	collapseStringsAfterLength: number
	collapseStringMode: 'directly' | 'word' | 'address'
	customizeCollapseStringUI: CustomizeCollapseStringUI | undefined

	enableClipboard: boolean
	editable: Editable

	displaySize: DisplaySize
	displayArrayIndex: boolean

	matchesURL: boolean
	urlRegExp: RegExp

	customizeCopy: (node: any, nodeMeta?: NodeMeta) => any

	CopyComponent?: RenderComponent<{ onClick: (event: React.MouseEvent) => void; className: string }>
	CopiedComponent?: RenderComponent<{ className: string; style: React.CSSProperties }>
	EditComponent?: RenderComponent<{ onClick: (event: React.MouseEvent) => void; className: string }>
	CancelComponent?: RenderComponent<{ onClick: (event: React.MouseEvent) => void; className: string; style: React.CSSProperties }>
	DoneComponent?: RenderComponent<{ onClick: (event: React.MouseEvent) => void; className: string; style: React.CSSProperties }>
	CustomOperation?: React.FC<{ node: any }> | React.Component<{ node: any }>
}

// Volatile: mutators + expand/edit/add/string state. Rows read the flags they
// need as props (see Row) so this context changing does not re-render every row.
export interface Handlers {
	toggle: (row: FlatRow) => void
	toggleChunk: (row: FlatRow) => void

	editValue: (row: FlatRow, newValue: any) => void
	deleteRow: (row: FlatRow) => void
	addProperty: (row: FlatRow, name: string) => void
	pushArrayItem: (row: FlatRow) => void

	startEdit: (row: FlatRow) => void
	cancelEdit: () => void

	startDelete: (row: FlatRow) => void
	cancelDelete: () => void

	startAdd: (row: FlatRow) => void
	cancelAdd: () => void

	setStringExpanded: (key: string, expanded: boolean) => void
	stringExpanded: (key: string) => boolean | undefined
}

export const defaultConfig: Config = {
	collapseStringsAfterLength: 99,
	collapseStringMode: 'directly',
	customizeCollapseStringUI: undefined,
	enableClipboard: true,
	editable: false,
	displaySize: undefined,
	displayArrayIndex: true,
	matchesURL: false,
	urlRegExp: /^$/,
	customizeCopy: () => {}
}

export const ConfigContext = createContext<Config>(defaultConfig)

export const HandlersContext = createContext<Handlers>({} as Handlers)
