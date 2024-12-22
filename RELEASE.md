# Making a new release of @waldiez/jupyter

Starting from v0.2.0, the release process is automated using GitHub Actions and it is handled in the integrated repository (waldiez/waldiez). This repository is meant to be used as a submodule in the integrated repository.

To manually build the package and upload it to PyPI, you can follow the steps below:

```shell
# build the package
pip install build twine hatch
yarn clean:all
python -m build
# test the package
twine check dist/*
# upload the package
twine upload dist/*
```
