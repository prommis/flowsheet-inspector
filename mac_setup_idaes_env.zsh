#!/usr/bin/env zsh

# When encountering any serious errors during the process, the script will automatically stop to prevent messing up the environment
set -e

ENV_NAME="test-idaes-extension"
PYTHON_VERS="3.12.12"
PSE_REPO="git+https://github.com/dangunter/idaes-pse.git@diagnostics-output-objects-1744"
CONNECTIVITY_REPO="git+https://github.com/prommis/idaes-connectivity.git"

echo "========================================================"
echo "    IDAES Extension Environment Auto-Setup Script       "
echo "========================================================"

# 1. Check if Conda is installed
if ! command -v conda &> /dev/null; then
    echo "[!] Conda is not installed or not in PATH."
    echo "[*] Downloading and installing Miniconda silently..."
    
    # auto detect system architecture (Mac Intel/M series or Linux)
    if [[ "$(uname)" == "Darwin" ]]; then
        if [[ "$(uname -m)" == "arm64" ]]; then
            CUR_OS="MacOSX-arm64"
        else
            CUR_OS="MacOSX-x86_64"
        fi
    else
        CUR_OS="Linux-x86_64"
    fi

    # get miniconda
    curl -Lo miniconda.sh "https://repo.anaconda.com/miniconda/Miniconda3-latest-${CUR_OS}.sh"
    # install miniconda to home directory
    bash miniconda.sh -b -p "$HOME/miniconda3"
    rm miniconda.sh
    
    # mount conda to current script execution environment
    source "$HOME/miniconda3/bin/activate"
    conda init zsh
    echo "[+] Miniconda installed successfully!"
else
    echo "[+] Conda environment detected on your system."
fi

# import conda profile function, otherwise conda activate will not be found in bash/zsh script
source $(conda info --base)/etc/profile.d/conda.sh

# 2. Check if environment name already exists, prevent conflict
if conda info --envs | grep -q "^$ENV_NAME "; then
    echo "[!] Environment '$ENV_NAME' already exists."
    echo "[*] Overwriting environment..."
    conda env remove -n "$ENV_NAME" -y
fi

# 3. Create Conda environment
echo ""
echo "[*] Creating Conda environment '$ENV_NAME' with Python $PYTHON_VERS..."
conda create -n "$ENV_NAME" python=$PYTHON_VERS -y

# 4. Activate environment
echo "[*] Activating environment '$ENV_NAME'..."
conda activate "$ENV_NAME"

# 5. Install idaes-pse from specific developer branch
echo ""
echo "[*] 1/3 Installing idaes-pse from specific developer branch..."
pip install "$PSE_REPO"

# 6. Run idaes get-extensions to fetch solvers
echo ""
echo "[*] 2/3 Running 'idaes get-extensions' to fetch solvers..."
idaes get-extensions

# 7. Download and install idaes-connectivity
echo ""
echo "[*] 3/3 Installing idaes-connectivity from GitHub..."
pip install "$CONNECTIVITY_REPO"

echo "========================================================"
echo " 🎉 Setup Complete! "
echo " Please close this terminal, open a NEW terminal window,"
echo " and type the following command before using the extension:"
echo ""
echo "    conda activate $ENV_NAME"
echo "========================================================"
