#!/usr/bin/env python3
"""
Enhanced Control Backend - Integrated with UI-TARS Prompting Strategies
Version 2.0 - Inspired by UI-TARS architecture and prompting patterns
"""

import sys
import json
import time
import asyncio
import logging
import os
import subprocess
import re
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List, Union
from datetime import datetime
import threading
import queue
from enum import Enum
from dataclasses import dataclass, field
from collections import deque

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from dotenv import load_dotenv

try:
    GUI_AVAILABLE = False
    
    import mss
    try:
        import pyperclip
    except ImportError:
        pyperclip = None
    from PIL import Image, ImageDraw, ImageFont
    import google.generativeai as genai
    
    try:
        import pyautogui
        GUI_AVAILABLE = True
    except ImportError:
        pyautogui = None
        GUI_AVAILABLE = False
    
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Please run: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [ENHANCED-CONTROL] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('enhanced_control.log')
    ]
)
logger = logging.getLogger(__name__)

# ==============================================================================
# DATA STRUCTURES
# ==============================================================================

class Language(Enum):
    EN = "en"

class CoordinateFormat(Enum):
    BOX = "box"  # [x1, y1, x2, y2]
    POINT = "point"  # x1 y1

@dataclass
class ThoughtAction:
    """Represents a thought-action pair following UI-TARS pattern"""
    thought: str
    action: str
    success: bool = True
    timestamp: datetime = field(default_factory=datetime.now)

@dataclass
class BrowserState:
    """Browser state tracking"""
    current_url: Optional[str] = None
    current_title: Optional[str] = None
    current_screenshot: Optional[str] = None

@dataclass
class AgentState:
    """Comprehensive agent state tracking"""
    session_id: str
    task: str
    actions_history: List[ThoughtAction] = field(default_factory=list)
    browser_state: BrowserState = field(default_factory=BrowserState)
    error_count: int = 0
    recovery_attempts: int = 0
    start_time: datetime = field(default_factory=datetime.now)

# ==============================================================================
# UI-TARS INSPIRED PROMPT SYSTEM
# ==============================================================================

class PromptEngine:
    """Enhanced prompt system inspired by UI-TARS architecture"""
    
    def __init__(self, language: Language = Language.EN, 
                 coordinate_format: CoordinateFormat = CoordinateFormat.BOX):
        self.language = language
        self.coordinate_format = coordinate_format
        self.action_space = self._build_action_space()
    
    def _build_action_space(self) -> str:
        """Build action space documentation"""
        if self.coordinate_format == CoordinateFormat.POINT:
            coord_fmt = "<point>x1 y1</point>"
        else:
            coord_fmt = "[x1, y1, x2, y2]"
        
        actions = [
            f"click(point={coord_fmt})",
            f"left_double(point={coord_fmt})",
            f"right_single(point={coord_fmt})",
            f"drag(start_point={coord_fmt}, end_point={coord_fmt})",
            "hotkey(key='ctrl c')  # Split keys with space, lowercase",
            "press(key='ctrl')  # Press and hold ONE key",
            "release(key='ctrl')  # Release key previously pressed",
            "type(content='xxx')  # Use escape characters \\&quot;, \\, and \\n",
            f"scroll(point={coord_fmt}, direction='down or up or right or left')",
            "wait()  # Sleep for 5s",
            "finished(content='xxx')  # Submit task with report",
            "call_user()  # Request user intervention"
        ]
        
        return "\n".join(actions)
    
    def get_thought_examples(self) -> str:
        """Get thought examples"""
        return self._get_english_thought_examples()
    
    def _get_english_thought_examples(self) -> str:
        return """
## Thought Examples

- Example1. Thought: I need to open the Settings application. I can see the Start menu icon in the bottom-left corner of the screen. I'll click on it to open the Start menu, then look for Settings.
  Action: click(point='100 1050')

- Example2. Thought: The Start menu is now open and I can see the Settings icon with a gear symbol. It's located in the second row from the top, third column. I'll click on it to open Settings.
  Action: click(point='300 500')

- Example3. Thought: I need to navigate to the System section. I can see various categories in the left sidebar including System, Devices, Personalization, etc. The System option is the first item in the list. I'll click on it.
  Action: click(point='150 300')

- Example4. Thought: I'm looking for the Display settings. I can see multiple sections in the main area. The Display option is the first item in the list. I'll click on it to access display settings.
  Action: click(point='400 350')

- Example5. Thought: I need to change the screen resolution. I can see a dropdown menu for resolution. It currently shows 1920 x 1080. I'll click on it to see available resolutions.
  Action: click(point='600 400')

- Example6. Thought: The dropdown is now open and I can see several resolution options. I can see 2560 x 1440 as the second option. I'll click on it to select this higher resolution.
  Action: click(point='600 450')

- Example7. Thought: Now I need to apply the changes. I can see an "Apply" button at the bottom of the window. I'll click on it to apply the new resolution.
  Action: click(point='500 800')

- Example8. Thought: A confirmation dialog has appeared asking if I want to keep these display settings. It shows "Keep changes" and "Revert" buttons. I'll click "Keep changes" to confirm.
  Action: click(point='500 700')

- Example9. Thought: The display has changed successfully. I can see the confirmation dialog has closed and the resolution is now 2560 x 1440. The task is complete.
  Action: finished(content='Successfully changed screen resolution to 2560 x 1440')

- Example10. Thought: I encountered an unexpected error message saying "Unable to apply display settings". This might be because the selected resolution is not supported. I should try a different resolution or call the user for assistance. Let me try calling the user first.
  Action: call_user()

- Example11. Thought: After analyzing the error, I realize I should try the next highest supported resolution. I'll go back to the resolution dropdown and select 1920 x 1200 instead, which is more likely to be supported.
  Action: click(point='600 400')
"""
    

    
    def get_system_prompt(self) -> str:
        """Generate comprehensive system prompt following UI-TARS pattern"""
        
        lang_name = "English"
        
        return f"""You are Control (Act Mode), an intelligent AI assistant designed for GUI automation and task execution.

**YOUR ROLE:**
- You are an AGENTIC AI that EXECUTES TASKS on the user's computer.
- You can make plans, make decisions, and adapt strategies to complete tasks to user satisfaction.
- You MUST understand that UIs vary per OS (Windows, macOS, Linux) and use the provided OS context to navigate accordingly.
- You should work like a normal human: click inputs before typing, use shortcuts (e.g., Alt+Tab, Ctrl+C), and perform system actions.
- Your planning should be robust; always revise your scripts/plans before execution to ensure context is maintained.
- Ensure the application to be used is in focus (visible on screen) before acting on it. Use Alt+Tab or terminal commands to switch focus if needed.

**COORDINATE CALCULATION & SCREEN SIZE:**
- You will receive the SCREEN SIZE as reference.
- Point (0,0) is at the UPPERMOST TOP LEFT.
- DECISION RULE: When calculating coordinates for a click, calculate them TWO times independently.
  - If results match, proceed.
  - If they don't match, calculate a THIRD time and pick the matching one.
  - If none match, keep calculating until you get a consensus. This ensures precision.
- DO NOT RESCALE the screenshot. Use raw pixel coordinates relative to the provided screen size.
- Coordinates must be calculated based on the ENTIRE SCREEN, including the taskbar, even if the target app is windowed.

**GENERAL RULES - WORK LIKE A HUMAN:**
1. Click on input fields BEFORE typing into them
2. Ensure the target application is IN FOCUS before interacting with it
3. Use Alt+Tab or terminal commands to switch focus if needed
4. Always REVISE your plan before execution to maintain context
5. Use keyboard shortcuts for efficiency:
   - Windows: Win (start menu), Alt+F4 (close), Ctrl+C/V (copy/paste), Alt+Tab (switch)
   - macOS: Cmd+Space (spotlight), Cmd+Q (quit), Cmd+C/V, Cmd+Tab
   - Linux: Super (activities), Alt+F4, Ctrl+C/V, Alt+Tab
6. Research how to perform tasks in specific applications if unsure

**TWO MODES OF OPERATION:**
1. **GUI (Mouse & Keyboard):**
   - Use this for interacting with applications.
   - Precision is critical; a simple mistake can be costly.
   - If an app is not fullscreen, you can either maximize it or work with it as is, but ALWAYS calculate coordinates relative to the FULL SCREEN.
   - Click inputs before typing. Use shortcuts where efficient.

2. **TERMINAL (System Operations):**
   - Use this for system checks (battery, WiFi, IP, disk space), settings changes, and file operations.
   - The terminal is POWERFUL; use it for efficiency (e.g., checking if an app is open, closing apps, launching apps).
   - Ensure commands are precise and correctly generated with respect to the respective OS.
   - Examples:
     - Check battery (Win): "powershell (Get-WmiObject Win32_Battery).EstimatedChargeRemaining"
     - Check if app open (Win): "tasklist /FI \\"IMAGENAME eq notepad.exe\\""
     - Open app (Win/Mac): "start notepad" / "open -a TextEdit"
     - Close app (Win): "taskkill /IM notepad.exe"

**OUTPUT FORMAT:**
````
Thought: ...
Action: ...
````

**ACTION SPACE:**
{self.action_space}

**NOTE:**
- Use {lang_name} in `Thought` part.
- Write a small plan and finally summarize your next action (with its target element) in one sentence in `Thought` part.
- You may stumble upon new rules or features while executing GUI tasks for the first time. Make sure to record them in your `Thought` and utilize them later.
- Your thought style should follow the style of Thought Examples.
- You can provide multiple actions in one step, separated by "\\n\\n".
- Ensure all keys you pressed are released by the end of the step.

**THOUGHT EXAMPLES:**
{self.get_thought_examples()}

**USER INSTRUCTION:**
"""
    
    def build_task_prompt(self, task: str, history: List[ThoughtAction], 
                         screenshot_context: str) -> str:
        """Build complete task prompt with history and context"""
        
        prompt = self.get_system_prompt()
        
        # Add task
        prompt += f"Task: {task}\n\n"
        
        # Add action history
        if history:
            prompt += "## Action History\n\n"
            for i, ta in enumerate(history[-10:], 1):  # Last 10 actions
                status = "✓" if ta.success else "✗"
                prompt += f"Step {i} [{status}]\n"
                prompt += f"Thought: {ta.thought}\n"
                prompt += f"Action: {ta.action}\n\n"
        
        # Add current UI context
        prompt += "## Current UI Context\n\n"
        prompt += screenshot_context + "\n\n"
        
        prompt += "## Your Response\n\n"
        prompt += "Provide your next Thought and Action to complete the task.\n"
        
        return prompt

# ==============================================================================
# ENHANCED ACTION EXECUTOR
# ==============================================================================

class EnhancedActionExecutor:
    """Improved action executor with UI-TARS inspired features"""
    
    def __init__(self, pyautogui_available: bool):
        self.pyautogui_available = pyautogui_available
        self.screen_size = (1920, 1080)
        self.held_keys = set()
        
        if self.pyautogui_available:
            self.screen_size = pyautogui.size()
            pyautogui.PAUSE = 0.5
            pyautogui.FAILSAFE = True
    
    def parse_coordinates(self, coord_str: str, coord_format: CoordinateFormat) -> Tuple[int, int]:
        """Parse coordinates from string"""
        try:
            # Handle different coordinate formats
            if coord_format == CoordinateFormat.POINT:
                # Format: "100 200"
                parts = coord_str.strip().split()
                return int(parts[0]), int(parts[1])
            else:
                # Format: "[100, 200, 150, 250]" - take center
                # Remove brackets and split
                cleaned = coord_str.strip("[]()").replace("<point>", "").replace("</point>", "")
                coords = [int(x.strip()) for x in cleaned.split(",")]
                if len(coords) == 4:
                    x1, y1, x2, y2 = coords
                    return (x1 + x2) // 2, (y1 + y2) // 2
                elif len(coords) == 2:
                    return coords[0], coords[1]
                else:
                    raise ValueError(f"Invalid coordinate format: {coord_str}")
        except Exception as e:
            logger.error(f"Failed to parse coordinates '{coord_str}': {e}")
            raise
    
    def execute_click(self, coord_str: str, coord_format: CoordinateFormat, 
                     button: str = "left") -> Dict[str, Any]:
        """Execute click action"""
        try:
            x, y = self.parse_coordinates(coord_str, coord_format)
            
            if not self.pyautogui_available:
                return {
                    "success": False,
                    "message": "pyautogui not available"
                }
            
            logger.info(f"Clicking at ({x}, {y}) with {button} button")
            
            if button == "left":
                pyautogui.click(x, y, button='left')
            elif button == "right":
                pyautogui.click(x, y, button='right')
            elif button == "double":
                pyautogui.doubleClick(x, y)
            
            time.sleep(0.3)
            
            return {
                "success": True,
                "message": f"Clicked at ({x}, {y})",
                "coordinates": (x, y)
            }
        except Exception as e:
            logger.error(f"Click failed: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def execute_type(self, content: str) -> Dict[str, Any]:
        """Execute type action with escape character handling"""
        try:
            if not self.pyautogui_available:
                return {
                    "success": False,
                    "message": "pyautogui not available"
                }
            
            # Handle escape sequences
            content = content.replace("\\n", "\n")
            content = content.replace("\\t", "\t")
            content = content.replace("\\&quot;", "&quot;")
            content = content.replace("\\'", "'")
            content = content.replace('\\"', '"')
            
            logger.info(f"Typing: {content[:50]}...")
            pyautogui.typewrite(content, interval=0.01)
            
            return {
                "success": True,
                "message": f"Typed {len(content)} characters"
            }
        except Exception as e:
            logger.error(f"Type failed: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def execute_hotkey(self, keys: str) -> Dict[str, Any]:
        """Execute hotkey action"""
        try:
            if not self.pyautogui_available:
                return {
                    "success": False,
                    "message": "pyautogui not available"
                }
            
            # Parse keys (space-separated)
            key_list = keys.split()
            logger.info(f"Hotkey: {' + '.join(key_list)}")
            
            pyautogui.hotkey(*key_list)
            time.sleep(0.3)
            
            return {
                "success": True,
                "message": f"Executed hotkey: {keys}"
            }
        except Exception as e:
            logger.error(f"Hotkey failed: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def execute_press(self, key: str) -> Dict[str, Any]:
        """Press and hold a key"""
        try:
            if not self.pyautogui_available:
                return {
                    "success": False,
                    "message": "pyautogui not available"
                }
            
            logger.info(f"Pressing and holding: {key}")
            pyautogui.keyDown(key)
            self.held_keys.add(key)
            
            return {
                "success": True,
                "message": f"Pressed and holding: {key}"
            }
        except Exception as e:
            logger.error(f"Press failed: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def execute_release(self, key: str) -> Dict[str, Any]:
        """Release a previously pressed key"""
        try:
            if not self.pyautogui_available:
                return {
                    "success": False,
                    "message": "pyautogui not available"
                }
            
            logger.info(f"Releasing: {key}")
            pyautogui.keyUp(key)
            self.held_keys.discard(key)
            
            return {
                "success": True,
                "message": f"Released: {key}"
            }
        except Exception as e:
            logger.error(f"Release failed: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def release_all_keys(self) -> None:
        """Release all held keys (cleanup)"""
        if not self.pyautogui_available:
            return
        
        for key in list(self.held_keys):
            try:
                pyautogui.keyUp(key)
                logger.info(f"Released held key: {key}")
            except:
                pass
        self.held_keys.clear()
    
    def execute_drag(self, start_coord: str, end_coord: str, 
                    coord_format: CoordinateFormat) -> Dict[str, Any]:
        """Execute drag action"""
        try:
            start_x, start_y = self.parse_coordinates(start_coord, coord_format)
            end_x, end_y = self.parse_coordinates(end_coord, coord_format)
            
            if not self.pyautogui_available:
                return {
                    "success": False,
                    "message": "pyautogui not available"
                }
            
            logger.info(f"Dragging from ({start_x}, {start_y}) to ({end_x}, {end_y})")
            
            pyautogui.moveTo(start_x, start_y)
            pyautogui.dragTo(end_x, end_y, duration=0.5)
            
            return {
                "success": True,
                "message": f"Dragged from ({start_x}, {start_y}) to ({end_x}, {end_y})"
            }
        except Exception as e:
            logger.error(f"Drag failed: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def execute_scroll(self, coord_str: str, direction: str, 
                      coord_format: CoordinateFormat) -> Dict[str, Any]:
        """Execute scroll action"""
        try:
            x, y = self.parse_coordinates(coord_str, coord_format)
            
            if not self.pyautogui_available:
                return {
                    "success": False,
                    "message": "pyautogui not available"
                }
            
            # Move to scroll position first
            pyautogui.moveTo(x, y)
            
            # Determine scroll amount and direction
            scroll_amount = -5 if direction == "down" else 5
            if direction == "left":
                scroll_amount = -5
            elif direction == "right":
                scroll_amount = 5
            elif direction == "up":
                scroll_amount = 5
            
            logger.info(f"Scrolling {direction} at ({x}, {y})")
            pyautogui.scroll(scroll_amount)
            
            return {
                "success": True,
                "message": f"Scrolled {direction} at ({x}, {y})"
            }
        except Exception as e:
            logger.error(f"Scroll failed: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def execute_wait(self, seconds: int = 5) -> Dict[str, Any]:
        """Execute wait action"""
        logger.info(f"Waiting {seconds} seconds...")
        time.sleep(seconds)
        return {
            "success": True,
            "message": f"Waited {seconds} seconds"
        }
    
    def parse_and_execute_action(self, action_str: str, 
                                  coord_format: CoordinateFormat) -> Dict[str, Any]:
        """Parse and execute an action string"""
        try:
            # Parse action format: action_name(param1='value1', param2='value2')
            action_match = re.match(r'(\w+)\((.*?)\)', action_str)
            
            if not action_match:
                return {
                    "success": False,
                    "message": f"Invalid action format: {action_str}"
                }
            
            action_name = action_match.group(1)
            params_str = action_match.group(2)
            
            # Parse parameters
            params = {}
            if params_str.strip():
                # Regex to match key=value where value can be quoted string, bracketed list, or simple string without comma/paren
                param_pattern = r"(\w+)=(?:['\"]([^'\"]*)['\"]|(\[[^\]]*\])|([^,\)]+))"
                matches = list(re.finditer(param_pattern, params_str))
                
                if matches:
                    for match in matches:
                        key = match.group(1)
                        # Value is in group 2 (quoted), group 3 (bracketed), or group 4 (simple)
                        if match.group(2) is not None:
                            value = match.group(2)
                        elif match.group(3) is not None:
                            value = match.group(3)
                        else:
                            value = match.group(4)
                        params[key] = value.strip()
                else:
                    # Fallback for positional arguments (failed to parse key=value)
                    # Assume the whole string is the first argument for simple actions
                    logger.info(f"Using positional fallback for params: {params_str}")
                    if action_name in ['click', 'left_double', 'right_single', 'scroll']:
                        params['point'] = params_str
                    elif action_name == 'type':
                        # Remove quotes if present
                        content = params_str.strip()
                        if (content.startswith('"') and content.endswith('"')) or \
                           (content.startswith("'") and content.endswith("'")):
                            content = content[1:-1]
                        params['content'] = content
                    elif action_name in ['hotkey', 'press', 'release']:
                        params['key'] = params_str.strip("'\"")
            
            # Execute action
            if action_name == "click":
                point = params.get("point", params.get("start_box", ""))
                return self.execute_click(point, coord_format, "left")
            
            elif action_name == "left_double":
                point = params.get("point", params.get("start_box", ""))
                return self.execute_click(point, coord_format, "double")
            
            elif action_name == "right_single":
                point = params.get("point", params.get("start_box", ""))
                return self.execute_click(point, coord_format, "right")
            
            elif action_name == "drag":
                start = params.get("start_point", params.get("start_box", ""))
                end = params.get("end_point", params.get("end_box", ""))
                return self.execute_drag(start, end, coord_format)
            
            elif action_name == "type":
                content = params.get("content", "")
                return self.execute_type(content)
            
            elif action_name == "hotkey":
                key = params.get("key", "")
                return self.execute_hotkey(key)
            
            elif action_name == "press":
                key = params.get("key", "")
                return self.execute_press(key)
            
            elif action_name == "release":
                key = params.get("key", "")
                return self.execute_release(key)
            
            elif action_name == "scroll":
                point = params.get("point", params.get("start_box", ""))
                direction = params.get("direction", "down")
                return self.execute_scroll(point, direction, coord_format)
            
            elif action_name == "wait":
                return self.execute_wait()
            
            elif action_name == "finished":
                return {
                    "success": True,
                    "message": f"Task finished: {params.get('content', '')}",
                    "finished": True
                }
            
            elif action_name == "call_user":
                return {
                    "success": True,
                    "message": "User intervention requested",
                    "call_user": True
                }
            
            else:
                return {
                    "success": False,
                    "message": f"Unknown action: {action_name}"
                }
        
        except Exception as e:
            logger.error(f"Failed to execute action '{action_str}': {e}")
            return {
                "success": False,
                "message": str(e)
            }

# ==============================================================================
# FRONTEND COMMUNICATION
# ==============================================================================

class FrontendCommunicator:
    """Handle communication with Electron frontend"""
    
    def __init__(self):
        self.is_running = False
    
    def send_message(self, message_type: str, data: Any):
        """Send message to frontend in standardized format"""
        message = {
            "type": message_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        sys.stdout.write(f"FRONTEND_MESSAGE:{json.dumps(message)}\n")
        sys.stdout.flush()

    def send_response(self, message: str, is_action: bool = True):
        """Send response to frontend"""
        self.send_message("ai_response", {
            "text": message,
            "is_action": is_action
        })
    
    def send_action_start(self, thought: str, action: str):
        """Send action start notification"""
        self.send_message("action_start", {
            "thought": thought,
            "action": action,
            "description": f"Thought: {thought}\nAction: {action}",
            "status": "running"
        })
    
    def send_action_complete(self, task: str, success: bool, message: str):
        """Send action complete notification"""
        self.send_message("action_complete", {
            "task": task,
            "success": success,
            "message": message,
            "details": message,
            "status": "completed" if success else "failed"
        })
    
    def send_task_complete(self, task: str, completed: bool):
        """Send task completion notification"""
        self.send_message("task_complete", {
            "task": task,
            "success": completed,
            "completed": completed
        })
    
    def send_error(self, message: str):
        """Send error message"""
        self.send_message("error", {
            "message": message
        })
    
    def send_screenshot(self, screenshot_data: str):
        """Send screenshot to frontend"""
        # Note: frontend might not process 'screenshot' type in handleFrontendMessage directly
        # but we can try to send it. Or verify if backend-manager supports it.
        # backend-manager-fixed.js does NOT seem to have 'screenshot' handler. 
        # But we keep it for reference or add a generic handler. 
        # For now, matching standard format.
        self.send_message("screenshot", {
            "screenshot": screenshot_data
        })

# ==============================================================================
# MAIN ENHANCED AGENT
# ==============================================================================

class EnhancedComputerUseAgentBackend:
    """Enhanced computer use agent with UI-TARS features"""
    
    def __init__(self, language: Language = Language.EN,
                 coordinate_format: CoordinateFormat = CoordinateFormat.BOX):
        self.language = language
        self.coordinate_format = coordinate_format
        
        # Initialize components
        self.prompt_engine = PromptEngine(language, coordinate_format)
        self.executor = EnhancedActionExecutor(GUI_AVAILABLE)
        self.frontend = FrontendCommunicator()
        
        # Screen capture
        self.sct = mss.mss()
        self.screen_size = (1920, 1080)
        if GUI_AVAILABLE:
            self.screen_size = pyautogui.size()
        
        # State management
        self.agent_state: Optional[AgentState] = None
        self.running = True
        self.max_action_retries = 3
        
        # LLM setup
        api_key = os.getenv('GEMINI_FREE_KEY')
        if not api_key:
            logger.error("GEMINI_FREE_KEY not found in environment variables")
            sys.exit(1)
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        
        logger.info(f"Enhanced Agent initialized (Language: {language.value}, "
                   f"Coords: {coordinate_format.value})")
    
    def take_screenshot(self) -> Tuple[str, Dict[str, Any]]:
        """Take screenshot and return base64 data with metadata"""
        monitor = self.sct.monitors[0]
        screenshot = self.sct.grab(monitor)
        
        # Convert to PIL Image
        img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
        
        # Create metadata
        metadata = {
            "width": screenshot.width,
            "height": screenshot.height,
            "timestamp": datetime.now().isoformat()
        }
        
        # Convert to base64
        import base64
        from io import BytesIO
        
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=75)
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        return img_str, metadata
    
    def parse_thought_action_response(self, response_text: str) -> Dict[str, Any]:
        """Parse LLM response into Thought and Action"""
        try:
            # Pattern to match:
            # ```
            # Thought: ...
            # Action: ...
            # ```
            
            pattern = r'```[\s\S]*?Thought:\s*(.*?)\s*Action:\s*(.*?)\s*```'
            match = re.search(pattern, response_text, re.DOTALL)
            
            if not match:
                # Try simpler pattern without code blocks
                pattern = r'Thought:\s*(.*?)\s*Action:\s*(.*?)(?=\n\n|\n*Thought:|$)'
                match = re.search(pattern, response_text, re.DOTALL | re.MULTILINE)
            
            if match:
                thought = match.group(1).strip()
                action = match.group(2).strip()
                
                # Handle multiple actions separated by \n\n
                actions = [a.strip() for a in action.split('\n\n') if a.strip()]
                
                return {
                    "success": True,
                    "thought": thought,
                    "actions": actions
                }
            else:
                logger.error(f"Failed to parse thought-action from response: {response_text[:200]}")
                return {
                    "success": False,
                    "message": "Could not parse thought-action response"
                }
        
        except Exception as e:
            logger.error(f"Error parsing thought-action: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def send_to_llm(self, prompt: str, screenshot: str, 
                    metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Send prompt and screenshot to LLM"""
        try:
            # Prepare image
            import base64
            from io import BytesIO
            
            img_data = base64.b64decode(screenshot)
            img = Image.open(BytesIO(img_data))
            
            # Create content with text and image
            content = [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {
                            "mime_type": "image/jpeg",
                            "data": screenshot
                        }}
                    ]
                }
            ]
            
            # Generate response
            response = self.model.generate_content(content)
            response_text = response.text
            
            logger.info(f"LLM response received (length: {len(response_text)})")
            
            return {
                "success": True,
                "response": response_text
            }
        
        except Exception as e:
            logger.error(f"LLM request failed: {e}")
            return {
                "success": False,
                "message": str(e)
            }
    
    def execute_task(self, task: str, attachments: List[str] = None):
        """Execute a complete task with enhanced features"""
        
        # Initialize agent state
        session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.agent_state = AgentState(session_id=session_id, task=task)
        
        print(f"\n{'='*80}")
        print(f" ENHANCED TASK EXECUTION")
        print(f"{'='*80}")
        print(f"Session ID: {session_id}")
        print(f"Task: {task}")
        print(f"Language: {self.language.value}")
        print(f"Coordinate Format: {self.coordinate_format.value}")
        print(f"{'='*80}\n")
        
        task_success = False
        step_results = []
        
        try:
            # Initial screenshot
            screenshot, metadata = self.take_screenshot()
            self.frontend.send_screenshot(screenshot)
            
            # Main execution loop
            max_steps = 50
            step = 0
            
            while step < max_steps and self.running:
                step += 1
                print(f"\n--- Step {step} ---\n")
                
                # Build prompt
                prompt = self.prompt_engine.build_task_prompt(
                    task, 
                    self.agent_state.actions_history,
                    f"Screenshot at step {step}, screen size {metadata['width']}x{metadata['height']}"
                )
                
                # Send to LLM
                llm_response = self.send_to_llm(prompt, screenshot, metadata)
                
                if not llm_response.get("success"):
                    logger.error(f"LLM request failed: {llm_response.get('message')}")
                    self.frontend.send_error(f"LLM error: {llm_response.get('message')}")
                    break
                
                # Parse thought-action
                parsed = self.parse_thought_action_response(llm_response.get("response", ""))
                
                if not parsed.get("success"):
                    logger.error(f"Failed to parse response: {parsed.get('message')}")
                    break
                
                thought = parsed.get("thought", "")
                actions = parsed.get("actions", [])
                
                print(f"Thought: {thought}\n")
                print(f"Actions ({len(actions)}):")
                for i, action in enumerate(actions, 1):
                    print(f"  {i}. {action}\n")
                
                # Send to frontend
                self.frontend.send_action_start(thought, actions[0] if actions else "")
                
                # Execute each action
                step_success = True
                for action in actions:
                    print(f"Executing: {action}\n")
                    
                    result = self.executor.parse_and_execute_action(action, self.coordinate_format)
                    
                    # Record in history
                    ta = ThoughtAction(
                        thought=thought,
                        action=action,
                        success=result.get("success", False)
                    )
                    self.agent_state.actions_history.append(ta)
                    
                    # Check for special actions
                    if result.get("finished"):
                        print(f"[FINISHED] {result.get('message')}\n")
                        task_success = True
                        break
                    
                    if result.get("call_user"):
                        print(f"[USER_INTERVENTION] {result.get('message')}\n")
                        self.frontend.send_response(result.get("message"))
                        break
                    
                    if not result.get("success"):
                        print(f"[ERROR] {result.get('message')}\n")
                        step_success = False
                        self.agent_state.error_count += 1
                        break
                    
                    print(f"[SUCCESS] {result.get('message')}\n")
                    
                    step_results.append({
                        "step": step,
                        "action": action,
                        "result": result
                    })
                
                # Take new screenshot after actions
                time.sleep(0.5)
                screenshot, metadata = self.take_screenshot()
                self.frontend.send_screenshot(screenshot)
                
                # Check if task is finished
                if task_success:
                    print(f"\nTask completed successfully!\n")
                    break
                
                # If action failed, try recovery
                if not step_success and self.agent_state.error_count < 3:
                    print(f"\n[RECOVERY] Attempting recovery strategy...\n")
                    recovery_prompt = f"""
Task: {task}

The last action failed:
Thought: {thought}
Action: {actions[0]}
Error: {result.get('message')}

Generate an alternative approach to complete this step.
Respond with a new Thought and Action.
"""
                    recovery_response = self.send_to_llm(recovery_prompt, screenshot, metadata)
                    if recovery_response.get("success"):
                        parsed = self.parse_thought_action_response(recovery_response.get("response", ""))
                        if parsed.get("success"):
                            actions = parsed.get("actions", [])
                            print(f"[RECOVERY_PLAN] Generated {len(actions)} alternative actions\n")
                            # Continue with recovery actions (don't increment step)
                            continue
                
                time.sleep(0.3)
            
            # Final verification
            print(f"\n{'='*80}")
            print(f" FINAL VERIFICATION")
            print(f"{'='*80}\n")
            
            if task_success:
                completion_message = f"Task completed successfully in {len(self.agent_state.actions_history)} steps"
                self.frontend.send_action_complete(task, True, completion_message)
                print(f"[SUCCESS] {completion_message}\n")
            else:
                completion_message = "Task execution ended"
                self.frontend.send_action_complete(task, False, completion_message)
                print(f"[INFO] {completion_message}\n")
            
            # Send completion to frontend
            self.frontend.send_task_complete(task, task_success)
            
            # Send final response
            final_response = f"Task execution completed. Total steps: {len(self.agent_state.actions_history)}"
            self.frontend.send_response(final_response, is_action=True)
            
            # Cleanup
            self.executor.release_all_keys()
            
        except Exception as e:
            logger.error(f"Task execution error: {e}")
            self.frontend.send_error(f"Task error: {str(e)}")
        
        finally:
            self.cleanup_screenshots()
    
    def cleanup_screenshots(self):
        """Clean up temporary screenshot files"""
        # Placeholder for cleanup logic
        pass
    
    def run_frontend_loop(self):
        """Run in frontend communication mode"""
        print(f"\n{'='*80}")
        print(" Enhanced Control - Frontend Integration Mode")
        print("{'='*80}")
        print("Ready for frontend communication...")
        print(f"Screen: {self.screen_size[0]}x{self.screen_size[1]}")
        print(f"Max retries per action: {self.max_action_retries}")
        print("Waiting for requests from frontend...\n")
        
        self.frontend.is_running = True
        
        try:
            while self.running:
                try:
                    line = sys.stdin.readline()
                    if not line:
                        break
                    
                    line = line.strip()
                    if line.startswith('FRONTEND_REQUEST:'):
                        try:
                            request_json = line[len('FRONTEND_REQUEST:'):].strip()
                            request = json.loads(request_json)
                            
                            if request.get('type') == 'execute_task':
                                user_request = request.get('request', '')
                                attachments = []
                                if isinstance(user_request, dict):
                                    text = user_request.get('text', '') or ''
                                    attachments = user_request.get('attachments', [])
                                    if text:
                                        self.execute_task(text, attachments)
                                else:
                                    if user_request:
                                        self.execute_task(user_request, [])
                        
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to parse frontend request: {e}")
                    
                    elif line.lower() in ['quit', 'exit', 'q']:
                        break
                
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    logger.error(f"Error in frontend loop: {e}")
        
        except Exception as e:
            logger.error(f"Fatal error in frontend loop: {e}")
        
        logger.info("Frontend loop ended")


def main():
    try:
        backend = EnhancedComputerUseAgentBackend()
        backend.run_frontend_loop()
    except Exception as e:
        print(f"[FATAL] {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()