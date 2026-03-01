# Skill Functionality (Learned Behaviors)

Control's **Skills** system (internally referred to as **Learned Behaviors**) allows the AI to learn, store, and execute specialized automation patterns. This system enables users to extend the AI's capabilities and create shortcuts for complex tasks.

## 1. Core Architecture

The system is built on top of a persistent JSON storage layer managed by `StorageManager` (`src/main/storage-manager.js`). Skills are stored in `learnedBehaviors.json` within the user's data directory.

### Skill Data Structure
A skill consists of:
- **name**: A unique identifier used for slash commands (e.g., "SummarizePDF").
- **description**: A human-readable explanation of what the skill does.
- **pattern**: The natural language instruction that the AI should follow when the skill is invoked.
- **timestamp**: When the skill was learned or imported.

## 2. Implementation Details

### Storage & Management
- **StorageManager**: Handles reading from and writing to `learnedBehaviors.json`. It includes methods to add (with duplicate checking) and delete skills.
- **Main Process (IPC)**: `main.js` exposes handlers for:
  - `import-skill`: Opens a file dialog to import skills from JSON files (supports single or bulk import).
  - `delete-skill`: Removes a skill by name.
  - `read-behaviors`: Returns all currently stored skills.

### AI Integration
The `ActBackend` (`src/main/backends/act-backend.js`) integrates skills into its system prompt.
- **Context Injection**: Every request to the AI includes the list of all "Learned Behaviors" as part of the context.
- **Self-Improvement**: The AI has access to a `write_behaviors` tool, allowing it to autonomously "learn" a successful strategy it just discovered and save it for future use.

## 3. Usage

### Invocation via Slash Commands
Users can trigger any skill directly from the chat input using a slash command:
`/[skillname] [optional context]`

Example: `/SummarizePDF Summarize this document focusing on the financial section.`

When a slash command is detected:
1. The `ChatWindow` renderer looks up the skill by name.
2. If found, it sends a task to the backend with the skill's `pattern` and any additional context provided.

### Management in Settings
A dedicated UI in the Settings modal allows users to:
- **Import Skills**: Load pre-defined skillsets from JSON files.
- **View Skills**: List all currently active skills.
- **Delete Skills**: Remove skills that are no longer needed.

## 4. Example Skill JSON
```json
{
  "name": "SearchScientificPapers",
  "description": "Searches Google Scholar and summarizes the top 3 abstracts.",
  "pattern": "Open the browser, go to Google Scholar, search for the user's query, click on the first 3 links, and summarize the abstracts into a concise report."
}
```
