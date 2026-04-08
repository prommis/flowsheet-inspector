###############################################################################
# The Institute for the Design of Advanced Energy Systems Integrated Platform
# Framework (IDAES IP) was produced under the DOE Institute for the
# Design of Advanced Energy Systems (IDAES).
#
# Copyright (c) 2018-2026 by the software owners: The Regents of the
# University of California, through Lawrence Berkeley National Laboratory,
# National Technology & Engineering Solutions of Sandia, LLC, Carnegie Mellon
# University, West Virginia University Research Corporation, et al.
# All rights reserved.  Please see the files COPYRIGHT.md and LICENSE.md
# for full copyright and license information.
#
###############################################################################
"""
Simple Flash flowsheet for use in testing.
"""

from pyomo.environ import ConcreteModel, SolverFactory
from pyomo.network import Arc, Port
from pyomo.core import TransformationFactory
from idaes.core import FlowsheetBlock

# Import idaes logger to set output levels
import idaes.logger as idaeslog
from idaes.models.properties.activity_coeff_models.BTX_activity_coeff_VLE import (
    BTXParameterBlock,
)
from idaes.models.unit_models import Flash, Valve
from idaes.core.util.structfs.fsrunner import FlowsheetRunner

FS = FlowsheetRunner()

# # Flash Unit Model
#
# Author: Jaffer Ghouse
# Maintainer: Dan Gunter
# Updated: 2023-06-01


@FS.step("build")
def build_model(ctx):
    """Build the model."""
    m = ConcreteModel()
    m.fs = FlowsheetBlock(dynamic=False)
    m.fs.properties = BTXParameterBlock(
        valid_phase=("Liq", "Vap"), activity_coeff_model="Ideal", state_vars="FTPz"
    )
    m.fs.flash = Flash(property_package=m.fs.properties)
    # Add a second unit so diagram has multiple connected blocks
    m.fs.valve = Valve(property_package=m.fs.properties)
    # Connect flash vapor outlet to valve inlet for a second unit stream
    m.fs.flash_to_valve = Arc(
        source=m.fs.flash.vap_outlet, destination=m.fs.valve.inlet
    )
    # Expand arcs to build network connections
    TransformationFactory("network.expand_arcs").apply_to(m)
    # Expose ports for diagram and easy stream checks
    m.fs.vap_outlet = Port(extends=m.fs.flash.vap_outlet)
    m.fs.liq_outlet = Port(extends=m.fs.flash.liq_outlet)
    m.fs.valve_outlet = Port(extends=m.fs.valve.outlet)
    # assert degrees_of_freedom(m) == 7
    ctx.model = m


@FS.step("set_operating_conditions")
def set_operating_conditions(ctx):
    """Set operating conditions."""
    m = ctx.model
    m.fs.flash.inlet.flow_mol.fix(1)
    m.fs.flash.inlet.temperature.fix(368)
    m.fs.flash.inlet.pressure.fix(101325)
    m.fs.flash.inlet.mole_frac_comp[0, "benzene"].fix(0.5)
    m.fs.flash.inlet.mole_frac_comp[0, "toluene"].fix(0.5)
    m.fs.flash.heat_duty.fix(0)
    m.fs.flash.deltaP.fix(0)


@FS.step("initialize")
def init_model(ctx):
    """ "Initialize the model."""
    m = ctx.model
    m.fs.flash.initialize(outlvl=idaeslog.INFO)


@FS.step("set_solver")
def set_solver(ctx):
    """Set the solver."""
    ctx.solver = SolverFactory("ipopt")


@FS.step("solve_initial")
def solve(ctx):
    """Perform the initial model solve."""
    ctx["results"] = ctx.solver.solve(ctx.model, tee=ctx["tee"])


@FS.step("solve_optimization")
def solve_o(ctx):
    ctx["results"] = ctx.solver.solve(ctx.model, tee=ctx["tee"])
    ctx.model.fs.flash.report()
    # Generate and expose mermaid flowsheet diagram for this run
    try:
        mermaid = FS.show_diagram()
    except Exception:
        mermaid = ""
    ctx["mermaid"] = mermaid
    print("--- Mermaid Flowsheet Diagram ---")
    print(mermaid)
    print("----------------------------------")


if __name__ == "__main__":
    FS.run_steps()

