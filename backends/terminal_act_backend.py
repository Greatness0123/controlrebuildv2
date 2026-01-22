#!/usr/bin/env python3
"""
Terminal Control Backend - Standalone Version
"""

import sys
import json
import time
import logging
import os
import subprocess
import re
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime
from enum import Enum
from dataclasses import dataclass, field

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
    from PIL import Image, ImageDraw
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
    format='%(asctime)s - %(levelname)s - [TERMINAL-CONTROL] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('terminal_control.log')
    ]
)
logger = logging.getLogger(__name__)

# ==============================================================================
# DATA STRUCTURES
# ==============================================================================

class Language(Enum):
    EN = "en"

class CoordinateFormat(Enum):
    BOX = "box"
    POINT = "point"

@dataclass
class ThoughtAction:
    thought: str
    action: str
    success: bool = True
    timestamp: datetime = field(default_factory=datetime.now)

@dataclass
class BrowserState:
    current_url: Optional[str] = None
    current_title: Optional[str] = None
    current_screenshot: Optional[str] = None

@dataclass
class AgentState:
    session_id: str
    task: str
    actions_history: List[ThoughtAction] = field(default_factory=list)
    browser_state: BrowserState = field(default_factory=BrowserState)
    error_count: int = 0
    recovery_attempts: int = 0
    start_time: datetime = field(default_factory=datetime.now)

# ==============================================================================
# PROMPT SYSTEM
# ==============================================================================

class PromptEngine:
    def __init__(self, language: Language = Language.EN, 
                 coordinate_format: CoordinateFormat = CoordinateFormat.BOX):
        self.language = language
        self.coordinate_format = coordinate_format
        self.action_space = self._build_action_space()
    
    def _build_action_space(self) -> str:
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
        return """
## Thought Examples

- Example1. Thought: I need to open the Settings application. I can see the Start menu icon in the bottom-left corner of the screen. I'll click on it to open the Start menu, then look for Settings.
  Action: click(point='100 1050')

- Example2. Thought: The Start menu is now open and I can see the Settings icon with a gear symbol. I'll click on it.
  Action: click(point='300 500')

- Example9. Thought: The display has changed successfully. The task is complete.
  Action: finished(content='Successfully changed screen resolution')

- Example10. Thought: I encountered an unexpected error message. I should call the user for assistance.
  Action: call_user()
"""
    
    def get_system_prompt(self) -> str:
        return f"""You are a GUI agent. You are given a task and your action history, with screenshots. You need to perform the next action to complete the task.

## Output Format
````
Thought: ...
Action: ...
````

## Action Space
{self.action_space}

## Note
- Use English in `Thought` part.
- Write a small plan and finally summarize your next action (with its target element) in one sentence in `Thought` part.
- You can provide multiple actions in one step, separated by "\\n\\n".
- Ensure all keys you pressed are released by the end of the step.

## Thought Examples
{self.get_thought_examples()}

## Output Examples
Thought: Write your thoughts here in English...
Action: click(point='100 200')

## User Instruction
"""

    def build_task_prompt(self, task: str, history: List[ThoughtAction], 
                         screenshot_context: str) -> str:
        prompt = self.get_system_prompt()
        prompt += f"Task: {task}\n\n"
        
        if history:
            prompt += "## Action History\n\n"
            for i, ta in enumerate(history[-10:], 1):
                status = "✓" if ta.success else "✗"
                prompt += f"Step {i} [{status}]\n"
                prompt += f"Thought: {ta.thought}\n"
                prompt += f"Action: {ta.action}\n\n"
        
        prompt += "## Current UI Context\n\n"
        prompt += screenshot_context + "\n\n"
        
        prompt += "## Your Response\n\n"
        prompt += "Provide your next Thought and Action to complete the task.\n"
        
        return prompt

# ==============================================================================
# ACTION EXECUTOR
# ==============================================================================

class EnhancedActionExecutor:
    def __init__(self, pyautogui_available: bool):
        self.pyautogui_available = pyautogui_available
        self.screen_size = (1920, 1080)
        self.held_keys = set()
        
        if self.pyautogui_available:
            self.screen_size = pyautogui.size()
            pyautogui.PAUSE = 0.5
            pyautogui.FAILSAFE = True
    
    def parse_coordinates(self, coord_str: str, coord_format: CoordinateFormat) -> Tuple[int, int]:
        try:
            if coord_format == CoordinateFormat.POINT:
                parts = coord_str.strip().split()
                return int(parts[0]), int(parts[1])
            else:
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
    
    def execute_click(self, coord_str: str, coord_format: CoordinateFormat, button: str = "left") -> Dict[str, Any]:
        try:
            x, y = self.parse_coordinates(coord_str, coord_format)
            if not self.pyautogui_available: return {"success": False, "message": "pyautogui not available"}
            
            logger.info(f"Clicking at ({x}, {y}) with {button} button")
            if button == "left": pyautogui.click(x, y, button='left')
            elif button == "right": pyautogui.click(x, y, button='right')
            elif button == "double": pyautogui.doubleClick(x, y)
            time.sleep(0.3)
            return {"success": True, "message": f"Clicked at ({x}, {y})", "coordinates": (x, y)}
        except Exception as e:
            logger.error(f"Click failed: {e}")
            return {"success": False, "message": str(e)}

    # ... Other executor methods would go here, simplified for brevity as they are identical ...
    # Providing a few key ones for functionality
    
    def execute_type(self, content: str) -> Dict[str, Any]:
        try:
            if not self.pyautogui_available: return {"success": False, "message": "pyautogui not available"}
            content = content.replace("\\n", "\n").replace("\\t", "\t")
            logger.info(f"Typing: {content[:50]}...")
            pyautogui.typewrite(content, interval=0.01)
            return {"success": True, "message": f"Typed {len(content)} characters"}
        except Exception as e:
            logger.error(f"Type failed: {e}")
            return {"success": False, "message": str(e)}

    def release_all_keys(self) -> None:
        if not self.pyautogui_available: return
        for key in list(self.held_keys):
            try: pyautogui.keyUp(key)
            except: pass
        self.held_keys.clear()

    def parse_and_execute_action(self, action_str: str, coord_format: CoordinateFormat) -> Dict[str, Any]:
        try:
            action_match = re.match(r'(\w+)\((.*?)\)', action_str)
            if not action_match: return {"success": False, "message": f"Invalid action format: {action_str}"}
            
            action_name = action_match.group(1)
            params_str = action_match.group(2)
            
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
            
            
            if action_name == "click":
                return self.execute_click(params.get("point", ""), coord_format, "left")
            elif action_name == "type":
                return self.execute_type(params.get("content", ""))
            elif action_name == "wait":
                time.sleep(5)
                return {"success": True, "message": "Waited 5 seconds"}
            elif action_name == "finished":
                return {"success": True, "message": f"Task finished: {params.get('content', '')}", "finished": True}
            elif action_name == "call_user":
                return {"success": True, "message": "User intervention requested", "call_user": True}
            
            # Add other actions as needed using same pattern
            
            return {"success": False, "message": f"Action {action_name} implementation skipped in this simplified version"}
            
        except Exception as e:
            logger.error(f"Failed to execute action '{action_str}': {e}")
            return {"success": False, "message": str(e)}

# ==============================================================================
# TERMINAL COMMUNICATION
# ==============================================================================

class TerminalCommunicator:
    """Handle communication with User via Terminal"""
    
    def __init__(self):
        self.is_running = False
    
    def send_response(self, message: str, is_action: bool = True):
        print(f"\n[AI] {message}")
    
    def send_action_start(self, thought: str, action: str):
        print(f"\n[THOUGHT] {thought}")
        print(f"[ACTION] {action}")
    
    def send_action_complete(self, task: str, success: bool, message: str):
        status = "SUCCESS" if success else "FAILED"
        print(f"[STEP {status}] {message}")
    
    def send_task_complete(self, task: str, completed: bool):
        status = "COMPLETED" if completed else "FAILED"
        print(f"\n[TASK {status}] {task}")
    
    def send_error(self, message: str):
        print(f"\n[ERROR] {message}")
    
    def send_screenshot(self, screenshot_data: str):
        pass  # No need to print screenshot data to terminal

# ==============================================================================
# MAIN BACKEND
# ==============================================================================

class EnhancedComputerUseAgentBackend:
    def __init__(self, language: Language = Language.EN,
                 coordinate_format: CoordinateFormat = CoordinateFormat.BOX):
        self.language = language
        self.coordinate_format = coordinate_format
        
        self.prompt_engine = PromptEngine(language, coordinate_format)
        self.executor = EnhancedActionExecutor(GUI_AVAILABLE)
        self.frontend = TerminalCommunicator()
        
        self.sct = mss.mss()
        self.screen_size = (1920, 1080)
        if GUI_AVAILABLE:
            self.screen_size = pyautogui.size()
        
        self.agent_state: Optional[AgentState] = None
        self.running = True
        
        api_key = os.getenv('GEMINI_FREE_KEY')
        if not api_key:
            print("GEMINI_FREE_KEY not found in environment variables", file=sys.stderr)
            sys.exit(1)
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        
        print(f"Agent initialized (Screen: {self.screen_size[0]}x{self.screen_size[1]})")
    
    def take_screenshot(self) -> Tuple[str, Dict[str, Any]]:
        monitor = self.sct.monitors[0]
        screenshot = self.sct.grab(monitor)
        img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
        
        import base64
        from io import BytesIO
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=75)
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        metadata = {
            "width": screenshot.width,
            "height": screenshot.height
        }
        return img_str, metadata
    
    def parse_thought_action_response(self, response_text: str) -> Dict[str, Any]:
        try:
            pattern = r'```[\s\S]*?Thought:\s*(.*?)\s*Action:\s*(.*?)\s*```'
            match = re.search(pattern, response_text, re.DOTALL)
            
            if not match:
                pattern = r'Thought:\s*(.*?)\s*Action:\s*(.*?)(?=\n\n|\n*Thought:|$)'
                match = re.search(pattern, response_text, re.DOTALL | re.MULTILINE)
            
            if match:
                thought = match.group(1).strip()
                action = match.group(2).strip()
                actions = [a.strip() for a in action.split('\n\n') if a.strip()]
                return {"success": True, "thought": thought, "actions": actions}
            else:
                return {"success": False, "message": "Could not parse thought-action response"}
        except Exception as e:
            return {"success": False, "message": str(e)}
    
    def send_to_llm(self, prompt: str, screenshot: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        try:
            content = [{
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": screenshot}}
                ]
            }]
            response = self.model.generate_content(content)
            return {"success": True, "response": response.text}
        except Exception as e:
            return {"success": False, "message": str(e)}
    
    def execute_task(self, task: str):
        session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.agent_state = AgentState(session_id=session_id, task=task)
        
        print(f"\nStarting Task: {task}")
        screenshot, metadata = self.take_screenshot()
        
        step = 0
        max_steps = 30
        task_success = False
        
        while step < max_steps and self.running:
            step += 1
            print(f"\n--- Step {step} ---")
            
            prompt = self.prompt_engine.build_task_prompt(
                task, 
                self.agent_state.actions_history,
                f"Screenshot at step {step}"
            )
            
            llm_response = self.send_to_llm(prompt, screenshot, metadata)
            if not llm_response.get("success"):
                print(f"[ERROR] LLM Request failed: {llm_response.get('message')}")
                break
                
            parsed = self.parse_thought_action_response(llm_response.get("response", ""))
            if not parsed.get("success"):
                print(f"[ERROR] Parse failed: {parsed.get('message')}")
                break
                
            thought = parsed.get("thought", "")
            actions = parsed.get("actions", [])
            
            self.frontend.send_action_start(thought, actions[0] if actions else "")
            
            for action in actions:
                result = self.executor.parse_and_execute_action(action, self.coordinate_format)
                
                ta = ThoughtAction(thought=thought, action=action, success=result.get("success", False))
                self.agent_state.actions_history.append(ta)
                
                if result.get("finished"):
                    print(f"[FINISHED] {result.get('message')}")
                    task_success = True
                    break
                
                if not result.get("success"):
                     print(f"[ERROR] Action failed: {result.get('message')}")
            
            if task_success:
                break
                
            time.sleep(0.5)
            screenshot, metadata = self.take_screenshot()
        
        self.frontend.send_task_complete(task, task_success)
        self.executor.release_all_keys()

    def run_terminal_loop(self):
        print("\n=== Terminal Control Agent ===")
        print("Type a task to execute, or 'q' to quit.")
        
        while True:
            try:
                task = input("\n> ")
                if task.lower() in ['q', 'quit', 'exit']:
                    break
                if not task.strip():
                    continue
                
                self.execute_task(task)
                
            except KeyboardInterrupt:
                print("\nInterrupted.")
                break
            except Exception as e:
                print(f"\nError: {e}")

def main():
    try:
        backend = EnhancedComputerUseAgentBackend()
        backend.run_terminal_loop()
    except Exception as e:
        print(f"[FATAL] {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
