# Control - AI-Powered Computer Command Center

<div align="center">

**Transform Your Computer with Natural Language & Voice Control**

[![GitHub license](https://img.shields.io/github/license/Greatness0123/controlrebuildv2)](https://github.com/Greatness0123/controlrebuildv2/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Greatness0123/controlrebuildv2)](https://github.com/Greatness0123/controlrebuildv2/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Greatness0123/controlrebuildv2)](https://github.com/Greatness0123/controlrebuildv2/network)
[![GitHub issues](https://img.shields.io/github/issues/Greatness0123/controlrebuildv2)](https://github.com/Greatness0123/controlrebuildv2/issues)

[Website](https://controlbeta.vercel.app/) • [Documentation](#documentation) • [Features](#features) • [Installation](#installation)

</div>

---

## What is Control?

**Control** is a revolutionary AI-powered desktop application that transforms how you interact with your computer. By combining advanced natural language processing, voice recognition, and intelligent automation, Control enables you to execute complex computer tasks through simple conversational commands or voice input.

### Core Philosophy

**"Speak, and your computer listens"** - Control bridges the gap between human intent and machine execution, eliminating the friction of traditional computing interfaces.

---

## Key Features

### 🎤 Voice Control & Wake Word Detection
- **Wake Word Activation**: Simply say "hey control" to activate your AI assistant
- **Real-time Speech-to-Text**: Local Vosk server for instant, private voice transcription
- **Text-to-Speech**: High-quality voice responses using Edge-TTS technology
- **Hands-free Operation**: Complete voice-driven workflow without touching keyboard or mouse

### 🧠 Dual-Mode AI Intelligence

#### Ask Mode (Informational)
- Answer questions about anything
- Analyze screenshots and screen content
- Process file attachments (images, PDFs)
- Execute read-only system commands
- Real-time web search for current information
- Perfect for learning, research, and information gathering

#### Act Mode (Automation)
- Execute complex GUI automation tasks
- Click, type, drag, scroll with precision
- Open and manage applications
- Execute terminal commands
- Focus windows and navigate interfaces
- Automatic action verification with screenshots
- Dynamic planning that adapts to screen changes

### 🎨 Modern User Interface
- **Glass Morphism Design**: Cutting-edge translucent UI with blur effects
- **Transparent Overlay**: Click-through, always-on-top interface that stays invisible to screenshots
- **Floating Action Button**: Draggable button that snaps to screen edges
- **Visual Task Feedback**: Real-time ripple effects and edge glow during task execution
- **Modern Chat Interface**: Clean, intuitive messaging with action indicators

### 🔐 Enterprise-Grade Security
- **4-Digit PIN Protection**: Secure access with SHA-256 encrypted PIN storage
- **Windows Invisibility**: App hidden from screenshots, screen recording, and screen sharing
- **Local Data Processing**: Sensitive operations happen on your device
- **Encrypted Storage**: All sensitive data encrypted at rest
- **Privacy-First Design**: Your data stays on your computer

### 🤖 Multi-Provider AI Support
- **Google Gemini**: Native integration with Gemini models
- **OpenRouter**: Access to Claude 3.5 Sonnet, GPT-4o, and other top-tier models (Pro/Master)
- **Ollama**: Run local AI models for complete privacy and offline operation
- **Easy Switching**: Change AI providers based on your needs

### ⚡ Workflow Automation
- **Visual Workflow Builder**: Create complex automation without coding
- **Keyword Triggers**: Execute workflows when specific phrases are detected
- **Time-Based Triggers**: Schedule workflows to run at specific times
- **Multi-Step Actions**: Chain multiple actions into powerful workflows
- **Workflow Library**: Save and reuse your favorite automations

### 🌐 Cross-Platform Support
- **Windows**: Full support with NSIS installer
- **macOS**: Native app with proper permissions handling
- **Linux**: AppImage and deb packages available
- **Unified Experience**: Same features across all platforms

### ⌨️ Global Hotkeys
- `Ctrl+Space` - Toggle chat window
- `Alt+Z` - Stop current task
- `Ctrl+Shift+I` - Toggle interaction mode
- `Ctrl+,` - Open settings
- Customizable shortcuts for all actions

---

## Screenshots

<div align="center">
  <img src="https://controlbeta.vercel.app/screenshots/main-interface.png" alt="Main Interface" width="800">
  <p><em>Main Chat Interface with Glass Morphism Design</em></p>
</div>

<div align="center">
  <img src="https://controlbeta.vercel.app/screenshots/settings-panel.png" alt="Settings Panel" width="800">
  <p><em>Comprehensive Settings Panel</em></p>
</div>

<div align="center">
  <img src="https://controlbeta.vercel.app/screenshots/voice-control.png" alt="Voice Control" width="800">
  <p><em>Voice Control in Action</em></p>
</div>

---

## Installation

### System Requirements

- **Operating System**: Windows 10+, macOS 10.14+, or Ubuntu 18.04+
- **Node.js**: Version 16.0 or higher
- **Python**: Version 3.8 or higher (for voice features)
- **Memory**: Minimum 4GB RAM (8GB recommended)
- **Storage**: 500MB available space

### Quick Start

#### Option 1: Download Pre-built Binaries (Recommended)

1. Visit [controlbeta.vercel.app](https://controlbeta.vercel.app/)
2. Download the appropriate installer for your platform
3. Run the installer and follow the prompts
4. Launch Control and complete setup

#### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/Greatness0123/controlrebuildv2.git
cd controlrebuildv2

# Install dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Start the application
npm start
```

### macOS Setup

After installing on macOS, you'll need to grant several permissions:

1. **Microphone Access**: Go to System Settings → Privacy & Security → Microphone
2. **Accessibility**: Go to System Settings → Privacy & Security → Accessibility
3. **Screen Recording**: Go to System Settings → Privacy & Security → Screen Recording
4. **Full Disk Access**: Go to System Settings → Privacy & Security → Full Disk Access

For detailed instructions, see [MACOS_PRODUCTION_SETUP_GUIDE.md](MACOS_PRODUCTION_SETUP_GUIDE.md)

### Windows Setup

The NSIS installer will automatically request necessary permissions. For custom installer configuration, see [INSTALLER_CUSTOMIZATION.md](INSTALLER_CUSTOMIZATION.md)

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Google Gemini API Key (Required)
GEMINI_API_KEY=your_gemini_api_key_here

# OpenRouter API Key (Optional - for Pro/Master features)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Firebase Configuration (Optional - for user management)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key

# Disable Search Tool (Optional)
DISABLE_SEARCH_TOOL=false
```

### First-Time Setup

1. Launch Control
2. Enter your User ID or create a new account
3. Set up your security PIN (optional but recommended)
4. Configure your preferred AI model and voice settings
5. Grant necessary system permissions
6. Start using Control!

---

## Usage

### Basic Commands

#### Ask Mode Examples
```
"What's on my screen right now?"
"Analyze this PDF and summarize the key points"
"Help me debug this Python code"
"What's the weather like today?"
"Explain how blockchain works"
```

#### Act Mode Examples
```
"Open Chrome and go to YouTube"
"Organize my downloads folder by file type"
"Send an email to john@example.com about the meeting"
"Play my focus playlist on Spotify"
"Take a screenshot and save it to Documents"
```

### Voice Control

1. Enable voice activation in settings
2. Say "hey control" to activate
3. Speak your command naturally
4. Control will respond and execute

### Workflow Automation

1. Open the workflow builder
2. Add steps to your workflow
3. Set triggers (keyword or time-based)
4. Save and enable the workflow
5. Control will execute automatically

---

## Documentation

- [Features Analysis & Market Comparison](CONTROL_FEATURES_ANALYSIS.md)
- [macOS Production Setup Guide](MACOS_PRODUCTION_SETUP_GUIDE.md)
- [Installer Customization Guide](INSTALLER_CUSTOMIZATION.md)
- [Application Architecture](APP_ARCHITECTURE.md)
- [Glass Morphism Design Guide](GLASS_MORPHISM_GUIDE.md)
- [Free Features Guide](FREE_FEATURES_GUIDE.md)
- [Token Limits Guide](TOKEN_LIMITS_GUIDE.md)
- [Wake Word Solutions](WAKEWORD_SOLUTIONS.md)

---

## Development

### Project Structure

```
controlrebuildv2/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.js        # Application entry point
│   │   ├── window-manager.js
│   │   ├── backend-manager-fixed.js
│   │   ├── security-manager-fixed.js
│   │   ├── hotkey-manager.js
│   │   ├── wakeword-manager.js
│   │   ├── edge-tts.js
│   │   ├── vosk-server-manager.js
│   │   ├── firebase-service.js
│   │   ├── workflow-manager.js
│   │   ├── settings-manager.js
│   │   ├── storage-manager.js
│   │   ├── app-utils.js
│   │   └── backends/      # AI backends
│   │       ├── ask-backend.js
│   │       └── act-backend.js
│   ├── renderer/          # Frontend UI
│   │   ├── chat-window.html
│   │   ├── settings-modal.html
│   │   ├── entry-window.html
│   │   ├── main-overlay.html
│   │   ├── workflow-window.html
│   │   └── js/
│   └── preload/           # Security preload scripts
├── website/               # Web dashboard
├── assets/                # Icons, images, resources
├── vosk_server_v2.py      # Speech recognition server
└── package.json
```

### Building for Production

```bash
# Build for all platforms
npm run build

# Build for specific platform
npm run build -- --mac
npm run build -- --win
npm run build -- --linux

# Build portable version
npm run pack
```

### Development Mode

```bash
# Run in development mode
npm run dev

# Enable debug logging
DEBUG=* npm start
```

---

## Troubleshooting

### Common Issues

**Q: Wake word not detected**
- Ensure microphone permissions are granted
- Check that your microphone is working
- Try speaking closer to the microphone
- See [WAKEWORD_SOLUTIONS.md](WAKEWORD_SOLUTIONS.md)

**Q: App stuck on "Thinking"**
- Check your internet connection
- Verify your API key is valid
- Try switching to a different AI model
- Check the status bar for error messages

**Q: Voice responses not working**
- Ensure voice response is enabled in settings
- Check system audio output
- Verify Edge-TTS is working
- Try adjusting voice settings

**Q: Automation not working on macOS**
- Ensure Accessibility permissions are granted
- Check Screen Recording permissions
- Restart the app after granting permissions
- See [MACOS_PRODUCTION_SETUP_GUIDE.md](MACOS_PRODUCTION_SETUP_GUIDE.md)

For more troubleshooting tips, see [DOCUMENTATION.md](DOCUMENTATION.md)

---

## Pricing & Plans

### Free Tier
- Basic AI commands with Gemini
- Text input only
- Limited automation tasks
- Community support

### Pro Tier ($9/month)
- All Free features
- Advanced AI models (GPT-4o, Claude 3.5, etc.)
- Voice activation & wake word
- Unlimited automation tasks
- Priority support
- Custom visual effects

### Master Tier ($29/month)
- All Pro features
- API access for integration
- Enterprise features
- Custom deployments
- Dedicated support

---

## Roadmap

### Upcoming Features
- [ ] Mobile companion apps (iOS/Android)
- [ ] Plugin system for extensions
- [ ] Workflow marketplace
- [ ] Team collaboration features
- [ ] Advanced scheduling
- [ ] Custom AI model training
- [ ] Browser automation
- [ ] Cloud sync for workflows
- [ ] Integration with 100+ popular apps
- [ ] Voice command customization

---

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Fork the repository
# Clone your fork
git clone https://github.com/YOUR_USERNAME/controlrebuildv2.git

# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes
# Commit your changes
git commit -m "Add your feature"

# Push to your fork
git push origin feature/your-feature-name

# Create a Pull Request
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- **Website**: [controlbeta.vercel.app](https://controlbeta.vercel.app/)
- **Email**: support@controlbeta.vercel.app
- **Discord**: [Join our Discord](https://discord.gg/control)
- **Twitter**: [@ControlAI](https://twitter.com/ControlAI)
- **GitHub Issues**: [Report a bug](https://github.com/Greatness0123/controlrebuildv2/issues)

---

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- AI powered by [Google Gemini](https://ai.google.dev/)
- Voice recognition by [Vosk](https://alphacephei.com/vosk/)
- Wake word detection by [Picovoice](https://picovoice.ai/)
- GUI automation by [@computer-use/nut-js](https://github.com/nut-tree/nut-js)

---

<div align="center">

**Made with ❤️ by the Control Team**

[⬆ Back to Top](#control---ai-powered-computer-command-center)

</div>