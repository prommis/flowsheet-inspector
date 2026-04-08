import { useState, useContext } from "react";
import { AppContext } from "../context";
import css from "../css/diagnostic.module.css";
import type {
    Diagnostics,
    DiagnosticComponent,
    DiagnosticStructuralIssues,
} from "../interface/flowsheet_result_interface";

// ─── Helpers ───

function formatBounds(bounds: Record<string, number>): string {
    const entries = Object.entries(bounds);
    if (entries.length === 0) return "";

    const small = bounds.small ?? bounds.zero;
    const large = bounds.large;
    if (small !== undefined && large !== undefined) {
        return `(<${small.toExponential(1)} or >${large.toExponential(1)})`;
    }
    if (bounds.tol !== undefined) {
        return `(tol=${bounds.tol.toExponential(1)})`;
    }
    return `(${entries.map(([k, v]) => `${k}=${v.toExponential(1)}`).join(", ")})`;
}

const WARNING_TAGS = new Set([
    "have residuals greater than specified tolerance",
    "have values that fall at or outside their bounds",
    "have a value of none",
    "do not appear in any activated constraints",
    "do not have any free variables",
]);

// ─── Types ───

interface SummaryItem {
    count: number;
    label: string;
    boundsStr: string;
    names: string[]; // detail names for expansion
}

// ─── Expandable SummaryLine ───

function SummaryLine({
    item,
    expanded,
    onToggle,
}: {
    item: SummaryItem;
    expanded: boolean;
    onToggle: () => void;
}) {
    const hasDetails = item.names.length > 0;

    return (
        <div className={css.summary_item}>
            <div
                className={`${css.summary_line} ${hasDetails ? css.clickable : ""}`}
                onClick={hasDetails ? onToggle : undefined}
            >
                {hasDetails && (
                    <span className={css.arrow}>
                        {expanded ? "▼" : "▶"}
                    </span>
                )}
                <span className={css.summary_count}>{item.count}</span>
                <span className={css.summary_text}>
                    {item.label} {item.boundsStr}
                </span>
            </div>
            {expanded && hasDetails && (
                <ul className={css.detail_list}>
                    {item.names.map((name, i) => (
                        <li key={i}>{name}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ─── Group with expand/collapse all ───

function DiagnosticGroup({
    title,
    badgeClass,
    items,
    emptyMessage,
}: {
    title: string;
    badgeClass: string;
    items: SummaryItem[];
    emptyMessage: string;
}) {
    const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());

    const toggleItem = (idx: number) => {
        setExpandedSet((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const expandAll = () => {
        setExpandedSet(new Set(items.map((_, i) => i)));
    };

    const collapseAll = () => {
        setExpandedSet(new Set());
    };

    return (
        <div className={css.group}>
            <div className={css.group_header}>
                <span className={css.group_title}>{title}</span>
                <span className={badgeClass}>{items.length}</span>
                {items.length > 0 && (
                    <span className={css.toggle_btns}>
                        <span className={css.toggle_btn} onClick={expandAll}>
                            Expand All
                        </span>
                        <span className={css.toggle_sep}>|</span>
                        <span className={css.toggle_btn} onClick={collapseAll}>
                            Collapse All
                        </span>
                    </span>
                )}
            </div>
            <div className={css.group_body}>
                {items.length === 0 && (
                    <div className={css.summary_line}>
                        <span className={css.summary_text}>
                            {emptyMessage}
                        </span>
                    </div>
                )}
                {items.map((item, i) => (
                    <SummaryLine
                        key={i}
                        item={item}
                        expanded={expandedSet.has(i)}
                        onToggle={() => toggleItem(i)}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Structure Issue Tab ───

function StructureIssueTab({ data }: { data: DiagnosticStructuralIssues }) {
    const { warnings, cautions } = data;

    const warningItems: SummaryItem[] = [];
    if (warnings.dof !== 0) {
        warningItems.push({
            count: warnings.dof,
            label: "Degrees of Freedom",
            boundsStr: "",
            names: [],
        });
    }
    if (warnings.inconsistent_units) {
        warningItems.push({
            count: 1,
            label: "Inconsistent units detected",
            boundsStr: "",
            names: [],
        });
    }
    if (warnings.underconstrained_set) {
        const uc = warnings.underconstrained_set;
        warningItems.push({
            count: uc.variables.length,
            label: `Underconstrained variables (${uc.constraints.length} constraints)`,
            boundsStr: "",
            names: uc.variables,
        });
    }
    if (warnings.overconstrained_set) {
        const oc = warnings.overconstrained_set;
        warningItems.push({
            count: oc.variables.length,
            label: `Overconstrained variables (${oc.constraints.length} constraints)`,
            boundsStr: "",
            names: oc.variables,
        });
    }
    if (warnings.evaluation_errors && warnings.evaluation_errors.length > 0) {
        warningItems.push({
            count: warnings.evaluation_errors.length,
            label: "evaluation errors",
            boundsStr: "",
            names: warnings.evaluation_errors,
        });
    }

    const cautionItems: SummaryItem[] = [];
    if (cautions.zero_vars && cautions.zero_vars.length > 0) {
        cautionItems.push({
            count: cautions.zero_vars.length,
            label: "variable(s) fixed to zero",
            boundsStr: "",
            names: cautions.zero_vars,
        });
    }
    if (cautions.unused_vars_free && cautions.unused_vars_free.length > 0) {
        cautionItems.push({
            count: cautions.unused_vars_free.length,
            label: "unused free variable(s)",
            boundsStr: "",
            names: cautions.unused_vars_free,
        });
    }
    if (cautions.unused_vars_fixed && cautions.unused_vars_fixed.length > 0) {
        cautionItems.push({
            count: cautions.unused_vars_fixed.length,
            label: "unused fixed variable(s)",
            boundsStr: "",
            names: cautions.unused_vars_fixed,
        });
    }

    return (
        <div>
            <DiagnosticGroup
                title="Warnings"
                badgeClass={css.badge_warning}
                items={warningItems}
                emptyMessage="No structural warnings."
            />
            <DiagnosticGroup
                title="Cautions"
                badgeClass={css.badge_caution}
                items={cautionItems}
                emptyMessage="No structural cautions."
            />
        </div>
    );
}

// ─── Numerical Issue Tab ───

function collectItems(
    components: DiagnosticComponent[],
    prefix: string
): { warnings: SummaryItem[]; cautions: SummaryItem[] } {
    const warnings: SummaryItem[] = [];
    const cautions: SummaryItem[] = [];

    for (const comp of components) {
        if (comp.empty) continue;
        const item: SummaryItem = {
            count: comp.names.length,
            label: `${prefix} ${comp.tag}`,
            boundsStr: formatBounds(comp.bounds),
            names: comp.names,
        };
        if (WARNING_TAGS.has(comp.tag)) {
            warnings.push(item);
        } else {
            cautions.push(item);
        }
    }

    return { warnings, cautions };
}

function NumericalIssueTab({ diagnostics }: { diagnostics: Diagnostics }) {
    const varItems = collectItems(diagnostics.variables.components, "Variables");
    const conItems = collectItems(diagnostics.constraints.components, "Constraints");

    const ni = diagnostics.numerical_issues.warnings;
    if (ni.constraints_with_large_residuals && !ni.constraints_with_large_residuals.empty) {
        const c = ni.constraints_with_large_residuals;
        if (!conItems.warnings.some((w) => w.label.includes("residuals"))) {
            conItems.warnings.push({
                count: c.names.length,
                label: `Constraints ${c.tag}`,
                boundsStr: formatBounds(c.bounds),
                names: c.names,
            });
        }
    }
    if (ni.constraints_with_extreme_jacobians && !ni.constraints_with_extreme_jacobians.empty) {
        const c = ni.constraints_with_extreme_jacobians;
        if (!conItems.cautions.some((w) => w.label.includes("Jacobian"))) {
            conItems.cautions.push({
                count: c.names.length,
                label: `Constraints ${c.tag}`,
                boundsStr: formatBounds(c.bounds),
                names: c.names,
            });
        }
    }
    if (ni.variables_parallel) {
        const comps = ni.variables_parallel.components.filter((c) => !c.empty);
        if (comps.length > 0) {
            // Parallel vars: each comp has 2 names, flatten them
            const pairNames = comps.map(
                (c) => `${c.names[0]}  ‖  ${c.names[1]}`
            );
            varItems.cautions.push({
                count: comps.length,
                label: "nearly parallel variable pairs",
                boundsStr: "",
                names: pairNames,
            });
        }
    }
    if (ni.constraints_parallel) {
        const comps = ni.constraints_parallel.components.filter((c) => !c.empty);
        if (comps.length > 0) {
            const pairNames = comps.map(
                (c) => `${c.names[0]}  ‖  ${c.names[1]}`
            );
            conItems.cautions.push({
                count: comps.length,
                label: "nearly parallel constraint pairs",
                boundsStr: "",
                names: pairNames,
            });
        }
    }

    const allWarnings = [...varItems.warnings, ...conItems.warnings];
    const allCautions = [...varItems.cautions, ...conItems.cautions];

    return (
        <div>
            <DiagnosticGroup
                title="Warnings"
                badgeClass={css.badge_warning}
                items={allWarnings}
                emptyMessage="No numerical warnings."
            />
            <DiagnosticGroup
                title="Cautions"
                badgeClass={css.badge_caution}
                items={allCautions}
                emptyMessage="No numerical cautions."
            />
        </div>
    );
}

// ─── Main Component ───

export default function Diagnostic() {
    const { flowsheetRunnerResult } = useContext(AppContext);
    const diagnostics = flowsheetRunnerResult?.actions
        ?.diagnostics as Diagnostics | undefined;
    const [activeTab, setActiveTab] = useState<"structure" | "numerical">(
        "structure"
    );

    if (!diagnostics) {
        return (
            <div className={css.container}>
                <h2 className={css.page_title}>Diagnostic:</h2>
                <p className={css.empty_msg}>
                    Please select a flowsheet and run it with IDAES Extension
                    first.
                </p>
            </div>
        );
    }

    return (
        <div className={css.container}>
            <h2 className={css.page_title}>Diagnostic:</h2>

            <div className={css.tabs}>
                <span
                    className={`${css.tab} ${activeTab === "structure" ? css.tab_active : ""}`}
                    onClick={() => setActiveTab("structure")}
                >
                    Structure Issue
                </span>
                <span
                    className={`${css.tab} ${activeTab === "numerical" ? css.tab_active : ""}`}
                    onClick={() => setActiveTab("numerical")}
                >
                    Numerical Issue
                </span>
            </div>

            <div className={css.tab_content}>
                {activeTab === "structure" && (
                    <StructureIssueTab data={diagnostics.structural_issues} />
                )}
                {activeTab === "numerical" && (
                    <NumericalIssueTab diagnostics={diagnostics} />
                )}
            </div>
        </div>
    );
}