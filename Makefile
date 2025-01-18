.DEFAULT_GOAL := help
.REPORTS_DIR := coverage
.PACKAGE_NAME := waldiez_jupyter
.PACKAGE_MANAGER := yarn

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
	@echo " build-py        Build the Python package"
	@echo " build-js        Build the JavaScript package"
	@echo " all             Run 'requirements', 'forlint', 'test', 'build'"
	@echo " image           Build a container image"
	@echo " dev-image       Build a container image using waldiez packages from git"
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
	${.PACKAGE_MANAGER} run lint


.PHONY: init
init:
	python scripts/init.py

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
	${.PACKAGE_MANAGER} run lint

.PHONY: forlint
forlint: format lint

.PHONY: clean
clean:
	python scripts/clean.py
	${.PACKAGE_MANAGER} run clean:all

.PHONY: requirements
requirements:
	python scripts/requirements.py

.PHONY: test
test:
	python -c 'import os; os.makedirs("coverage", exist_ok=True);'
	pytest \
		-c pyproject.toml \
		--capture=sys \
		--cov=${.PACKAGE_NAME} \
		--cov-branch \
		--cov-report=term-missing:skip-covered \
		--cov-report html:${.REPORTS_DIR}/html \
		--cov-report xml:${.REPORTS_DIR}/coverage.xml \
		--cov-report lcov:${.REPORTS_DIR}/lcov.info \
		--junitxml=${.REPORTS_DIR}/xunit.xml \
		${.PACKAGE_NAME}/tests

.PHONY: .pre-dev
.pre-dev:
	python -m pip install -e .
	jupyter labextension develop --overwrite .

.PHONY: dev
dev: .pre-dev
	python scripts/run.py

.PHONY: dev-react
dev-react:
	python scripts/run.py --react

.PHONY: dev-stop
dev-stop:
	python scripts/run.py --stop

.PHONY: build-py
build-py:
	python -m pip install build
	python -m build

.PHONY: build-js
build-js:
	${.PACKAGE_MANAGER} install && ${.PACKAGE_MANAGER} run lint && ${.PACKAGE_MANAGER} run build

.PHONY: build
build: build-py build-js

.PHONY: all
all: requirements forlint test build
	${.PACKAGE_MANAGER} run test
	${.PACKAGE_MANAGER} run test:ui

.PHONY: image
image:
	python scripts/image.py

.PHONY: dev-image
dev-image:
	python scripts/image.py --dev --no-cache
