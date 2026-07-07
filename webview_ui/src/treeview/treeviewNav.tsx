import RunFlowsheet from './run_flowsheet'
import css from './treeNav.module.css'
export default function TreeNavBar() {
    return (
        <nav className={css.navContainer}>
            <RunFlowsheet />
        </nav>
    )
}
