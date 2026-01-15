# Backend Improvements Plan

This document outlines the remaining backend improvements that need to be implemented for the ACT backend.

## Completed Tasks
- ✅ Offline detection with toast notifications
- ✅ Internet connection check when sending messages
- ✅ Attachments display in messages
- ✅ Auto-send after wakeword (5 second timeout)
- ✅ PIN before greetings
- ✅ Entry modal timing fix
- ✅ Modal draggable functionality

## Remaining Backend Tasks

### 1. System OS Type to AI
**Location:** `act_backend.py`
**Task:** Send system OS type to the AI so it knows how to navigate
**Implementation:**
- Add `platform.system()` to metadata sent with each request
- Include OS type in system prompt context
- Update `send_to_llm()` to include OS information

### 2. OpenRouter Alternative Backends
**Location:** Create new files `act_backend_openrouter.py` and `ask_backend_openrouter.py`
**Task:** Create OpenRouter variants using X AI free model
**Implementation:**
- Copy existing backend files
- Replace Gemini API calls with OpenRouter API
- Use X AI model endpoint: `x-ai/grok-beta` or similar
- Add OpenRouter API key to environment variables
- Create terminal access scripts for all 4 backends:
  - `act_gemini.py` (current)
  - `ask_gemini.py` (current)
  - `act_openrouter.py` (new)
  - `ask_openrouter.py` (new)

### 3. Remove Mouse Move to 0,0 on Start
**Location:** `act_backend.py`
**Task:** Remove automatic mouse movement to (0,0) on backend start
**Implementation:**
- Search for `pyautogui.moveTo(0,0)` or similar
- Remove or comment out initialization mouse movement

### 4. Fix analyze_ui Function
**Location:** `act_backend.py`
**Task:** analyze_ui should not return all element listings - it should be a mechanism for AI to look at screenshot and calculate element locations
**Implementation:**
- Modify `analyze_ui` to only return screenshot
- Let AI analyze screenshot visually to identify elements
- Remove element enumeration logic
- Update system prompt to reflect this change

### 5. Dynamic PyAutoGUI Actions
**Location:** `act_backend.py`
**Task:** Ensure AI is not limited to set of actions - should pass correct pyautogui strings to execute function
**Implementation:**
- Create `execute_pyautogui_command(command_string)` function
- Use `eval()` or safer alternative to execute pyautogui commands
- Update system prompt to allow dynamic command generation
- Add safety checks for dangerous commands

### 6. Human-in-the-Loop for Dangerous Tasks
**Location:** `act_backend.py` and `src/main/main.js`
**Task:** Add confirmation for high-risk actions
**Implementation:**
- Define dangerous action patterns (file deletion, system changes, etc.)
- Create `request_human_confirmation(action_description)` function
- Add setting to enable/disable human-in-the-loop
- Send IPC message to frontend for confirmation dialog
- Wait for user response before proceeding

### 7. AI Planning and Decision Making
**Location:** `act_backend.py`
**Task:** Enable AI to make plans and decisions to perform tasks
**Implementation:**
- Update system prompt to emphasize planning
- Add planning phase before execution
- Allow AI to break down complex tasks into steps
- Enable re-planning if initial plan fails

### 8. Update System Prompt
**Location:** `act_backend.py`
**Task:** Perfect system prompt as computer-use/GUI agent and grade it
**Implementation:**
- Review current system prompt
- Add more specific GUI automation guidance
- Include OS-specific instructions
- Add examples of good vs bad actions
- Test and refine based on performance

### 9. Terminal vs PyAutoGUI Decision
**Location:** `act_backend.py`
**Task:** Refine when to use terminal scripts vs pyautogui
**Implementation:**
- Add decision logic in system prompt
- Terminal: file operations, system commands, bulk operations
- PyAutoGUI: GUI interactions, visual elements, applications without CLI
- Add examples to system prompt

### 10. Reduce Latency
**Location:** `act_backend.py` and `src/main/backend-manager-fixed.js`
**Task:** Update code to reduce latency
**Implementation:**
- Optimize screenshot capture (reduce resolution if needed)
- Parallel processing where possible
- Cache frequently accessed data
- Reduce unnecessary API calls
- Optimize image processing

### 11. Rate Limiting Implementation
**Location:** `src/main/main.js`, `src/main/firebase-service.js`, settings
**Task:** Implement rate limiting based on plan (free: 10/week, pro: 200/week, master: unlimited)
**Implementation:**
- Add task counter to user data
- Check rate limit before executing tasks
- Store counters in Firebase
- Add UI to show remaining tasks
- Reset counters weekly

### 12. Remove 89% of Comments
**Location:** All Python backend files
**Task:** Remove 89% of comments, keep only 11% of highly important ones
**Implementation:**
- Review all comments
- Keep only critical documentation
- Remove obvious/redundant comments
- Keep function docstrings for public APIs

## Implementation Priority

1. **High Priority:**
   - System OS type (#1)
   - Remove mouse move to 0,0 (#3)
   - Fix analyze_ui (#4)
   - Update system prompt (#8)

2. **Medium Priority:**
   - Dynamic PyAutoGUI (#5)
   - Terminal vs PyAutoGUI (#9)
   - Reduce latency (#10)

3. **Lower Priority:**
   - OpenRouter variants (#2)
   - Human-in-the-loop (#6)
   - Rate limiting (#11)
   - Remove comments (#12)

## Notes

- All changes should maintain backward compatibility
- Test each change thoroughly before moving to next
- Update documentation as changes are made
- Consider security implications of dynamic command execution

