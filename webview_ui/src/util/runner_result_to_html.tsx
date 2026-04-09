import { useState } from 'react';

// ============================================================
// Type Definitions
// ============================================================

// Variable data: [type, indexed, values]
// type: "V" = Variable, "P" = Parameter
// indexed: boolean
// values: array of value entries
type VariableData = [string, boolean, unknown[]];

// Recursive type for nested variable structures
interface VariableNode {
    [key: string]: VariableData | VariableNode;
}

interface DOFSteps {
    [stepName: string]: {
        [componentPath: string]: number;
    };
}

interface DegreesOfFreedom {
    steps: DOFSteps;
    model: number;
}

interface Timings {
    timings: {
        [stepName: string]: number;
    };
}

interface SolverLogs {
    solver_logs: {
        [stepName: string]: string;
    };
}

interface ModelVariables {
    variables: VariableNode;
}

interface Actions {
    degrees_of_freedom?: DegreesOfFreedom;
    timings?: Timings;
    capture_solver_output?: SolverLogs;
    model_variables?: ModelVariables;
}

export interface RunnerResult {
    actions: Actions;
    last_run: string[];
    status: number;
}

// ============================================================
// Collapsible Tree Components
// ============================================================

/**
 * A collapsible tree node. Click to expand/collapse children.
 */
function TreeNode({ label, childCount, children }: {
    label: string;
    childCount?: number;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(false);

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
                <strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>{label}</strong>
                {childCount !== undefined && (
                    <span style={{ color: '#888', fontSize: '11px' }}>({childCount})</span>
                )}
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
 * Format: icon name: value1, value2, ...
 */
function VariableLeaf({ name, varData }: {
    name: string;
    varData: VariableData;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [type, indexed, values] = varData;
    const icon = type === 'P' ? '📌' : '📊';
    const typeLabel = type === 'P' ? 'Param' : 'Var';
    const typeColor = type === 'P' ? '#5b9bd5' : '#70ad47';

    const formattedValues = formatVariableValues(values);

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
                    {values.length > 1 ? (isOpen ? '▼' : '▶') : ' '}
                </span>
                <span>{icon}</span>
                <span style={{ fontFamily: 'monospace' }}>{name}</span>
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
                        = {formattedValues}
                    </span>
                )}
            </div>
            {isOpen && values.length > 0 && (
                <div style={{ paddingLeft: '30px', fontSize: '12px', color: '#ccc' }}>
                    {values.map((item, i) => (
                        <div key={i} style={{ padding: '1px 0', fontFamily: 'monospace' }}>
                            {formatSingleValue(item)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Check if a value is a variable leaf: [string, boolean, array]
 */
function isVariableData(value: unknown): value is VariableData {
    return (
        Array.isArray(value) &&
        value.length === 3 &&
        typeof value[0] === 'string' &&
        typeof value[1] === 'boolean' &&
        Array.isArray(value[2])
    );
}

/**
 * Recursively render a variable tree from nested objects.
 * Leaf nodes (variable data arrays) render as VariableLeaf.
 * Object nodes render as collapsible TreeNode.
 */
function VariableTreeRenderer({ data }: { data: Record<string, unknown> }) {
    return (
        <>
            {Object.entries(data).map(([key, value]) => {
                if (isVariableData(value)) {
                    return <VariableLeaf key={key} name={key} varData={value} />;
                }
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    const childCount = Object.keys(value).length;
                    return (
                        <TreeNode key={key} label={key} childCount={childCount}>
                            <VariableTreeRenderer data={value as Record<string, unknown>} />
                        </TreeNode>
                    );
                }
                return null;
            })}
        </>
    );
}

// ============================================================
// Value Formatting Helpers
// ============================================================

function formatSingleValue(item: unknown): string {
    if (Array.isArray(item)) {
        const key = Array.isArray(item[0]) ? item[0].join('.') : String(item[0] ?? '');
        const val = item.length > 1 ? item[1] : '';
        // For variable entries with info: [index, value, units, fixed, stale, lb, ub]
        if (item.length >= 7) {
            const units = item[2] ? `[${item[2]}]` : '';
            const fixed = item[3] ? '🔒' : '';
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
    // Show first value and count
    return `${formatSingleValue(data[0])}, ... (${data.length} values)`;
}

// ============================================================
// Steps Table (kept as table since it's comparative data)
// ============================================================

function renderStepsTable(stepsObj: Record<string, Record<string, number>>): React.ReactElement {
    const stepNames = Object.keys(stepsObj);

    const rowKeys: string[] = [];
    stepNames.forEach(stepName => {
        Object.keys(stepsObj[stepName]).forEach(rowKey => {
            if (!rowKeys.includes(rowKey)) {
                rowKeys.push(rowKey);
            }
        });
    });

    return (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '10px', fontSize: '12px' }}>
            <thead>
                <tr>
                    <th style={{ border: '1px solid #444', padding: '6px', textAlign: 'left' }}>Component</th>
                    {stepNames.map(stepName => (
                        <th key={stepName} style={{ border: '1px solid #444', padding: '6px', textAlign: 'left' }}>
                            {stepName}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rowKeys.map(rowKey => (
                    <tr key={rowKey}>
                        <td style={{ border: '1px solid #444', padding: '6px', fontFamily: 'monospace' }}>{rowKey}</td>
                        {stepNames.map(stepName => (
                            <td key={stepName} style={{ border: '1px solid #444', padding: '6px' }}>
                                {stepsObj[stepName]?.[rowKey] ?? '-'}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ============================================================
// Main Render Functions
// ============================================================

// Keys to skip rendering (render children directly)
const SKIP_KEYS = ['actions'];
const TABLE_KEYS = ['steps'];
const VARIABLES_KEYS = ['variables'];

/**
 * Recursive function to render the entire result object.
 * Variables are rendered as collapsible trees, steps as tables,
 * and everything else as key-value or recursive sections.
 */
export default function renderObject(
    obj: Record<string, unknown>,
    parentKey: string = ''
): React.ReactElement[] | null {
    if (obj === null || typeof obj !== 'object') {
        return null;
    }

    return Object.keys(obj).map((key) => {
        const value = obj[key];
        const fullKey = parentKey ? `${parentKey}.${key}` : key;

        // Skip specified keys and render their children directly
        if (SKIP_KEYS.includes(key) && typeof value === 'object' && value !== null) {
            return (
                <div key={key}>
                    {renderObject(value as Record<string, unknown>, fullKey)}
                </div>
            );
        }

        // Render as table if key is in TABLE_KEYS
        if (TABLE_KEYS.includes(key) && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return (
                <div key={key}>
                    <p><strong>{key}:</strong></p>
                    {renderStepsTable(value as Record<string, Record<string, number>>)}
                </div>
            );
        }

        // Render variables as collapsible tree
        if (VARIABLES_KEYS.includes(key) && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return (
                <div key={key}>
                    <p><strong>{key}:</strong></p>
                    <VariableTreeRenderer data={value as Record<string, unknown>} />
                </div>
            );
        }

        // Primitive values
        if (value === null || typeof value !== 'object') {
            const stringValue = String(value);
            const hasNewlines = stringValue.includes('\n');
            return (
                <div key={key}>
                    <p><strong>{key}:</strong></p>
                    <p style={hasNewlines ? { whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' } : undefined}>
                        {stringValue}
                    </p>
                </div>
            );
        } else if (Array.isArray(value)) {
            return (
                <div key={key}>
                    <p><strong>{key}:</strong> [{value.length} items]</p>
                    {value.map((item, index) => (
                        <div key={index}>
                            <p style={{ color: '#888' }}>[{index}]: {
                                typeof item === 'object' && item !== null
                                    ? JSON.stringify(item)
                                    : String(item)
                            }</p>
                        </div>
                    ))}
                </div>
            );
        } else {
            return (
                <div key={key}>
                    <p><strong>{key}:</strong></p>
                    {renderObject(value as Record<string, unknown>, fullKey)}
                </div>
            );
        }
    });
}

/**
 * Entry point: render the variables section of a RunnerResult as a collapsible tree.
 */
export function renderVariableTree(result: RunnerResult) {
    const variables = result.actions.model_variables?.variables;
    if (!variables) {
        console.error("No variables found in the result");
        return null;
    }

    return <VariableTreeRenderer data={variables} />;
}