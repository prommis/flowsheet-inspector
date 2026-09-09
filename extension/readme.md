# Flowsheet Inspector

[Provide feedback, request features, and report bugs.](https://github.com/prommis/flowsheet-inspector/issues)

<h2 id='requirement'>About</h2>

Flowsheet Inspector is an all-in-one VS Code extension that helps you run and inspect [IDAES](https://idaes.org/), [PrOMMiS](https://netl.doe.gov/prommis), and [WaterTAP](https://www.nawihub.org/knowledge/watertap/) chemical process flowsheets without leaving the editor.

<h2 id='requirement'>Requirements</h2>

This extension require another python cli tool called `flowsheet-inspector-lib` to run.

[Source code on Github](https://github.com/prommis/flowsheet-inspector-lib)  

To install, make sure you have python 3.12+ installed and run:
```bash
pip install git+https://github.com/prommis/flowsheet-inspector-lib.git
```

## Features

- Before a run:
    - [Select one or more steps to run only part of a flowsheet.](#steps)
    - [Load and review the run history of a flowsheet.](#history)
    - [Select the Python interpreter used to run your flowsheet.](#interpreter)
- While editing:
    - [Insert a flowsheet template with a snippet.](#snippet)
- After a run:
    - [Review the resulting flowsheet diagram.](#diagram)
    - [Review the stream table and the variables used in the flowsheet.](#stream_variable)
    - [Review the Diagnostics Toolbox results.](#diagnostic)
    - [Review the IPOPT solver output.](#ipopt)
    - [Review the flowsheet run logs.](#log)

## Before a run

1. <h3 id='steps'>Select one or more steps to run only part of a flowsheet</h3>

    The step selector is a draggable vertical selector bar, which allows you to select which steps you would like to run.  

    - *Steps are defined in your flowsheet with the Python decorator `@FS.substep(base:str, name:str)`.*  
    - *If no step is selected, clicking Run will run all steps by default.*

    <img src='./resources/doc_image/selected_steps.png' width="400px">

1. <h3 id='history'>Load and review the run history of a flowsheet</h3>

    - There are two tabs at the very top of the control panel. To see all run histories, click on the History tab.
    - To find a specific run, search for it in the history search bar.
    - Then clicking on a run history entry (shown in the image) re-renders that run's result in the view panel.

    <img src='./resources/doc_image/history.png' width="400px">

1. <h3 id='interpreter'>Select the Python interpreter used to run your flowsheet</h3>

## While editing

1. <h3 id='snippet'>Insert a flowsheet template with a snippet</h3>

## After a run

1. <h3 id='diagram'>Review the resulting flowsheet diagram</h3>

1. <h3 id='stream_variable'>Review the stream table and the variables used in the flowsheet</h3>

1. <h3 id='diagnostic'>Review the Diagnostics Toolbox results</h3>

1. <h3 id='ipopt'>Review the IPOPT solver output</h3>

1. <h3 id='log'>Review the flowsheet run logs</h3>
