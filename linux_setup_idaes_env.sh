#!/usr/bin/env bash

# When encountering any serious errors during the process, the script will automatically stop to prevent messing up the environment
set -e

ENV_NAME="test-idaes-extension"
PYTHON_VERS="3.12.12"
PSE_REPO="git+https://github.com/dangunter/idaes-pse.git@diagnostics-output-objects-1744"
CONNECTIVITY_REPO="git+https://github.com/prommis/idaes-connectivity.git"

echo "========================================================"
echo "    IDAES Extension Environment Auto-Setup Script       "
echo "                      (Linux/Bash)                      "
echo "========================================================"

# 0. Check for Git (Required for pip installing from GitHub)
if ! command -v git &> /dev/null; then
    echo "[x] ERROR: 'git' is not installed but is required to download packages."
    echo "[*] Please install git (e.g., 'sudo apt install git' or 'sudo yum install git') and run this script again."
    exit 1
fi

# 1. Check if Conda is installed
if ! command -v conda &> /dev/null; then
    echo "[!] Conda is not installed or not in PATH."
    echo "[*] Downloading and installing Miniconda silently..."
    
    # auto detect system architecture (Intel or ARM)
    if [[ "$(uname -m)" == "x86_64" ]]; then
        CUR_OS="Linux-x86_64"
    elif [[ "$(uname -m)" == "aarch64" ]]; then
        CUR_OS="Linux-aarch64"
    else
        echo "[x] Unsupported architecture: $(uname -m)"
        exit 1
    fi

    # get miniconda
    curl -Lo miniconda.sh "https://repo.anaconda.com/miniconda/Miniconda3-latest-${CUR_OS}.sh"
    # install miniconda to home directory (use -u to safely overwrite if a partial folder already exists to prevent crashes)
    bash miniconda.sh -b -u -p "$HOME/miniconda3"
    rm miniconda.sh
    
    # mount conda to current script execution environment
    source "$HOME/miniconda3/bin/activate"
    conda init bash
    echo "[+] Miniconda installed successfully!"
else
    echo "[+] Conda environment detected on your system."
fi

# import conda profile function, otherwise conda activate will not be found in bash script
if [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    source "$HOME/miniconda3/etc/profile.d/conda.sh"
else
    source $(conda info --base)/etc/profile.d/conda.sh
fi

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
