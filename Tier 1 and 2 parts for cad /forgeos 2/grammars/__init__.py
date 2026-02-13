"""ForgeOS Domain Grammars — product-specific design pattern libraries."""

from .building import BuildingGrammar
from .drone import DroneGrammar

__all__ = ["BuildingGrammar", "DroneGrammar"]

# Registry: import a grammar by name
GRAMMAR_REGISTRY = {
    "building": BuildingGrammar,
    "drone": DroneGrammar,
}


def get_grammar(name: str):
    """Get a grammar class by name. Returns instance, not class."""
    cls = GRAMMAR_REGISTRY.get(name)
    if cls is None:
        available = ", ".join(GRAMMAR_REGISTRY.keys())
        raise ValueError(f"Unknown grammar '{name}'. Available: {available}")
    return cls()
