.DEFAULT_GOAL := help
.REPORTS_DIR := reports
.PACKAGE_NAME := waldiez_jupyter

.PHONY: help
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Default target: help"
	@echo ""
	@echo "Targets:"
	@echo " help            Show this message and exit"
	@echo " init            Initialize the development environment"
	@echo " format          Format the code"
	@echo " lint            Lint the code"
	@echo " forlint         Alias for 'make format && make lint'"
	@echo " dev             Start dev mode"
	@echo " dev-react       Start dev mode for React"
	@echo " dev-stop		Stop dev mode"
	@echo " build           Build the projects"
	@echo " export          Export .waldiez example files to {.py,.ipynb}"
	@echo " test            Run the tests"
	@echo " requirements    Generate requirements/*.txt"
	@echo " clean           Remove unneeded files (__pycache__, .mypy_cache, etc.)"
	@echo ""

.PHONY: format
format:
	isort .
	autoflake --remove-all-unused-imports --remove-unused-variables --in-place .
	black --config pyproject.toml .
	ruff format --config pyproject.toml .
	jlpm lint


.PHONY: init
init:
	python scripts/dev/init.py


.PHONY: lint
lint:
	isort --check-only .
	black --check --config pyproject.toml .
	mypy --config pyproject.toml .
	flake8 --config=.flake8
	pydocstyle --config pyproject.toml .
	bandit -r -c pyproject.toml .
	yamllint -c .yamllint.yaml .
	ruff check --config pyproject.toml .
	pylint --rcfile=pyproject.toml --recursive y --output-format=text .
	jlpm lint:check

.PHONY: forlint
forlint: format lint

.PHONY: clean
clean:
	python scripts/dev/clean.py
	jlpm clean:all

.PHONY: requirements
requirements:
	python scripts/dev/requirements.py

.PHONY: export
export:
	python scripts/dev/export.py

.PHONY: test
test:
	python -c 'import os; os.makedirs("reports", exist_ok=True);'
	pytest \
		-c pyproject.toml \
		--capture=sys \
		--cov=${.PACKAGE_NAME} \
		--cov-report=term-missing:skip-covered \
		--cov-report html:${.REPORTS_DIR}/html \
		--cov-report xml:${.REPORTS_DIR}/coverage.xml \
		--cov-report lcov:${.REPORTS_DIR}/lcov.info \
		--junitxml=${.REPORTS_DIR}/xunit.xml

.PHONY: .pre-dev
.pre-dev:
	python -m pip install -e .
	jupyter labextension develop --overwrite .

.PHONY: dev
dev: .pre-dev
	python scripts/dev/run.py

.PHONY: dev-react
dev-react:
	python scripts/dev/run.py --react

.PHONY: dev-stop
dev-stop:
	python scripts/dev/run.py --stop

.PHONY: build-py
build-py:
	python -m pip install build
	python -m build

.PHONY: build-js
build-js:
	jlpm && jlpm lint && jlpm build

.PHONY: build
build: build-py build-js

.PHONY: all
all: requirements forlint test build
	jlpm test
	jlpm test:ui
