* 0.0.7
1. Add live per-step run status indicators in the Run Flowsheet tree view: a spinner for the step currently running, a green check for completed steps, and a red cross for a failed step.
---

* 0.0.6
1. Add Python interpreter detection so users can choose which Python environment to run flowsheets with.
2. Interpreter selection relies on Microsoft's Python extension. It is now optional — if the extension is not installed, the user is prompted to install it.
---

* 0.0.5
1. Fix an issue where previous flowsheet results remained visible when starting a new run.
2. Fix compatibility issues on Windows and Linux.
3. Fix a bug where switching editor tabs caused the extension tab title to always display `hda_flowsheet.py`.
4. Fix a bug on Windows where the full file path was shown instead of just the file name.
5. Add a wrapped flowsheet validator.
6. Fix a bug where an incorrect warning was shown when the initially loaded file (or the file loaded from global state) was not a wrapped flowsheet.
7. Fix a bug where loading a file — whether on initial load, tab switch, or opening a new file — did not notify the user when the file was not a valid wrapped flowsheet.
---

* 0.0.4
1. Add a new "Load Flowsheet" tab to the tree view.
2. Running a flowsheet with the IDAES runner CLI now generates a SQLite database at `~/.idaes/reportdb.sqlite` to store run reports. Users can load flowsheet run history from the "Load Flowsheet" view in the Flowsheet Inspector.
---

* 0.0.3
1. Fix a bug where users were unable to update the shell type.
---

* 0.0.2
1. Move the diagram panel out of the terminal panel and group it with the variable panel.
2. Update the tree panel styling.
3. Update the IPOPT and logs panels: remove borders and split them into individual tabs.
