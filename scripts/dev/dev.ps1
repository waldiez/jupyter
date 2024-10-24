$originalLocation = Get-Location

$HERE = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$ROOT_DIR = Split-Path -Parent -Path (Split-Path -Parent -Path $HERE)

Set-Location -Path $ROOT_DIR

if (Test-Path "$ROOT_DIR\.venv\Scripts\Activate.ps1") {
    . "$ROOT_DIR\.venv\Scripts\Activate.ps1"
}

jlpm
jlpm clean
jlpm build
pip install -e .
jupyter labextension develop --overwrite .

Set-Location -Path $originalLocation
