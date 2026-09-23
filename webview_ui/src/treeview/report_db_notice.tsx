import { useContext } from "react";
import { AppContext } from "../context";
import { vscode } from "../vscode";
import css from "../css/tree_app.module.css";

/**
 * Sidebar banner describing the state of the SQLite report database when it
 * does not match the installed flowsheet-inspector-lib.
 *
 * Rendered only for actionable states of the `fi-check-db-version` result:
 *   - is_db_version_low   older schema → "Upgrade FI DB" button runs
 *                         `fi-db-migration` through the extension host
 *   - incompatible_newer  DB written by a newer lib → tell the user to
 *                         upgrade the lib (migration would refuse)
 *   - invalid             file is not a usable report DB → show the reason
 * `ok`, `missing`, `uninitialized` and `unavailable` render nothing: fi-run
 * creates/initialises the DB itself, and an unavailable check (old lib) must
 * not block anything.
 *
 * After a migration attempt the lib's result (migrated with backup path and
 * row count, already current, or the refusal/error message) is shown until
 * the next check replaces it.
 */
export default function ReportDbNotice() {
    const {
        reportDbStatus,
        isMigratingDb,
        setIsMigratingDb,
        reportDbMigrationResult,
        setReportDbMigrationResult,
    } = useContext(AppContext);

    /**
     * Asks the extension host to run `fi-db-migration` for the active
     * interpreter. The host replies with `report_db_migration_result` and a
     * fresh `report_db_status`, which App.tsx writes back into context.
     */
    const handleMigrate = () => {
        if (isMigratingDb) {
            return;
        }
        setReportDbMigrationResult(null);
        setIsMigratingDb(true);
        vscode.postMessage({
            frontendInstruction: "migrate_report_db",
            fromPanel: "treeView",
        });
    };

    const status = reportDbStatus?.status;
    const needsUpdate = reportDbStatus?.is_db_version_low === true;
    const actionable = needsUpdate || status === "incompatible_newer" || status === "invalid";
    if (!actionable && !reportDbMigrationResult) {
        return null;
    }

    // "ok" only means the DB is not outdated afterwards; a newer-than-lib DB
    // also comes back ok with migrated=false, and that is not a success.
    const r = reportDbMigrationResult;
    const succeeded = !!r && r.ok && (r.migrated || r.status === "ok" || r.status === "missing");
    // Once the DB is healthy the banner only carries the success note: render
    // it in the success (green) style with a dismiss button instead of the
    // warning style that the problem states use.
    const successOnly = !actionable && succeeded;

    /**
     * Dismisses the migration outcome note ("Got it"); the banner disappears
     * entirely since no problem state is left to show.
     */
    const handleDismiss = () => {
        setReportDbMigrationResult(null);
    };

    const versionLine = reportDbStatus && (reportDbStatus.client_db_version || reportDbStatus.lib_db_version)
        ? `Database schema ${reportDbStatus.client_db_version ?? "unknown"}, library requires ${reportDbStatus.lib_db_version ?? "unknown"}.`
        : "";

    /**
     * Renders the outcome of the last migration attempt beneath the banner.
     *
     * @returns The result block, or null when no attempt has been made.
     */
    const renderMigrationResult = () => {
        if (!r) {
            return null;
        }
        if (!succeeded) {
            return (
                <div className={css.report_db_result_error}>
                    <span className={css.report_db_notice_text}>
                        Database update failed: {r.message || r.status}
                    </span>
                </div>
            );
        }
        return (
            <div className={css.report_db_result_success}>
                <span className={css.report_db_notice_text}>
                    {r.migrated
                        ? `Database updated to schema ${r.lib_db_version ?? "current"}. ${r.rows_migrated} rows migrated.`
                        : (r.message || "Database is already up to date.")}
                </span>
                {r.backup_file && (
                    <span className={css.report_db_notice_meta}>
                        Backup: <span className={css.report_db_notice_cmd}>{r.backup_file}</span>
                    </span>
                )}
                {successOnly && (
                    <button className={css.report_db_dismiss_btn} onClick={handleDismiss}>
                        Got it
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className={`${css.report_db_notice} ${successOnly ? css.report_db_notice_ok : ""}`}>
            {needsUpdate && (
                <>
                    <span className={css.report_db_notice_title}>Report database needs an update</span>
                    <span className={css.report_db_notice_text}>
                        {reportDbStatus?.message || "The report database was created by an older version of flowsheet-inspector-lib and must be migrated before running."}
                    </span>
                    {versionLine && <span className={css.report_db_notice_meta}>{versionLine}</span>}
                    <button
                        className={css.report_db_update_btn}
                        onClick={handleMigrate}
                        disabled={isMigratingDb}
                    >
                        {isMigratingDb ? "Upgrading FI DB…" : "Upgrade FI DB"}
                    </button>
                    <span className={css.report_db_notice_meta}>
                        A backup of the current database file is kept next to it.
                    </span>
                </>
            )}
            {!needsUpdate && status === "incompatible_newer" && (
                <>
                    <span className={css.report_db_notice_title}>Report database is newer than the library</span>
                    <span className={css.report_db_notice_text}>
                        {reportDbStatus?.message || "The report database was written by a newer flowsheet-inspector-lib. Upgrade the library in this Python environment."}
                    </span>
                    {versionLine && <span className={css.report_db_notice_meta}>{versionLine}</span>}
                    <span className={css.report_db_notice_cmd}>
                        pip install --upgrade "flowsheet-inspector-lib @ git+https://github.com/prommis/flowsheet-inspector-lib.git"
                    </span>
                </>
            )}
            {!needsUpdate && status === "invalid" && (
                <>
                    <span className={css.report_db_notice_title}>Report database is not usable</span>
                    <span className={css.report_db_notice_text}>
                        {reportDbStatus?.message || "The report database file is not a valid Flowsheet Inspector database."}
                    </span>
                    {reportDbStatus?.db_file && (
                        <span className={css.report_db_notice_cmd}>{reportDbStatus.db_file}</span>
                    )}
                </>
            )}
            {renderMigrationResult()}
        </div>
    );
}
