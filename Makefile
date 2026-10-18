# `make help` lists targets.
PORT  ?= 8080
BIOME := npx --yes @biomejs/biome@2.5.15

.PHONY: help serve test lint fmt

help: ## list targets
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-8s %s\n", $$1, $$2}'

serve: ## local preview on http://localhost:PORT
	python3 -m http.server $(PORT)

test: ## run all tests
	node --test

lint: ## lint + format check
	$(BIOME) ci .

fmt: ## apply formatting and safe fixes
	$(BIOME) check --write .
