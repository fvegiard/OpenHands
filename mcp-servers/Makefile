# Une seule commande avant de pousser : `make -C mcp-servers verifier`
#
# Elle lance EXACTEMENT ce que la CI lance. C'est le seul moyen d'apprendre
# une erreur en 3 secondes plutôt qu'en 3 minutes et une CI rouge.
#
# Les vrais devs ne font pas moins d'erreurs — ils les font attraper par une
# machine avant qu'un humain les voie.

PY := gobby-estimation/.venv/bin/python
PROJETS := gobby-estimation gobby-vm
PYFLOWGRAPH_PATH ?= /tmp/claude-0/-home-user-OpenHands/4204260c-b0f2-5d78-987c-b7e67a93ee47/scratchpad/PyFlowGraph
export PYFLOWGRAPH_PATH

.PHONY: verifier corriger format lint types test fmt-pyproject aide

aide:
	@echo "verifier  : tout ce que la CI vérifie (à lancer AVANT de pousser)"
	@echo "corriger  : applique les corrections automatiques, puis vérifie"
	@echo "test      : les tests seulement"

## Ordre voulu : le moins cher d'abord, pour échouer vite.
verifier: format lint fmt-pyproject types test
	@echo ""
	@echo "  Tout est vert. Poussable."

format:
	@echo "→ formatage (ruff)"
	@ruff format --check .

lint:
	@echo "→ lint (ruff)"
	@ruff check .

fmt-pyproject:
	@echo "→ pyproject-fmt (le hook qui a fait rougir la CI)"
	@$(PY) -m pyproject_fmt --keep-full-version $(addsuffix /pyproject.toml,$(PROJETS)) \
		|| { echo "   pyproject réécrit : relancer 'make corriger'"; exit 1; }

types:
	@echo "→ types (mypy)"
	@$(PY) -m mypy --ignore-missing-imports \
		gobby-estimation/gobby_estimation gobby-vm/gobby_vm

test:
	@echo "→ tests"
	@for projet in $(PROJETS); do \
		printf "   %s : " "$$projet"; \
		( cd $$projet && ../$(PY) -m pytest -q 2>&1 | tail -1 ) || exit 1; \
	done

corriger:
	@ruff check --fix .
	@ruff format .
	@$(PY) -m pyproject_fmt --keep-full-version $(addsuffix /pyproject.toml,$(PROJETS)) || true
	@$(MAKE) -C . verifier
