# CreatorOS Local AI Media Worker Setup Script
# Creates a Python virtual environment and installs offline machine learning libraries.

$VENV_DIR = Join-Path (Get-Location) ".venv-media-worker"
$PYTHON_EXE = "python"

Write-Output "=== CreatorOS Local AI Media Worker Setup ==="
Write-Output "Virtual Environment target: $VENV_DIR"

# 1. Create virtual environment if it doesn't exist
if (-not (Test-Path $VENV_DIR)) {
    Write-Output "Creating python virtual environment..."
    Start-Process $PYTHON_EXE -ArgumentList "-m venv .venv-media-worker" -Wait -NoNewWindow
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create python virtual environment. Please check if Python is installed and in your PATH."
        exit 1
    }
    Write-Output "Virtual environment created successfully."
} else {
    Write-Output "Virtual environment already exists. Skipping creation."
}

$VENV_PYTHON = Join-Path $VENV_DIR "Scripts" "python.exe"
$VENV_PIP = Join-Path $VENV_DIR "Scripts" "pip.exe"

# 2. Upgrade pip
Write-Output "Upgrading pip..."
Start-Process $VENV_PYTHON -ArgumentList "-m pip install --upgrade pip" -Wait -NoNewWindow

# 3. Install PyTorch (defaulting to CPU, or CUDA if available via generic pip package)
Write-Output "Installing PyTorch, torchvision, and Flask..."
Start-Process $VENV_PIP -ArgumentList "install torch torchvision Flask transformers easyocr faster-whisper opencv-python Pillow" -Wait -NoNewWindow
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install Python dependencies. Please check your internet connection."
    exit 1
}

Write-Output "=== Setup Completed Successfully ==="
Write-Output "You can start the background local worker using Node.js sidecar manager."
