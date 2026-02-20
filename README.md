<h1>Control - AI-Powered Computer Command Center</h1><div align="center"> <p><strong>Transform Your Computer with Natural Language &amp; Voice Control</strong></p> <p><a href="https://github.com/Greatness0123/controlrebuildv2/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Greatness0123/controlrebuildv2" alt="GitHub license" class="e-rte-image e-imginline"></a> <a href="https://github.com/Greatness0123/controlrebuildv2/stargazers"><img src="https://img.shields.io/github/stars/Greatness0123/controlrebuildv2" alt="GitHub stars" class="e-rte-image e-imginline"></a> <a href="https://github.com/Greatness0123/controlrebuildv2/network"><img src="https://img.shields.io/github/forks/Greatness0123/controlrebuildv2" alt="GitHub forks" class="e-rte-image e-imginline"></a> <a href="https://github.com/Greatness0123/controlrebuildv2/issues"><img src="https://img.shields.io/github/issues/Greatness0123/controlrebuildv2" alt="GitHub issues" class="e-rte-image e-imginline"></a></p> <p><a href="https://controlrebuild-website.vercel.app">Website</a> • <a href="#documentation">Documentation</a> • <a href="#features">Features</a> • <a href="#installation">Installation</a></p> </div><h2>🚀 What is Control?</h2><p><strong>Control</strong> is a revolutionary AI-powered desktop application that transforms how you interact with your computer. By combining advanced natural language processing, voice recognition, and intelligent automation, Control enables you to execute complex computer tasks through simple conversational commands or voice input.</p><h3>🎯 Core Philosophy</h3><p><strong>"Speak, and your computer listens"</strong> - Control bridges the gap between human intent and machine execution, eliminating the friction of traditional computing interfaces.</p><hr><h2>✨ Key Features</h2><h3> Voice Control &amp; Wake Word Detection</h3><ul> <li><strong>Wake Word Activation</strong>: Simply say "Computer" to activate your AI assistant</li> <li><strong>Real-time Speech-to-Text</strong>: Local Vosk server for instant, private voice transcription</li> <li><strong>Text-to-Speech</strong>: High-quality voice responses using Edge-TTS technology</li> <li><strong>Hands-free Operation</strong>: Complete voice-driven workflow without touching keyboard or mouse</li> </ul><h3>🧠 Dual-Mode AI Intelligence</h3><h4><strong>Ask Mode</strong> (Informational)</h4><ul> <li>Answer questions about anything</li> <li>Analyze screenshots and screen content</li> <li>Process file attachments (images, PDFs)</li> <li>Execute read-only system commands</li> <li>Real-time web search for current information</li> <li>Perfect for learning, research, and information gathering</li> </ul><h4><strong>Act Mode</strong> (Automation)</h4><ul> <li>Execute complex GUI automation tasks</li> <li>Click, type, drag, scroll with precision</li> <li>Open and manage applications</li> <li>Execute terminal commands</li> <li>Focus windows and navigate interfaces</li> <li>Automatic action verification with screenshots</li> <li>Dynamic planning that adapts to screen changes</li> </ul><h3>🎨 Modern User Interface</h3><ul> <li><strong>Glass Morphism Design</strong>: Cutting-edge translucent UI with blur effects</li> <li><strong>Transparent Overlay</strong>: Click-through, always-on-top interface that stays invisible to screenshots</li> <li><strong>Floating Action Button</strong>: Draggable button that snaps to screen edges</li> <li><strong>Visual Task Feedback</strong>: Real-time ripple effects and edge glow during task execution</li> <li><strong>Modern Chat Interface</strong>: Clean, intuitive messaging with action indicators</li> </ul><h3>🔒 Enterprise-Grade Security</h3><ul> <li><strong>4-Digit PIN Protection</strong>: Secure access with SHA-256 encrypted PIN storage</li> <li><strong>Windows Invisibility</strong>: App hidden from screenshots, screen recording, and screen sharing</li> <li><strong>Local Data Processing</strong>: All sensitive data processed locally on your device</li> <li><strong>Secure IPC Communication</strong>: Context isolation and secure API exposure</li> <li><strong>Encrypted Storage</strong>: Sensitive information encrypted at rest</li> </ul><h3>⚡ Advanced Automation Capabilities</h3><ul> <li><strong>Mouse Control</strong>: Click, double-click, drag, scroll with pixel precision</li> <li><strong>Keyboard Automation</strong>: Type text, press keys, execute complex shortcuts</li> <li><strong>Application Control</strong>: Open, close, and manage applications</li> <li><strong>Window Management</strong>: Focus, move, and resize windows</li> <li><strong>Terminal Integration</strong>: Execute system commands for maximum efficiency</li> <li><strong>Screenshot Verification</strong>: Automatic verification of completed actions</li> <li><strong>OS-Aware Navigation</strong>: Correct shortcuts and commands for Windows, macOS, and Linux</li> </ul><h3>Multi-Provider AI Support</h3><ul> <li><strong>Google Gemini</strong>: Primary AI provider with multiple model options</li> <li><strong>OpenRouter</strong>: Access to Claude, GPT-4o, and other top-tier models</li> <li><strong>Ollama</strong>: Local AI models for complete privacy and offline operation</li> <li><strong>Automatic Key Rotation</strong>: Seamless handling of API quota limits</li> <li><strong>Rate Limiting</strong>: Intelligent usage management across all providers</li> </ul><h3> Global Hotkeys</h3><ul> <li><code>Ctrl + Space</code>: Toggle chat window</li> <li><code>Alt + Z</code>: Stop current task</li> <li><code>Ctrl + Shift + I</code>: Toggle interaction mode</li> <li><code>Ctrl + ,</code>: Open settings</li> </ul><hr><h2>🏗️ Architecture</h2><h3>Technology Stack</h3><h4>Frontend &amp; Core</h4><ul> <li><strong>Electron 28.0.0</strong>: Cross-platform desktop application framework</li> <li><strong>Node.js 16+</strong>: Runtime environment</li> <li><strong>JavaScript</strong>: Primary language (68.4% of codebase)</li> <li><strong>HTML/CSS</strong>: User interface (29.9% of codebase)</li> </ul><h4>Backend &amp; AI</h4><ul> <li><strong>Python 3.8+</strong>: Backend automation support</li> <li><strong>Google Generative AI</strong>: Core AI provider with Gemini models</li> <li><strong>OpenRouter API</strong>: Access to multiple AI models</li> <li><strong>Ollama</strong>: Local AI model support</li> </ul><h4>Voice &amp; Audio</h4><ul> <li><strong>Vosk</strong>: Local speech recognition server</li> <li><strong>Picovoice Porcupine</strong>: Wake word detection</li> <li><strong>PvRecorder</strong>: Audio capture</li> <li><strong>Edge-TTS</strong>: High-quality text-to-speech</li> <li><strong>WebSockets</strong>: Real-time audio streaming</li> </ul><h4>Automation &amp; Computer Vision</h4><ul> <li><strong>@computer-use/nut-js</strong>: Cross-platform GUI automation</li> <li><strong>screenshot-desktop</strong>: Screen capture</li> <li><strong>Jimp</strong>: Image processing</li> <li><strong>Node.js native modules</strong>: System integration</li> </ul><h4>Cloud &amp; Database</h4><ul> <li><strong>Firebase</strong>: User authentication, database, and analytics</li> <li><strong>Firebase Admin SDK</strong>: Server-side operations</li> </ul><h3>System Architecture</h3><pre><code>┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Web Dashboard  │    │  Electron App   │    │  Python Backend │
│                 │◄──►│                 │◄──►│                 │
│ • User Auth     │    │ • Main Process  │    │ • AI Processing │
│ • User IDs      │    │ • Chat UI       │    │ • Computer Ctrl │
│ • Plans/Billing │    │ • Settings      │    │ • Screenshot    │
│ • Firebase      │    │ • Security      │    │ • Verification  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              │
                       ┌──────┴──────┐
                       │             │
                    ┌──▼──┐       ┌──▼──┐
                    │Ask  │       │Act  │
                    │Mode │       │Mode │
                    └─────┘       └─────┘
</code></pre><hr><h2> Installation</h2><h3>Prerequisites</h3><ul> <li><strong>Operating System</strong>: Windows 10+, macOS 10.14+, or Ubuntu 18.04+</li> <li><strong>Node.js</strong>: Version 16.0 or higher</li> <li><strong>Python</strong>: Version 3.8 or higher (for backend support)</li> <li><strong>Memory</strong>: Minimum 4GB RAM (8GB recommended)</li> <li><strong>Storage</strong>: 500MB available space</li> </ul><h3>Quick Start</h3><h4>1. Clone the Repository</h4><pre><code class="language-bash">git clone https://github.com/Greatness0123/controlrebuildv2.git
cd controlrebuildv2
</code></pre><h4>2. Install Dependencies</h4><pre><code class="language-bash"># Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt
</code></pre><h4>3. Configure Environment</h4><pre><code class="language-bash"># Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Add your Google AI API key and other settings
</code></pre><h4>4. Run in Development Mode</h4><pre><code class="language-bash">npm run dev
</code></pre><h4>5. Build for Production</h4><pre><code class="language-bash"># Build the application
npm run build

# Create distributable
npm run dist
</code></pre><h3>Environment Configuration</h3><p>Create a <code>.env</code> file in the project root:</p><pre><code class="language-env"># Google AI Configuration
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
</code></pre><hr><h2> Usage</h2><h3>Getting Started</h3><ol> <li><strong>Launch the Application</strong> <ul> <li>The main overlay and entry window will appear on startup</li> <li>System tray icon for quick access</li> </ul> </li> <li><strong>Authenticate</strong> <ul> <li>Enter your User ID or create a new account</li> <li>Enable PIN protection for enhanced security</li> </ul> </li> <li><strong>Start Using</strong> <ul> <li>Click the floating button or press <code>Ctrl + Space</code> to open chat</li> <li>Type commands or use voice input</li> <li>Switch between Ask and Act modes</li> </ul> </li> </ol><h3>Basic Commands</h3><h4>Ask Mode Examples</h4><pre><code>"What's on my screen right now?"
"Analyze this screenshot"
"What's the weather today?"
"Explain how to use Git"
</code></pre><h4>Act Mode Examples</h4><pre><code>"Open Spotify and play my focus playlist"
"Create a new folder on my desktop called 'Projects'"
"Take a screenshot and save it to my documents"
"Open Chrome and navigate to github.com"
"Close all open windows"
</code></pre><h3>Voice Control</h3><ol> <li><strong>Enable Voice Activation</strong> in settings</li> <li><strong>Add Picovoice Key</strong> (Pro feature) or use alternatives</li> <li><strong>Say "Computer"</strong> to activate wake word</li> <li><strong>Speak your command</strong> after activation</li> <li><strong>Listen to AI response</strong> via text-to-speech</li> </ol><hr><h2>🔧 Configuration</h2><h3>Settings Overview</h3><h4>Security Settings</h4><ul> <li>Enable/disable PIN protection</li> <li>Set or change your 4-digit PIN</li> <li>Configure auto-lock timeout</li> <li>Windows invisibility mode</li> </ul><h4>Voice Settings</h4><ul> <li>Enable wake word detection ("Computer")</li> <li>Configure voice responses</li> <li>Choose TTS voice and rate</li> <li>Mute notification sounds</li> </ul><h4>AI Settings</h4><ul> <li>Select AI provider (Gemini, OpenRouter, Ollama)</li> <li>Choose specific models</li> <li>Configure API keys</li> <li>Enable/disable web search</li> </ul><h4>System Settings</h4><ul> <li>Toggle interaction mode</li> <li>Configure global hotkeys</li> <li>Set startup behavior</li> <li>Manage window visibility</li> </ul><hr><h2>📊 Business Model</h2><h3>Free Plan</h3><ul> <li>✅ Basic AI commands with Gemini</li> <li>✅ Text input only</li> <li>✅ Limited automation tasks</li> <li>✅ Community support</li> <li>❌ No voice activation</li> <li>❌ No advanced models</li> </ul><h3>Pro Plan</h3><ul> <li>✅ All Free features</li> <li>✅ Advanced AI models (GPT-4o, Claude 3.5, etc.)</li> <li>✅ Voice activation &amp; wake word</li> <li>✅ Unlimited automation tasks</li> <li>✅ Priority support</li> <li>✅ Custom visual effects</li> <li>✅ Enhanced rate limits</li> </ul><h3>Master Plan</h3><ul> <li>✅ All Pro features</li> <li>✅ API access for integration</li> <li>✅ Enterprise features</li> <li>✅ Custom deployments</li> <li>✅ Dedicated support</li> </ul><hr><h2>🛠️ Development</h2><h3>Project Structure</h3><pre><code>controlrebuildv2/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.js          # Application controller
│   │   ├── window-manager.js # Window management
│   │   ├── hotkey-manager.js # Global hotkeys
│   │   ├── security-manager.js # Security features
│   │   ├── backend-manager.js # Backend integration
│   │   ├── wakeword-manager.js # Wake word detection
│   │   ├── edge-tts.js      # Text-to-speech
│   │   ├── vosk-server-manager.js # Speech recognition
│   │   ├── settings-manager.js # Settings persistence
│   │   ├── firebase-service.js # Cloud integration
│   │   └── backends/        # AI backends
│   │       ├── ask-backend.js    # Informational mode
│   │       └── act-backend.js    # Automation mode
│   ├── renderer/             # Frontend UI
│   │   ├── main-overlay.html # Transparent overlay
│   │   ├── chat-window.html  # Chat interface
│   │   ├── settings-modal.html # Settings panel
│   │   └── entry-window.html # Authentication
│   └── preload/              # Security preload scripts
├── website/                 # Web dashboard
│   ├── index.html          # Dashboard page
│   ├── login.html          # Login page
│   └── signup.html         # Registration page
├── assets/                 # Application assets
│   └── icons/              # Application icons
├── docs/                   # Documentation
├── requirements.txt        # Python dependencies
├── package.json           # Node.js configuration
└── README.md              # This file
</code></pre><h3>Key Technical Features</h3><h4>Modular Architecture</h4><ul> <li>Clean separation between main process, renderer, and preload scripts</li> <li>Event-driven asynchronous communication</li> <li>Secure IPC with context isolation</li> <li>Multi-window system with transparency support</li> </ul><h4>Security Implementation</h4><ul> <li>SHA-256 PIN hashing with lockout mechanism</li> <li>Encrypted local storage</li> <li>Windows invisibility via native APIs</li> <li>Secure preload scripts preventing privileged API access</li> </ul><h4>Performance Optimization</h4><ul> <li>Local speech recognition for low latency</li> <li>Screenshot caching and optimization</li> <li>Efficient action verification</li> <li>Resource cleanup and memory management</li> </ul><hr><h2>🐛 Troubleshooting</h2><h3>Common Issues</h3><h4>Application Won't Start</h4><pre><code class="language-bash"># Check Node.js version
node --version  # Should be 16+

# Check Python version
python --version  # Should be 3.8+

# Verify dependencies
npm list
pip list
</code></pre><h4>Backend Not Responding</h4><pre><code class="language-bash"># Check backend logs
tail -f backend-manager.log

# Verify API keys
echo $GOOGLE_API_KEY

# Restart backend
npm run restart-backend
</code></pre><h4>Voice Input Not Working</h4><ul> <li>Check microphone permissions</li> <li>Verify audio input devices</li> <li>Check voice activation settings</li> <li>Ensure Picovoice key is valid (Pro feature)</li> </ul><h4>Hotkeys Not Working</h4><ul> <li>Check for conflicting applications</li> <li>Verify system permissions</li> <li>Restart the application</li> </ul><h3>Debug Mode</h3><p>Enable comprehensive debugging:</p><pre><code class="language-bash"># Environment variables
export DEBUG=true
export LOG_LEVEL=debug

# Run with debug flags
npm run dev -- --debug --verbose
</code></pre><hr><h2>Documentation</h2><ul> <li><a href="https://github.com/Greatness0123/controlrebuildv2/blob/main/PROJECT_SUMMARY.md">Project Summary</a></li> <li><a href="https://github.com/Greatness0123/controlrebuildv2/blob/main/APP_ARCHITECTURE.md">Application Architecture</a></li> <li><a href="https://github.com/Greatness0123/controlrebuildv2/blob/main/INSTALL.md">Installation Guide</a></li> <li><a href="https://github.com/Greatness0123/controlrebuildv2/blob/main/DOCUMENTATION.md">Comprehensive Documentation</a></li> <li><a href="https://github.com/Greatness0123/controlrebuildv2/blob/main/BUILD_GUIDE.md">Build Guide</a></li> </ul><hr><h2> Contributing</h2><p>We welcome contributions! Please follow these steps:</p><ol> <li>Fork the repository</li> <li>Create a feature branch (<code>git checkout -b feature/AmazingFeature</code>)</li> <li>Make your changes</li> <li>Test thoroughly</li> <li>Submit a pull request</li> </ol><h3>Development Guidelines</h3><ul> <li>Write clean, documented code</li> <li>Follow existing code style</li> <li>Add tests for new features</li> <li>Update documentation</li> <li>Ensure cross-platform compatibility</li> </ul><hr><h2>📄 License</h2><p>This project is licensed under the MIT License - see the <a href="LICENSE">LICENSE</a> file for details.</p><hr><h2>🙏 Acknowledgments</h2><ul> <li><strong>Google Generative AI</strong> for powerful language models</li> <li><strong>Electron Team</strong> for the amazing desktop framework</li> <li><strong>Picovoice</strong> for wake word detection technology</li> <li><strong>Vosk</strong> for speech recognition</li> <li><strong>Open-source community</strong> for invaluable tools and libraries</li> </ul><hr><h2> Support &amp; Community</h2><ul> <li><strong>Website</strong>: <a href="https://controlrebuild-website.vercel.app">https://controlrebuild-website.vercel.app</a></li> <li><strong>GitHub Issues</strong>: Report bugs and request features</li> <li><strong>Documentation</strong>: Comprehensive guides and API reference</li> <li><strong>Community</strong>: Join our growing user base</li> </ul><hr><h2> Star History</h2><p><a href="https://star-history.com/#Greatness0123/controlrebuildv2&amp;Date"><img src="https://api.star-history.com/svg?repos=Greatness0123/controlrebuildv2&amp;type=Date" alt="Star History Chart" class="e-rte-image e-imginline"></a></p><hr><div align="center"> <p><strong>Built with ❤️ by <a href="https://github.com/Greatness0123">Greatness0123</a></strong></p> <p><em>Transforming human-computer interaction through AI</em></p> </div>
