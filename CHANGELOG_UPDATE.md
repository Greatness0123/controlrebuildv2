# Changelog: AI Agent & UI Overhaul

This update introduces significant enhancements to the AI's agentic capabilities, planning logic, and user interface, inspired by advanced AI app builders like `dyad` and `libra`.

## Major Features

### 1. Dynamic Planning (Blueprints)
- **Agentic Planning**: The AI now maintains a persistent "Blueprint" of its plan.
- **Adaptive Strategy**: After each action, the AI re-evaluates the screen state and updates its blueprint to adapt to changes or failures.
- **Blueprint UI**: A new collapsible sidebar in the chat window displays the current blueprint, keeping the user informed of the AI's roadmap.

### 2. Intelligent Library & Preference Management
- **Persistent Tracking**: Introduced `userPreferences.json` and `installedLibraries.json` to store user choices and track AI-installed packages.
- **App Preferences**: The AI can now remember and respect user preferences for default applications (e.g., using Spotify for music).
- **Library Research**: Before installing new libraries, the AI performs research to ensure they are lightweight, maintained, and suitable for the task.
- **Conflict Resolution**: The AI is now capable of suggesting viable alternatives when preferences conflict or apps are missing.

### 3. Modernized Chat UI
- **Glassmorphic Design**: A complete redesign of the chat interface with a modern, professional look.
- **Thought Blocks**: AI reasoning is now displayed in distinct "Thought" blocks, separating internal logic from user-facing messages.
- **Action Cards**: Actions are displayed as interactive cards with status indicators and toggleable detailed logs.
- **Lucide Icons**: Integrated high-quality Lucide icons for a cleaner UI.

### 4. Precision & Safety
- **Coordinate Confidence**: The AI now provides a confidence percentage for all spatial actions (clicks, moves), which is logged for debugging and precision tracking.
- **Human-in-the-Loop**: A new "Proceed Without Confirmation" setting allows users to control whether the AI can perform high-risk tasks automatically or must ask for permission.
- **Research Popup**: The AI will now inform users if a requested package is too large or resource-intensive before proceeding.

## Technical Changes
- Created `src/main/storage-manager.js` for persistent JSON management.
- Overhauled `src/main/backends/act-backend.js` with advanced prompting and dynamic loop logic.
- Updated `src/main/backend-manager-fixed.js` and `src/preload/chat-preload.js` to support plan updates.
- Refined `src/renderer/chat-window.html` and `chat-window.js` for the new UI components.
- Added `proceedWithoutConfirmation` to `SettingsManager`.
