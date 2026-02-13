"""
Shared pytest fixtures for ForgeOS grammar tests.

Usage in any test file:
    def test_something(building_grammar, drone_grammar):
        assembly, result = building_grammar.generate({})
"""

import pytest

from grammars.building import BuildingGrammar
from grammars.drone import DroneGrammar


@pytest.fixture
def building_grammar():
    return BuildingGrammar()


@pytest.fixture
def drone_grammar():
    return DroneGrammar()


@pytest.fixture
def all_grammars():
    """Returns list of all grammar instances for parameterised testing."""
    return [BuildingGrammar(), DroneGrammar()]
