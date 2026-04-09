import React from 'react'
import RunFlowsheet from './run_flowsheet'
import css from './treeNav.module.css'
export default function TreeNavBar(
    { setShowConfig }: { setShowConfig: React.Dispatch<React.SetStateAction<boolean>> }
) {
    return (
        <nav className={css.navContainer}>
            <RunFlowsheet setShowConfig={setShowConfig} />
        </nav>
    )
}
