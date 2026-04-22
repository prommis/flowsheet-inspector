import { useState, useMemo } from 'react';

// ============================================================
// Type Definitions
// ============================================================
import type { VariableNode, DOFSteps } from "../interface/flowsheet_result_interface";

// Variable data: [type, indexed, values]
// type: "V" = Variable, "P" = Parameter
type VariableData = [string, boolean, unknown[]];

// DOF data passed through the tree
interface DofInfo {
    steps: DOFSteps;       // { build: { "fs.M101": 20, ... }, ... }
    lastStepName: string;  // e.g. "solve_optimization"
}

// ============================================================
// Collapsible Tree Components
// ============================================================

function TreeNode({ label, childCount, labelColor, defaultOpen, extra, children }: {
    label: string;
    childCount?: number;
    labelColor?: string;
    defaultOpen?: boolean;
    extra?: React.ReactNode;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

    return (
        <div style={{ paddingLeft: '12px' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    cursor: 'pointer',
                    padding: '3px 0',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}
            >
                <span style={{ fontSize: '10px', width: '12px', display: 'inline-block' }}>
                    {isOpen ? '▼' : '▶'}
                </span>
                <strong style={{ fontFamily: 'monospace', fontSize: '13px', color: labelColor }}>
                    {label}
                </strong>
                {childCount !== undefined && (
                    <span style={{ color: '#888', fontSize: '11px' }}>({childCount})</span>
                )}
                {extra}
            </div>
            {isOpen && (
                <div style={{ borderLeft: '1px solid #333', marginLeft: '5px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

/**
 * A leaf node displaying a single variable's data.
 */
function VariableLeaf({ name, varData, defaultOpen, highlight }: {
    name: string;
    varData: VariableData;
    defaultOpen?: boolean;
    highlight?: string;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen ?? false);
    const [type, indexed, values] = varData;
    const typeLabel = type === 'P' ? 'Param' : 'Var';
    const typeColor = type === 'P' ? '#5b9bd5' : '#70ad47';

    const renderName = (text: string) => {
        if (!highlight) return <span style={{ fontFamily: 'monospace' }}>{text}</span>;
        const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
        if (idx === -1) return <span style={{ fontFamily: 'monospace' }}>{text}</span>;
        return (
            <span style={{ fontFamily: 'monospace' }}>
                {text.slice(0, idx)}
                <mark style={{ background: '#e6a817', color: '#000', borderRadius: '2px', padding: '0 1px' }}>
                    {text.slice(idx, idx + highlight.length)}
                </mark>
                {text.slice(idx + highlight.length)}
            </span>
        );
    };

    const nameMatches = highlight ? name.toLowerCase().includes(highlight.toLowerCase()) : false;
    const filteredValues = (highlight && !nameMatches)
        ? values.filter((item) => formatSingleValue(item).toLowerCase().includes(highlight.toLowerCase()))
        : values;

    return (
        <div style={{ paddingLeft: '12px' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    cursor: 'pointer',
                    padding: '2px 0',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                }}
            >
                <span style={{ fontSize: '10px', width: '12px', display: 'inline-block' }}>
                    {filteredValues.length > 1 ? (isOpen ? '▼' : '▶') : ' '}
                </span>

                {renderName(name)}
                <span style={{ color: typeColor, fontWeight: 'bold', fontSize: '11px' }}>
                    [{typeLabel}]
                </span>
                {indexed && <span style={{ color: '#888', fontSize: '11px' }}>indexed</span>}
                {!isOpen && (
                    <span style={{
                        color: '#aaa',
                        fontSize: '11px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '400px',
                    }}>
                        = {formatVariableValues(filteredValues)}
                    </span>
                )}
            </div>
            {isOpen && filteredValues.length > 0 && (
                <div style={{ paddingLeft: '30px', fontSize: '12px', color: '#ccc' }}>
                    {filteredValues.map((item, i) => (
                        <div key={i} style={{ padding: '1px 0', fontFamily: 'monospace' }}>
                            {formatSingleValue(item)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================
// Value Formatting Helpers
// ============================================================

function isVariableData(value: unknown): value is VariableData {
    return (
        Array.isArray(value) &&
        value.length === 3 &&
        typeof value[0] === 'string' &&
        typeof value[1] === 'boolean' &&
        Array.isArray(value[2])
    );
}

function formatSingleValue(item: unknown): string {
    if (Array.isArray(item)) {
        const key = Array.isArray(item[0]) ? item[0].join('.') : String(item[0] ?? '');
        const val = item.length > 1 ? item[1] : '';
        // For variable entries with info: [index, value, units, fixed, stale, lb, ub]
        if (item.length >= 7) {
            const units = item[2] ? `[${item[2]}]` : '';
            const fixed = item[3] ? 'fixed' : '';
            const lb = item[5] !== null ? `lb:${item[5]}` : '';
            const ub = item[6] !== null ? `ub:${item[6]}` : '';
            const bounds = [lb, ub].filter(Boolean).join(' ');
            return `${key || 'value'}: ${val} ${units} ${fixed} ${bounds}`.replace(/\s+/g, ' ').trim();
        }
        return key ? `${key}: ${val}` : String(val);
    }
    return String(item);
}

function formatVariableValues(data: unknown[]): string {
    if (!Array.isArray(data) || data.length === 0) return '-';
    if (data.length === 1) return formatSingleValue(data[0]);
    return `${formatSingleValue(data[0])}, ... (${data.length} values)`;
}

// ============================================================
// Search / Filter Helpers
// ============================================================

const SKIP_KEYS = new Set(["thermo_params", "reaction_params"]);

function leafMatchesSearch(key: string, varData: VariableData, term: string): boolean {
    if (key.toLowerCase().includes(term)) return true;
    const [, , values] = varData;
    for (const item of values) {
        if (formatSingleValue(item).toLowerCase().includes(term)) return true;
    }
    return false;
}

function nodeMatchesSearch(data: VariableNode, term: string): boolean {
    for (const [key, value] of Object.entries(data)) {
        if (SKIP_KEYS.has(key)) continue;
        if (isVariableData(value)) {
            if (leafMatchesSearch(key, value, term)) return true;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            if (key.toLowerCase().includes(term)) return true;
            if (nodeMatchesSearch(value as VariableNode, term)) return true;
        }
    }
    return false;
}

// ============================================================
// DOF Section Component
// ============================================================

/** Renders per-unit DOF breakdown across all steps */
// function DofSection({ dofInfo, pathPrefix, defaultOpen }: {
//     dofInfo: DofInfo;
//     pathPrefix: string;
//     defaultOpen: boolean;
// }) {
//     const stepEntries = Object.entries(dofInfo.steps);
//     if (stepEntries.length === 0) return null;

//     return (
//         <TreeNode label="DOF" defaultOpen={defaultOpen}>
//             {stepEntries.map(([stepName, components]) => {
//                 const selfDof = components[pathPrefix];
//                 if (selfDof === undefined) return null;

//                 return (
//                     <div key={stepName} style={{ paddingLeft: '24px', fontSize: '12px', padding: '2px 24px' }}>
//                         <span style={{ fontFamily: 'monospace', color: '#888' }}>
//                             {stepName}  DOF: {selfDof}
//                         </span>
//                     </div>
//                 );
//             })}
//         </TreeNode>
//     );
// }

// ============================================================
// Recursive Tree Content (internal)
// ============================================================

function TreeContent({ data, searchTerm, defaultOpen, dofInfo, pathPrefix }: {
    data: VariableNode;
    searchTerm: string;
    defaultOpen: boolean;
    dofInfo?: DofInfo;
    pathPrefix: string;
}) {
    const entries = Object.entries(data).filter(([key]) => !SKIP_KEYS.has(key));

    // Partition into: leaf vars, leaf params, sub-nodes
    let vars: [string, VariableData][] = [];
    let params: [string, VariableData][] = [];
    let subNodes: [string, VariableNode][] = [];

    for (const [key, value] of entries) {
        if (isVariableData(value)) {
            if (value[0] === 'P') {
                params.push([key, value]);
            } else {
                vars.push([key, value]);
            }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            subNodes.push([key, value as VariableNode]);
        }
    }

    // Apply search filter
    if (searchTerm) {
        vars = vars.filter(([key, vd]) => leafMatchesSearch(key, vd, searchTerm));
        params = params.filter(([key, vd]) => leafMatchesSearch(key, vd, searchTerm));
        subNodes = subNodes.filter(
            ([key, node]) =>
                key.toLowerCase().includes(searchTerm) ||
                nodeMatchesSearch(node, searchTerm)
        );
    }

    // Check if this node has DOF data (show DOF section for sub-nodes that have it)
    // const hasDofSection = dofInfo && pathPrefix && !searchTerm;

    return (
        <>
            {/* Var group */}
            {vars.length > 0 && (
                <TreeNode label="Var" childCount={vars.length} labelColor="#70ad47" defaultOpen={defaultOpen}>
                    {vars.map(([key, varData]) => (
                        <VariableLeaf
                            key={key}
                            name={key}
                            varData={varData}
                            defaultOpen={defaultOpen}
                            highlight={searchTerm}
                        />
                    ))}
                </TreeNode>
            )}

            {/* Param group */}
            {params.length > 0 && (
                <TreeNode label="Param" childCount={params.length} labelColor="#5b9bd5" defaultOpen={defaultOpen}>
                    {params.map(([key, varData]) => (
                        <VariableLeaf
                            key={key}
                            name={key}
                            varData={varData}
                            defaultOpen={defaultOpen}
                            highlight={searchTerm}
                        />
                    ))}
                </TreeNode>
            )}

            {/* Temporarily cancel unit-level DOF details */}
            {/* 
            {hasDofSection && pathPrefix.includes('.') && (
                <DofSection dofInfo={dofInfo} pathPrefix={pathPrefix} defaultOpen={defaultOpen} />
            )}
            */}

            {/* Sub-nodes */}
            {subNodes.map(([key, node]) => {
                const childCount = Object.keys(node).length;
                const keyMatches = searchTerm && key.toLowerCase().includes(searchTerm);
                const childSearch = keyMatches ? '' : searchTerm;
                const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;

                // Get solver DOF for badge display
                let solverDof: number | undefined;
                if (dofInfo) {
                    const lastStep = dofInfo.steps[dofInfo.lastStepName];
                    if (lastStep) {
                        solverDof = lastStep[childPath];
                    }
                }

                // Show DOF badge only at top-level 'fs'
                const dofBadge = (solverDof !== undefined && childPath === 'fs') ? (
                    <span style={{
                        fontSize: '11px',
                        color: '#888',
                        marginLeft: '2px',
                    }}>
                        , DoF({solverDof})
                    </span>
                ) : undefined;

                return (
                    <TreeNode
                        key={key}
                        label={key}
                        childCount={childCount}
                        defaultOpen={defaultOpen}
                        extra={dofBadge}
                    >
                        <TreeContent
                            data={node}
                            searchTerm={childSearch}
                            defaultOpen={defaultOpen}
                            dofInfo={dofInfo}
                            pathPrefix={childPath}
                        />
                    </TreeNode>
                );
            })}
        </>
    );
}

// ============================================================
// Main Export: Variable Tree Renderer (with search + expand all)
// ============================================================

export default function RenderVariableTree({ data, dofSteps }: {
    data: VariableNode;
    dofSteps?: DOFSteps;
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [allExpanded, setAllExpanded] = useState(false);
    const [treeKey, setTreeKey] = useState(0);

    const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);

    const handleToggleExpand = () => {
        setAllExpanded((prev) => !prev);
        setTreeKey((k) => k + 1);
    };

    // Build DofInfo from steps
    const dofInfo = useMemo<DofInfo | undefined>(() => {
        if (!dofSteps) return undefined;
        const stepNames = Object.keys(dofSteps);
        if (stepNames.length === 0) return undefined;
        return {
            steps: dofSteps,
            lastStepName: stepNames[stepNames.length - 1],
        };
    }, [dofSteps]);

    const effectiveExpand = normalizedSearch ? true : allExpanded;
    const effectiveKey = normalizedSearch ? `search-${normalizedSearch}` : `toggle-${treeKey}`;

    return (
        <div>
            {/* Toolbar: Search + Expand All */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '12px',
                padding: '8px 0',
            }}>
                <input
                    type="text"
                    placeholder="Search variables..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: '13px',
                        border: '1px solid var(--vscode-panel-border, #555)',
                        borderRadius: '4px',
                        background: 'var(--vscode-input-background, #1e1e1e)',
                        color: 'var(--vscode-input-foreground, #ccc)',
                        outline: 'none',
                        fontFamily: 'var(--vscode-font-family, sans-serif)',
                    }}
                />
                <span
                    onClick={handleToggleExpand}
                    style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        padding: '5px 14px',
                        fontSize: '12px',
                        border: '1px solid var(--vscode-panel-border, #555)',
                        borderRadius: '4px',
                        color: 'var(--vscode-foreground, #ccc)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {allExpanded && !normalizedSearch ? 'Collapse All ▲' : 'Expand All ▼'}
                </span>
            </div>

            {/* Tree */}
            <div key={effectiveKey}>
                <TreeContent
                    data={data}
                    searchTerm={normalizedSearch}
                    defaultOpen={effectiveExpand}
                    dofInfo={dofInfo}
                    pathPrefix=""
                />
            </div>

            {/* No results message */}
            {normalizedSearch && (
                <NoResultsCheck data={data} searchTerm={normalizedSearch} />
            )}
        </div>
    );
}

function NoResultsCheck({ data, searchTerm }: { data: VariableNode; searchTerm: string }) {
    const hasResults = useMemo(() => nodeMatchesSearch(data, searchTerm), [data, searchTerm]);
    if (hasResults) return null;
    return (
        <p style={{ color: '#888', fontStyle: 'italic', paddingLeft: '12px', fontSize: '13px' }}>
            No variables or parameters matching "{searchTerm}"
        </p>
    );
}
