# IDAES Extension Command Documentation

### Currently this flowsheet code is live in Dan's repo:
URL: https://github.com/dangunter/idaes-pse.git  
Branch: `structed_flowsheet`

### Example to run this command and get the output JSON file:
```bash
# help
idaes-run --help

# run wrapped flowsheet and get output.json
idaes-run idaes.coreutil.structfs.test.flash_flowsheet output.json
```


## Output JSON File Structure

This JSON file captures the complete output from an IDAES model execution.

### Top-Level Structure

| Key | Type | Description |
|-----|------|-------------|
| `actions` | Object | Contains results from all registered analyzers/actions |
| `last_run` | Array | Ordered list of executed steps |
| `status` | Number | Exit status code (0 = success) |

---

### 1. `actions.UnitDofChecker` - Degrees of Freedom Checker

Tracks the degrees of freedom (DOF) for each component at different execution steps.

```json
{
  "steps": {
    "<step_name>": {
      "<component_path>": <dof_count>,
      ...
    }
  },
  "model": <overall_model_dof>
}
```

**Fields:**
- `steps`: Object containing DOF counts per step per component
- `model`: Overall model degrees of freedom after all steps

---

### 2. `actions.Timer` - Execution Timing

Records execution time (in seconds) for each step.

```json
{
  "timings": {
    "<step_name>": <duration_in_seconds>,
    ...
  }
}
```

**Example:**
```json
{
  "timings": {
    "build": 0.0156,
    "initialize": 0.4188,
    "solve_initial": 0.0332
  }
}
```

---

### 3. `actions.CaptureSolverOutput` - Solver Logs

Captures the complete solver output (e.g., Ipopt logs) for each solve step.

```json
{
  "solver_logs": {
    "<step_name>": "<full_solver_output_string>"
  }
}
```

**Description:**
- Contains the full text output from the solver (Ipopt, etc.)
- Includes iteration details, convergence information, and final status

---

### 4. `actions.ModelVariables` - Variable States

Records all model variables with their values and metadata.

**Variable Format:**
```json
"<variable_name>": [<type>, <indexed>, [<value_entries>]]
```

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `"P"` or `"V"` | `"P"` = Parameter, `"V"` = Variable |
| `indexed` | `true` / `false` | Whether the variable is indexed |
| `value_entries` | Array | List of value entry arrays |

**Value Entry Format:**
```
[index, value, fixed, active, lower_bound, upper_bound]
```

| Position | Field | Type | Description |
|----------|-------|------|-------------|
| 0 | `index` | any | Index key (or `null` for scalar variables) |
| 1 | `value` | number | Current numerical value |
| 2 | `fixed` | boolean | Whether the value is fixed |
| 3 | `active` | boolean | Whether the variable is active |
| 4 | `lower_bound` | number/null | Lower bound constraint |
| 5 | `upper_bound` | number/null | Upper bound constraint |

**Example - Parameter:**
```json
"pressure_critical": [
  "P",
  true,
  [
    ["benzene", 4890000.0],
    ["toluene", 4100000.0]
  ]
]
```

**Example - Variable:**
```json
"flow_mol": ["V", false, [[null, 1, true, true, 0, null]]]
```

---

### 5. `last_run` - Execution Order

Array of step names in the order they were executed:

```json
["build", "set_operating_conditions", "initialize", "set_solver", "solve_initial"]
```

---

### 6. `status` - Exit Code

| Value | Meaning |
|-------|---------|
| `0` | Successful execution |
| Non-zero | Error occurred during execution |