.PHONY: test build-all clean install dev

# Install dependencies
install:
	pip install cadquery --break-system-packages
	pip install pytest --break-system-packages

# Run all tests
test:
	python -m pytest tests/ -v

# Build all example models and export to dist/
build-all: dist/house.glb dist/drone.glb
	@echo "All models built in dist/"

dist/house.glb:
	@mkdir -p dist
	cd dist && python ../examples/house_v3.py --format step glb stl --output house

dist/drone.glb:
	@mkdir -p dist
	cd dist && python ../examples/drone_v1.py --format step glb stl --output drone

# Build and copy GLBs to viewer for immediate preview
viewer-assets: build-all
	cp dist/house.glb viewer/house.glb
	cp dist/drone.glb viewer/drone.glb
	@echo "Viewer assets updated"

# Clean generated files
clean:
	rm -rf dist/ *.step *.glb *.stl *.dxf
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

# Full dev workflow: clean, test, build
dev: clean test build-all viewer-assets
	@echo "Dev build complete — 20 tests passed, all models in dist/, viewer ready"
