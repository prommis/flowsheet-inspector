import css from '../css/stream_table.module.css'

/**
 * Stream table view for the variable page.
 *
 * Placeholder for now — rendered when the "View in Tree Layout" toggle is
 * switched off. Will be built out to show the flowsheet-level and per-unit
 * stream tables from the run result.
 *
 * @returns the stream table container element
 */
export default function StreamTable() {
    return (
        <div className={css.stream_table_container}>
            <h1>Stream Table</h1>
        </div>
    )
}
