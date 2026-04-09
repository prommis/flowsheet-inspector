# ==============================================================================
# IMPORTANT WINDOWS PREREQUISITE:
# If this script fails to run with a "cannot be loaded because running scripts 
# is disabled on this system" error, you must open PowerShell as Administrator 
# and run the following command to allow script execution:
# 
# Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# ==============================================================================

# When encountering any serious errors during the process, the script will automatically stop to prevent messing up the environment
$ErrorActionPreference = "Stop"

$ENV_NAME = "test-idaes-extension"
$PYTHON_VERS = "3.12.12"
$PSE_REPO = "git+https://github.com/dangunter/idaes-pse.git@diagnostics-output-objects-1744"
$CONNECTIVITY_REPO = "git+https://github.com/prommis/idaes-connectivity.git"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "    IDAES Extension Environment Auto-Setup Script       " -ForegroundColor Cyan
Write-Host "                   (Windows/PowerShell)                 " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 0. Check for Git (Required for pip installing from GitHub)
$gitExists = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitExists) {
    Write-Host "[x] ERROR: 'git' is not installed but is required to download packages!" -ForegroundColor Red
    Write-Host "[*] Please install 'Git for Windows' (https://gitforwindows.org/) and run this script again." -ForegroundColor Yellow
    Exit
}

# 1. Check if Conda is installed
$condaExists = Get-Command conda -ErrorAction SilentlyContinue

if (-not $condaExists) {
    Write-Host "[!] Conda is not installed or not in PATH." -ForegroundColor Yellow
    Write-Host "[*] Downloading and installing Miniconda silently..." -ForegroundColor Yellow
    
    $minicondaUrl = "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe"
    $minicondaExe = "$env:TEMP\miniconda.exe"
    $minicondaPath = "$env:USERPROFILE\miniconda3"

    # Download miniconda installer
    Invoke-WebRequest -Uri $minicondaUrl -OutFile $minicondaExe

    # Install miniconda silently to User directory
    Start-Process -FilePath $minicondaExe -ArgumentList "/InstallationType=JustMe /RegisterPython=0 /S /D=$minicondaPath" -Wait -NoNewWindow
    Remove-Item $minicondaExe -Force

    Write-Host "[+] Miniconda installed successfully!" -ForegroundColor Green

    # Attempt to initialize Powershell Hook
    $condaPath = "$minicondaPath\Scripts\conda.exe"
    & $condaPath init powershell
} else {
    Write-Host "[+] Conda environment detected on your system." -ForegroundColor Green
    $condaPath = (Get-Command conda).Source
}

# Source Conda profile manually for this session (simulating "conda activate" wrapper inside scripts)
# We dynamically locate conda's base, then run its shell.powershell hook
$condaBase = (conda info --base).Trim()
$condaExecutable = Join-Path $condaBase "Scripts\conda.exe"

$condaHook = & $condaExecutable "shell.powershell" "hook" | Out-String
Invoke-Expression -Command $condaHook

# 2. Check if environment name already exists, prevent conflict
$envList = conda info --envs | Out-String
if ($envList -match "(?m)^$ENV_NAME\s+") {
    Write-Host "[!] Environment '$ENV_NAME' already exists." -ForegroundColor Yellow
    Write-Host "[*] Overwriting environment..." -ForegroundColor Yellow
    conda env remove -n $ENV_NAME -y
}

# 3. Create Conda environment
Write-Host "`n[*] Creating Conda environment '$ENV_NAME' with Python $PYTHON_VERS..." -ForegroundColor Yellow
conda create -n $ENV_NAME python=$PYTHON_VERS -y

# 4. Activate environment
Write-Host "[*] Activating environment '$ENV_NAME'..." -ForegroundColor Yellow
conda activate $ENV_NAME

# 5. Install idaes-pse from specific developer branch
Write-Host "`n[*] 1/3 Installing idaes-pse from specific developer branch..." -ForegroundColor Yellow
pip install $PSE_REPO

# 6. Run idaes get-extensions to fetch solvers
Write-Host "`n[*] 2/3 Running 'idaes get-extensions' to fetch solvers..." -ForegroundColor Yellow
idaes get-extensions

# 7. Download and install idaes-connectivity
Write-Host "`n[*] 3/3 Installing idaes-connectivity from GitHub..." -ForegroundColor Yellow
pip install $CONNECTIVITY_REPO

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " 🎉 Setup Complete! " -ForegroundColor Green
Write-Host " Please close this PowerShell terminal, open a NEW one," -ForegroundColor Green
Write-Host " and type the following command before using the extension:" -ForegroundColor Green
Write-Host ""
Write-Host "    conda activate $ENV_NAME" -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Cyan
