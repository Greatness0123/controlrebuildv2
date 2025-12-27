# Control

A powerful AI-powered desktop application that allows users to control their computer through natural language commands, voice input, and intelligent automation.

## Features

### Core Functionality
- **AI-Powered Computer Control**: Execute tasks on your computer using natural language
- **Voice Input & Transcription**: Control the app with your voice
- **Wake Word Detection**: Activate the assistant with "Computer"
- **Visual Task Feedback**: See real-time progress with ripple effects and edge glow
- **Screenshot Verification**: Automatic verification of completed actions

### Security & Privacy
- **4-Digit PIN Protection**: Secure access with optional PIN authentication
- **Windows Invisibility**: App is invisible to screenshots, screen recording, and screen sharing
- **Local Processing**: Your data stays on your device
- **Secure Storage**: Encrypted storage of sensitive information

### User Interface
- **Transparent Overlay**: Click-through overlay that stays on top of all windows
- **Draggable Floating Button**: Quick access button that snaps to screen edges
- **Chat Interface**: Modern chat interface with real-time feedback
- **Settings Modal**: Comprehensive settings with security controls
- **Entry Window**: Clean authentication interface

### Global Hotkeys
- `Ctrl + Space`: Toggle chat window
- `Alt + Z`: Stop current task

## Architecture

### Backend
- **Python**: Core automation backend using Google Generative AI
- **Computer Vision**: Screen analysis and UI element detection
- **Action Execution**: Mouse, keyboard, and application control
- **Verification**: Real-time verification of completed actions

### Frontend
- **Electron**: Cross-platform desktop application framework
- **Modern UI**: Glass morphism design with smooth animations
- **IPC Communication**: Secure communication between frontend and backend
- **Window Management**: Advanced window handling with transparency and click-through

### Web Dashboard
- **User Management**: Registration, login, and profile management
- **User ID System**: Unique identifiers for authentication
- **Subscription Management**: Free and Pro plan options
- **Firebase Integration**: Real-time database (dummy implementation)

## Installation

### Prerequisites
- Node.js 16+ 
- Python 3.8+
- Windows, macOS, or Linux

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Control
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run in development mode**
   ```bash
   npm run dev
   ```

### Production Build

1. **Build backend executable**
   ```bash
   npm run build-backend
   ```

2. **Build application**
   ```bash
   npm run build
   ```

3. **Create distributable**
   ```bash
   npm run dist
   ```

## Usage

### Getting Started

1. **Launch the application** - The main overlay and entry window will appear
2. **Authenticate** - Enter your User ID or create a new account
3. **Start using** - Click the floating button or press `Ctrl + Space` to open chat

### Basic Usage

1. **Text Commands**: Type commands in the chat interface
2. **Voice Commands**: Click the microphone button or use wake word
3. **Visual Feedback**: Watch the ripple effects and edge glow during tasks
4. **Settings Access**: Click the settings icon to configure options

### Example Commands

- "Open Spotify"
- "Create a new folder on my desktop called 'Projects'"
- "Take a screenshot and save it to my documents"
- "Open Chrome and navigate to github.com"
- "Close all open windows"

## Configuration

### Security Settings
- Enable/disable PIN protection
- Set or change your 4-digit PIN
- Configure voice activation

### Voice Settings
- Enable wake word detection
- Configure voice responses
- Mute notification sounds

### System Settings
- Toggle interaction mode
- Configure hotkeys
- Manage application windows

## Backend Integration

### Communication Protocol
The backend communicates with the frontend via structured JSON messages:

```javascript
// Frontend to Backend
{
  "type": "task_request",
  "query": "Open Spotify",
  "context": {...}
}

// Backend to Frontend
{
  "type": "ai_response",
  "text": "I'll open Spotify for you",
  "is_action": true
}
```

### Action Types
- `screenshot`: Take screen capture
- `click`: Click on screen coordinates
- `type`: Type text
- `key_press`: Press keyboard keys
- `mouse_move`: Move mouse cursor
- `drag`: Drag and drop
- `scroll`: Scroll window
- `terminal`: Execute terminal commands
- `wait`: Wait for specified time
- `focus_window`: Focus specific window
- `analyze_ui`: Analyze user interface elements

## Web Dashboard

### User Management
- **Registration**: Create new account with email and password
- **Login**: Sign in with User ID
- **Profile**: View and edit user information
- **Security**: Change password and manage security settings

### Plans
- **Free Plan**: Basic features with limitations
- **Pro Plan**: Full access to all features

### Authentication
- **User IDs**: Unique 24-character identifiers
- **Secure Storage**: Encrypted password storage
- **Session Management**: Persistent login sessions

## Development

### Project Structure
```
Control/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # Frontend UI components
│   └── preload/        # Security preload scripts
├── assets/             # Application assets
├── website/            # Web dashboard
├── backend_modified.py # Modified Python backend
└── package.json        # Node.js configuration
```

### Key Files
- `src/main/main.js`: Main application controller
- `src/main/window-manager.js`: Window management system
- `src/main/hotkey-manager.js`: Global hotkey handling
- `src/main/security-manager.js`: Security and PIN management
- `src/main/backend-manager.js`: Backend process management
- `backend_modified.py`: Enhanced Python backend

### Adding New Features

1. **Backend Actions**: Add new action types to `backend_modified.py`
2. **UI Components**: Create new renderer components in `src/renderer/`
3. **IPC Handlers**: Add new IPC communication in main process
4. **Settings**: Extend settings modal with new options

## Troubleshooting

### Common Issues

1. **Application won't start**
   - Check Node.js and Python versions
   - Verify all dependencies are installed
   - Check system permissions

2. **Backend not responding**
   - Verify Python backend is running
   - Check backend logs for errors
   - Ensure Python path is correct

3. **Hotkeys not working**
   - Check for conflicting applications
   - Verify system permissions
   - Restart the application

4. **Voice input not working**
   - Check microphone permissions
   - Verify audio input devices
   - Check voice activation settings

### Debug Mode
Enable debug mode by setting environment variable:
```bash
DEBUG=true npm run dev
```

## Security

### Privacy Features
- Local data processing
- No cloud data transmission
- Encrypted local storage
- Windows invisibility mode

### Security Best Practices
- Use strong PINs
- Enable PIN protection
- Regular security updates
- Monitor application permissions

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and documentation:
- Visit our web dashboard
- Check the troubleshooting section
- Report issues on GitHub
- Contact support team

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Changelog

### Version 1.0.0
- Initial release
- Core computer control functionality
- Voice input and wake word detection
- Security PIN system
- Web dashboard integration
- Windows invisibility features