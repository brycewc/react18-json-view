import React, { useContext, useEffect, useMemo, useRef } from 'react'
import { ConfigContext, HandlersContext } from './contexts'
import type { FlatRow } from '../core/row'
import { pathKey } from '../core/path'
import LongString from './long-string'
import CopyButton from './copy-button'
import { ReactComponent as AngleDownSVG } from '../svgs/angle-down.svg'
import { ReactComponent as EditSVG } from '../svgs/edit.svg'
import { ReactComponent as DeleteSVG } from '../svgs/trash.svg'
import { ReactComponent as AddSVG } from '../svgs/add-square.svg'
import { ReactComponent as DoneSVG } from '../svgs/done.svg'
import { ReactComponent as CancelSVG } from '../svgs/cancel.svg'
import { ReactComponent as LinkSVG } from '../svgs/link.svg'
import {
	editableEdit,
	editableDelete,
	editableAdd,
	customEdit,
	customDelete,
	customAdd,
	customCopy,
	customMatchesURL,
	ifDisplay,
	resolveEvalFailedNewValue
} from '../utils'
import type { CustomizeOptions } from '../types'

export interface RowProps {
	row: FlatRow
	editing: boolean
	deleting: boolean
	adding: boolean
	/** central long-string truncation state (undefined = use LongString default) */
	stringTruncated?: boolean
	index?: number
	style?: React.CSSProperties
	measureRef?: (el: HTMLElement | null) => void
}

function Done({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
	const { DoneComponent } = useContext(ConfigContext)
	const style = { display: 'inline-block' } as React.CSSProperties
	return typeof DoneComponent === 'function' ? (
		<DoneComponent className="json-view--edit" style={style} onClick={onClick} />
	) : (
		<DoneSVG className="json-view--edit" style={style} onClick={onClick} />
	)
}
function Cancel({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
	const { CancelComponent } = useContext(ConfigContext)
	const style = { display: 'inline-block' } as React.CSSProperties
	return typeof CancelComponent === 'function' ? (
		<CancelComponent className="json-view--edit" style={style} onClick={onClick} />
	) : (
		<CancelSVG className="json-view--edit" style={style} onClick={onClick} />
	)
}

function Row({ row, editing, deleting, adding, stringTruncated, index, style, measureRef }: RowProps) {
	const config = useContext(ConfigContext)
	const handlers = useContext(HandlersContext)
	const { displaySize, displayArrayIndex, CustomOperation } = config
	const customOptions = row.customOptions

	// hoverable rows keep the legacy .json-view--pair class so consumer hover CSS
	// (icons revealed on pair:hover) keeps working; icons stay direct children.
	const isPair = row.kind === 'value' || row.kind === 'open' || row.kind === 'collapsed' || row.kind === 'chunk' || row.kind === 'chunk-open' || row.kind === 'custom'
	const wrap = (children: React.ReactNode) => (
		<div
			className={isPair ? 'json-view--pair jv-row' : 'jv-row'}
			data-index={index}
			ref={measureRef as any}
			style={{ ...style, paddingLeft: `${row.depth - 1}em` }}>
			{children}
		</div>
	)

	const keyLabel =
		row.path.length === 0 || (row.parentType === 'array' && !displayArrayIndex) ? null : (
			<>
				<span className={typeof row.indexOrName === 'number' ? 'json-view--index' : 'json-view--property'}>{row.indexOrName}</span>:{' '}
			</>
		)

	switch (row.kind) {
		case 'value':
			return wrap(
				<>
					{keyLabel}
					<ValueLeaf row={row} editing={editing} deleting={deleting} stringTruncated={stringTruncated} />
				</>
			)
		case 'open':
			return wrap(
				<>
					{keyLabel}
					<span>{row.bracket}</span>
					<ContainerIcons row={row} deleting={deleting} adding={adding} folded={false} />
				</>
			)
		case 'collapsed':
			return wrap(
				<>
					{keyLabel}
					<span>{row.bracket}</span>
					{typeof CustomOperation === 'function' ? <CustomOperation node={row.value} /> : null}
					<button onClick={() => handlers.toggle(row)} className="jv-button">
						...
					</button>
					<span>{row.bracket === '{' ? '}' : ']'}</span>
					{ifDisplay(displaySize, row.depth, true) && (
						<span onClick={() => handlers.toggle(row)} className="jv-size">
							{row.size} Items
						</span>
					)}
				</>
			)
		case 'close':
			return wrap(<span>{row.bracket}</span>)
		case 'chunk':
			return wrap(
				<>
					<span>{'['}</span>
					{typeof CustomOperation === 'function' ? <CustomOperation node={row.value} /> : null}
					<button onClick={() => handlers.toggleChunk(row)} className="jv-button">
						{row.chunk!.start} ... {row.chunk!.end}
					</button>
					<span>{']'}</span>
				</>
			)
		case 'chunk-open':
			return wrap(
				<>
					<span>{'['}</span>
					<span onClick={() => handlers.toggleChunk(row)} className="jv-size-chevron">
						{ifDisplay(displaySize, row.depth, false) && <span className="jv-size">{(row.value as any[]).length} Items</span>}
						<AngleDownSVG className="jv-chevron" />
					</span>
					{config.enableClipboard && customCopy(customOptions) && (
						<CopyButton node={row.value} nodeMeta={{ depth: row.depth, indexOrName: row.chunk!.index, parentPath: row.parentPath.map(String), currentPath: row.path.map(String) }} />
					)}
					{typeof CustomOperation === 'function' ? <CustomOperation node={row.value} /> : null}
				</>
			)
		case 'chunk-close':
			return wrap(<span>{']'}</span>)
		case 'add-input':
			return wrap(<AddInput row={row} />)
		case 'custom': {
			const Custom = row.customRender as any
			const content = React.isValidElement(Custom) ? Custom : <Custom node={row.value} depth={row.depth} indexOrName={row.indexOrName} />
			return wrap(
				<>
					{keyLabel}
					{content}
				</>
			)
		}
		default:
			return null
	}
}

// flatten() produces fresh FlatRow objects on every recompute, so a default
// shallow compare would re-render every mounted row. Compare the fields that
// actually affect output (incl. the virtual row's translateY) so unchanged rows
// skip re-render — this is what keeps large / scrolling lists cheap.
function areEqual(a: RowProps, b: RowProps): boolean {
	if (a.editing !== b.editing || a.deleting !== b.deleting || a.adding !== b.adding || a.index !== b.index) return false
	if (a.stringTruncated !== b.stringTruncated) return false
	if (a.style?.transform !== b.style?.transform) return false
	const r1 = a.row
	const r2 = b.row
	return (
		r1.id === r2.id &&
		r1.kind === r2.kind &&
		r1.value === r2.value &&
		r1.depth === r2.depth &&
		r1.size === r2.size &&
		r1.indexOrName === r2.indexOrName &&
		r1.bracket === r2.bracket &&
		r1.customOptions === r2.customOptions &&
		r1.customRender === r2.customRender &&
		r1.chunk?.index === r2.chunk?.index &&
		r1.chunk?.start === r2.chunk?.start &&
		r1.chunk?.end === r2.chunk?.end
	)
}

export default React.memo(Row, areEqual)

function ValueLeaf({ row, editing, deleting, stringTruncated }: { row: FlatRow; editing: boolean; deleting: boolean; stringTruncated?: boolean }) {
	const config = useContext(ConfigContext)
	const handlers = useContext(HandlersContext)
	const { editable, enableClipboard, matchesURL, urlRegExp, EditComponent, CustomOperation } = config
	const customOptions = row.customOptions as CustomizeOptions | undefined
	const type = row.nodeType
	const node = row.value
	const valueRef = useRef<HTMLSpanElement>(null)
	const key = pathKey(row.path)

	let className = 'json-view--string'
	switch (type) {
		case 'number':
		case 'bigint':
			className = 'json-view--number'
			break
		case 'boolean':
			className = 'json-view--boolean'
			break
		case 'null':
			className = 'json-view--null'
			break
	}
	if (typeof customOptions?.className === 'string') className += ' ' + customOptions.className
	if (deleting) className += ' json-view--deleting'

	let displayValue = String(node)
	if (type === 'bigint') displayValue += 'n'

	const commit = () => {
		const text = valueRef.current?.innerText ?? ''
		try {
			handlers.editValue(row, JSON.parse(text))
		} catch {
			handlers.editValue(row, resolveEvalFailedNewValue(type, text))
		}
	}
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === 'Enter') {
			event.preventDefault()
			commit()
		} else if (event.key === 'Escape') {
			handlers.cancelEdit()
		}
	}

	useEffect(() => {
		if (editing && valueRef.current) {
			const el = valueRef.current
			setTimeout(() => {
				window.getSelection()?.selectAllChildren(el)
				el.focus()
			})
		}
	}, [editing])

	const canEdit = editableEdit(editable) && customEdit(customOptions)
	const ctrlClick =
		!editing && !deleting && canEdit
			? (event: React.MouseEvent) => {
					if (event.ctrlKey || event.metaKey) handlers.startEdit(row)
			  }
			: undefined

	const EditingElement = useMemo(
		() => (
			<span
				contentEditable
				className={className}
				dangerouslySetInnerHTML={{ __html: type === 'string' ? `"${displayValue}"` : displayValue }}
				ref={valueRef}
				onKeyDown={handleKeyDown}
			/>
		),
		[displayValue, type, className]
	)

	const isEditing = editing || deleting
	const icons = (
		<>
			{isEditing && <Done onClick={deleting ? () => handlers.deleteRow(row) : commit} />}
			{isEditing && <Cancel onClick={deleting ? () => handlers.cancelDelete() : () => handlers.cancelEdit()} />}

			{!isEditing && enableClipboard && customCopy(customOptions) && (
				<CopyButton node={node} nodeMeta={{ depth: row.depth, indexOrName: row.indexOrName, parentPath: row.parentPath.map(String), currentPath: row.path.map(String) }} />
			)}
			{!isEditing && matchesURL && type === 'string' && urlRegExp.test(node) && customMatchesURL(customOptions) && (
				<a href={node} target="_blank" className="json-view--link" rel="noreferrer">
					<LinkSVG />
				</a>
			)}
			{!isEditing &&
				canEdit &&
				(typeof EditComponent === 'function' ? (
					<EditComponent className="json-view--edit" onClick={() => handlers.startEdit(row)} />
				) : (
					<EditSVG className="json-view--edit" onClick={() => handlers.startEdit(row)} />
				))}
			{!isEditing && editableDelete(editable) && customDelete(customOptions) && <DeleteSVG className="json-view--edit" onClick={() => handlers.startDelete(row)} />}
			{typeof CustomOperation === 'function' ? <CustomOperation node={node} /> : null}
		</>
	)

	if (type === 'string') {
		return (
			<>
				{editing ? (
					EditingElement
				) : (
					<LongString
						str={node}
						ref={valueRef}
						className={className}
						ctrlClick={ctrlClick}
						truncated={stringTruncated}
						onToggleTruncated={next => handlers.setStringExpanded(key, next)}
					/>
				)}
				{icons}
			</>
		)
	}
	return (
		<>
			{editing ? (
				EditingElement
			) : (
				<span className={className} onClick={ctrlClick}>
					{displayValue}
				</span>
			)}
			{icons}
		</>
	)
}

function ContainerIcons({ row, deleting, adding, folded }: { row: FlatRow; deleting: boolean; adding: boolean; folded: boolean }) {
	const config = useContext(ConfigContext)
	const handlers = useContext(HandlersContext)
	const { editable, enableClipboard, displaySize, CustomOperation } = config
	const customOptions = row.customOptions
	const isEditing = deleting || adding
	const isArr = row.nodeType === 'array'

	return (
		<>
			{!isEditing && (
				<span onClick={() => handlers.toggle(row)} className="jv-size-chevron">
					{ifDisplay(displaySize, row.depth, folded) && <span className="jv-size">{row.size} Items</span>}
					<AngleDownSVG className="jv-chevron" />
				</span>
			)}

			{deleting && <Done onClick={() => handlers.deleteRow(row)} />}
			{deleting && <Cancel onClick={() => handlers.cancelDelete()} />}

			{!isEditing && enableClipboard && customCopy(customOptions) && (
				<CopyButton node={row.value} nodeMeta={{ depth: row.depth, indexOrName: row.indexOrName, parentPath: row.parentPath.map(String), currentPath: row.path.map(String) }} />
			)}
			{!isEditing && editableAdd(editable) && customAdd(customOptions) && (
				<AddSVG className="json-view--edit" onClick={() => (isArr ? handlers.pushArrayItem(row) : handlers.startAdd(row))} />
			)}
			{!isEditing && editableDelete(editable) && customDelete(customOptions) && <DeleteSVG className="json-view--edit" onClick={() => handlers.startDelete(row)} />}
			{typeof CustomOperation === 'function' ? <CustomOperation node={row.value} /> : null}
		</>
	)
}

function AddInput({ row }: { row: FlatRow }) {
	const handlers = useContext(HandlersContext)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	const submit = () => {
		const name = inputRef.current?.value
		if (name) handlers.addProperty(row, name)
	}
	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === 'Enter') {
			event.preventDefault()
			submit()
		} else if (event.key === 'Escape') {
			handlers.cancelAdd()
		}
	}

	return (
		<>
			<input className="json-view--input" placeholder="property" ref={inputRef} onKeyDown={onKeyDown} />
			<Done onClick={submit} />
			<Cancel onClick={() => handlers.cancelAdd()} />
		</>
	)
}
