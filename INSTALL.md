# Installation Guide

## Quick Start

### Prerequisites
- Node.js 16+ 
- Python 3.8+
- Windows 10+, macOS 10.14+, or Ubuntu 18.04+

### Installation Steps

1. **Clone and setup**
```bash
git clone <repository-url>
cd Control
npm install
pip install -r requirements.txt
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your Google API key
```

3. **Run development version**
```bash
npm run dev
```

## Detailed Installation

### System Requirements

**Minimum Requirements:**
- OS: Windows 10 / macOS 10.14 / Ubuntu 18.04
- RAM: 4GB
- Storage: 500MB
- CPU: Dual-core 1.5GHz

**Recommended Requirements:**
- OS: Windows 11 / macOS 12 / Ubuntu 20.04+
- RAM: 8GB+
- Storage: 1GB+
- CPU: Quad-core 2.0GHz+

### Node.js Installation

**Windows:**
1. Download installer from https://nodejs.org
2. Run installer with "Add to PATH" option
3. Restart command prompt
4. Verify: `node --version`

**macOS:**
```bash
brew install node
# OR download installer from nodejs.org
```

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Python Installation

**Windows:**
1. Download from https://python.org
2. Install with "Add to PATH" option
3. Verify: `python --version`

**macOS:**
```bash
brew install python3
```

**Linux:**
```bash
sudo apt update
sudo apt install python3 python3-pip
```

### Dependencies Setup

**Node.js Dependencies:**
```bash
npm install
```

**Python Dependencies:**
```bash
# Create requirements.txt
cat > requirements.txt << EOF
google-generativeai>=0.3.0
pillow>=9.0.0
mss>=6.0.0
pyperclip>=1.8.0
pyautogui>=0.9.0
python-dotenv>=0.19.0
EOF

# Install Python packages
pip install -r requirements.txt
```

### Configuration

1. **Create .env file:**
```bash
cat > .env << EOF
# Google AI Configuration
GOOGLE_API_KEY=your_google_api_key_here

# Application Settings
DEBUG=false
LOG_LEVEL=INFO

# Security Settings
ENABLE_PIN_PROTECTION=true
DEFAULT_PIN=1234

# Voice Settings
ENABLE_VOICE_ACTIVATION=true
WAKE_WORD=Computer
EOF
```

2. **Get Google AI API Key:**
   - Visit https://makersuite.google.com/app/apikey
   - Create new API key
   - Add to .env file

### Running the Application

**Development Mode:**
```bash
npm run dev
```

If `npm run dev` fails on Windows (setting environment variables with `NODE_ENV=...`), install `cross-env` and retry:

```bash
npm install --save-dev cross-env
npm run dev
```

**Production Mode:**
```bash
# Build backend executable
npm run build-backend

# Build application
npm run build

# Run built application
npm start
```

### Troubleshooting

**Common Issues:**

1. **"Module not found" errors:**
```bash
# Reinstall dependencies
npm install
pip install -r requirements.txt
```

2. **Permission denied:**
```bash
# On macOS: Allow in Security & Privacy
# On Linux: Check file permissions
chmod +x src/main/*.js
```

3. **Backend not responding:**
```bash
# Check Python path
which python3
# Update package.json if needed
```

4. **Hotkeys not working:**
```bash
# Check for conflicting applications
# Restart with admin/root privileges
```

### Verification

After installation, verify everything works:

1. **Application starts** ✅
2. **All windows open** ✅
3. **Chat interface works** ✅
4. **Settings save** ✅
5. **Backend responds** ✅
6. **Hotkeys function** ✅

### Next Steps

- Read README.md for usage instructions
- Check DOCUMENTATION.md for detailed information
- Visit the web dashboard for account management
- Configure voice settings if needed