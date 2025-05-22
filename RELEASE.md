# Making a new release of @waldiez/jupyter

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
