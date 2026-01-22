#!/usr/bin/env python3
"""
Control Backend - Modified for Frontend Integration
Enhanced for real-time communication with Electron frontend
"""

import sys
import json
import time
import asyncio
import logging
import os
import subprocess
import re
import platform
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime
import threading
import queue

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:
    def load_dotenv():
        pass
    print("Warning: python-dotenv not found. Please install: pip install python-dotenv", file=sys.stderr)

try:
    GUI_AVAILABLE = False
    
    try:
        import mss  # type: ignore
    except ImportError:
        mss = None
        print("Warning: mss not found. Please install: pip install mss", file=sys.stderr)
    
    try:
        import pyperclip  # type: ignore
    except ImportError:
        pyperclip = None
    
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore
    except ImportError:
        Image = None
        ImageDraw = None
        ImageFont = None
        print("Warning: Pillow not found. Please install: pip install Pillow", file=sys.stderr)
    
    try:
        import google.generativeai as genai  # type: ignore
    except ImportError:
        genai = None
        print("Warning: google.generativeai not found. Please install: pip install google-generativeai", file=sys.stderr)
    
    try:
        import pyautogui  # type: ignore
        GUI_AVAILABLE = True
    except ImportError:
        pyautogui = None
        GUI_AVAILABLE = False
    
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Please run: pip install -r requirements.txt", file=sys.stderr)

load_dotenv()

# Configure logging for frontend integration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [CONTROL] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('control.log')
    ]
)
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Control (Act Mode), an intelligent AI assistant designed for GUI automation and task execution.

**YOUR ROLE:**
- You are an AGENTIC AI that EXECUTES TASKS on the user's computer.
- You can make plans, make decisions, and adapt strategies to complete tasks to user satisfaction.
- You DO NOT answer general questions (e.g., "What is the capital of France?").
- If the request is a task (e.g., "Open Calculator", "Check emails"), EXECUTE IT immediately.
- If the request is a question, REJECT IT and ask the user to switch to "Ask" mode.

**OS-AWARE NAVIGATION:**
- You will receive the Operating System (Windows, macOS, Linux) in the screen context.
- UI elements, shortcuts, and navigation patterns VARY per OS. Use the provided OS to:
  - Choose correct keyboard shortcuts (e.g., Ctrl on Windows/Linux, Cmd on macOS)
  - Navigate OS-specific menus, dialogs, and system settings
  - Use appropriate terminal commands (PowerShell/CMD on Windows, bash on macOS/Linux)

**COORDINATE CALCULATION & PRECISION:**
- You will receive the SCREEN SIZE (width x height) as reference.
- Point (0,0) is at the UPPERMOST TOP LEFT corner of the screen.
- DO NOT rescale or resize the screenshot - use raw pixel coordinates.
- PRECISION RULE: When calculating coordinates for a click:
  1. Calculate the coordinates TWICE independently
  2. If both results match, proceed with those coordinates
  3. If they differ, calculate a THIRD time and use the matching pair
  4. If none match, keep calculating until you get a consensus
  This ensures maximum precision and reduces click errors.
- Coordinates must ALWAYS be relative to the ENTIRE SCREEN (including taskbar) even if the app is windowed.

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

1. **GUI MODE (Mouse & Keyboard):**
   - Use for interacting with applications (clicking buttons, typing, dragging)
   - Precision is CRITICAL - a mistake can cause unintended actions
   - If an app is NOT fullscreen, you can maximize it OR work with it as-is
   - ALWAYS calculate coordinates relative to the FULL SCREEN (not just the app window)
   - Common GUI actions: click, double_click, type, key_press, drag, scroll

2. **TERMINAL MODE (System Operations):**
   - Use for system checks: battery status, WiFi info, IP address, disk space, running processes
   - Use for system actions: open apps, close apps, check if app is running, change settings
   - Use for file operations: create, move, delete, list files
   - Commands must be precise and OS-specific
   - The terminal is POWERFUL - use it when more efficient than GUI
   - Examples:
     - Check battery: "powershell (Get-WmiObject Win32_Battery).EstimatedChargeRemaining" (Windows)
     - Check if app open: "tasklist /FI \"IMAGENAME eq notepad.exe\"" (Windows)
     - Open app: "start notepad" (Windows), "open -a TextEdit" (macOS)
     - Close app: "taskkill /IM notepad.exe" (Windows)

**RESPONSE FORMAT:**
Always respond with a JSON object in this format:
{
  "type": "task",
  "analysis": "Current UI state and strategy (1 sentence)",
  "plan": "Step-by-step action plan",
  "actions": [
    {
      "step": 1,
      "description": "Action description",
      "action": "screenshot|click|type|key_press|double_click|mouse_move|drag|scroll|terminal|wait|focus_window|execute_pyautogui",
      "parameters": {},
      "verification": {
        "expected_outcome": "Specific change that should occur",
        "verification_method": "visual|terminal_output|window_check",
        "success_indicators": ["visual marker 1"]
      }
    }
  ]
}

**ACTION REFERENCE:**
- screenshot: Capture current screen with cursor marked
- click: Single click at coordinates {"coordinates": [x, y]}
- double_click: Double click at coordinates {"coordinates": [x, y]}
- type: Input text {"text": "content", "clear_first": true/false}
- key_press: Keyboard shortcut {"keys": ["ctrl", "c"], "combo": true}
- mouse_move: Move cursor {"coordinates": [x, y]}
- drag: Drag from start to end {"coordinates": [x1, y1], "end_coordinates": [x2, y2]}
- scroll: Scroll at position {"coordinates": [x, y], "direction": "up|down", "amount": 3}
- terminal: Execute OS command {"command": "your_command_here"}
- wait: Pause execution {"duration": seconds}
- focus_window: Bring app to focus {"app_name": "AppName", "method": "alt_tab|search|terminal"}
- execute_pyautogui: Run PyAutoGUI command {"command": "pyautogui.click(100, 200)"}

**HUMAN-IN-THE-LOOP:**
- For high-risk actions (file deletion, system changes, network operations), request user confirmation
- Use sparingly, only for truly dangerous operations
"""


class FrontendIntegration:
    """Handles communication with Electron frontend"""
    
    def __init__(self):
        self.message_queue = queue.Queue()
        self.is_running = False
        
    def send_message(self, message_type: str, data: Any):
        """Send message to frontend"""
        try:
            message = {
                "type": message_type,
                "data": data,
                "timestamp": datetime.now().isoformat()
            }
            print(f"FRONTEND_MESSAGE:{json.dumps(message)}")
            sys.stdout.flush()
        except Exception as e:
            logger.error(f"Failed to send message to frontend: {e}")
    
    def send_action_start(self, description: str):
        """Send action start notification"""
        self.send_message("action_start", {
            "description": description,
            "status": "running"
        })
    
    def send_action_complete(self, description: str, success: bool, details: str = ""):
        """Send action completion notification"""
        self.send_message("action_complete", {
            "description": description,
            "success": success,
            "details": details,
            "status": "completed" if success else "failed"
        })
    
    def send_response(self, response: str, is_action: bool = False):
        """Send response to frontend"""
        self.send_message("ai_response", {
            "text": response,
            "is_action": is_action
        })
    
    def send_error(self, error: str):
        """Send error to frontend"""
        self.send_message("error", {
            "message": error
        })
    
    def send_task_start(self, task: str):
        """Send task start notification with visual effects"""
        self.send_message("task_start", {
            "task": task,
            "show_effects": True
        })
    
    def send_task_complete(self, task: str, success: bool):
        """Send task completion notification"""
        self.send_message("task_complete", {
            "task": task,
            "success": success
        })


class ActionVerifier:
    """Handles verification of individual actions"""
    
    def __init__(self, llm_model, screenshot_func, get_metadata_func):
        self.model = llm_model
        self.take_screenshot = screenshot_func
        self.get_metadata = get_metadata_func
    
    def verify_action(self, action: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Verify if an action was successfully executed
        Returns verification result with retry suggestions
        """
        try:
            verification_info = action.get('verification', {})
            if not verification_info:
                return {
                    "verified": True,
                    "status": "success",
                    "message": "No verification specified, assuming success"
                }
            
            screenshot_path, metadata = self.take_screenshot()
            
            verification_prompt = f"""VERIFICATION TASK:

Action executed: {action.get('action')}
Description: {action.get('description')}
Parameters: {json.dumps(action.get('parameters', {}))}

Expected outcome: {verification_info.get('expected_outcome')}
Verification method: {verification_info.get('verification_method')}
Success indicators to check: {json.dumps(verification_info.get('success_indicators', []))}

Execution result: {result.get('message')}

Analyze the current screenshot and determine if the action was successful.
Look specifically for the success indicators mentioned above.

Respond ONLY with JSON in this exact format:
{{
  "verification_status": "success|failure|partial",
  "outcome_achieved": true/false,
  "observations": "Detailed description of what you see",
  "indicators_found": ["list of success indicators you found"],
  "indicators_missing": ["list of expected indicators not visible"],
  "retry_suggestion": "If failed, specific suggestion for retry (different coordinates, different method, etc.)",
  "ui_changed": true/false,
  "requires_reanalysis": true/false
}}"""
            
            verification_response = self._send_verification_to_llm(
                verification_prompt, 
                screenshot_path, 
                metadata
            )
            
            if verification_response.get('verification_status') == 'success':
                return {
                    "verified": True,
                    "status": "success",
                    "message": verification_response.get('observations'),
                    "details": verification_response
                }
            else:
                return {
                    "verified": False,
                    "status": verification_response.get('verification_status', 'failure'),
                    "message": f"Verification failed: {verification_response.get('observations')}",
                    "retry_suggestion": verification_response.get('retry_suggestion'),
                    "requires_reanalysis": verification_response.get('requires_reanalysis', False),
                    "details": verification_response
                }
        
        except Exception as e:
            logger.error(f"Verification error: {e}")
            return {
                "verified": False,
                "status": "error",
                "message": f"Verification error: {str(e)}"
            }
    
    def _send_verification_to_llm(self, prompt: str, screenshot_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Send verification request to LLM"""
        try:
            content_parts = []
            
            screen_context = f"""SCREEN CONTEXT:
- Screen: {metadata.get('screen_width')}x{metadata.get('screen_height')}
- Cursor: ({metadata.get('cursor_x')}, {metadata.get('cursor_y')})

"""
            content_parts.append(screen_context + prompt)
            
            if screenshot_path and os.path.exists(screenshot_path):
                with open(screenshot_path, 'rb') as f:
                    image_data = f.read()
                content_parts.append({
                    "mime_type": "image/png",
                    "data": image_data
                })
            
            response = self.model.generate_content(content_parts)
            response_text = response.text.strip()
            
            # Extract JSON
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    json_str = json_match.group()
                else:
                    raise ValueError("No JSON found in verification response")
            
            return json.loads(json_str)
        
        except Exception as e:
            logger.error(f"LLM verification error: {e}")
            return {
                "verification_status": "error",
                "outcome_achieved": False,
                "observations": f"Error during verification: {str(e)}"
            }


class ComputerUseAgentBackend:
    """Enhanced backend for Control with frontend integration"""
    
    def __init__(self):
        self.running = True
        self.screenshot_dir = project_root / "screenshots"
        self.screenshot_dir.mkdir(exist_ok=True)
        self.execution_history = []
        
        self.frontend = FrontendIntegration()
        self.screen_size = self.get_screen_size()
        self.setup_gemini_api()
        self.setup_computer_control()
        self.verifier = ActionVerifier(
            self.model,
            self.take_screenshot,
            lambda: {"screen_width": self.screen_size[0], "screen_height": self.screen_size[1]}
        )
        
        self.max_action_retries = 3
        self.verification_wait = 0.5
        
        self.verification_wait = 0.5
        
        # Threading support for cancellation
        self.stop_event = threading.Event()
        self.execution_thread = None
        
        logger.info(f"Control Backend initialized - Screen: {self.screen_size[0]}x{self.screen_size[1]}")
    
    def get_screen_size(self) -> Tuple[int, int]:
        """Get the screen resolution"""
        try:
            if GUI_AVAILABLE and pyautogui:
                size = pyautogui.size()
                return (size.width, size.height)
            else:
                with mss.mss() as sct:
                    monitor = sct.monitors[1]
                    return (monitor['width'], monitor['height'])
        except Exception as e:
            logger.warning(f"Could not get screen size: {e}, using default 1920x1080")
            return (1920, 1080)
    
    def get_cursor_position(self) -> Tuple[int, int]:
        """Get current cursor position"""
        try:
            if GUI_AVAILABLE and pyautogui:
                pos = pyautogui.position()
                return (pos.x, pos.y)
            else:
                return (0, 0)
        except Exception as e:
            logger.warning(f"Could not get cursor position: {e}")
            return (0, 0)
    
    def setup_gemini_api(self):
        if genai is None:
            logger.error("google.generativeai not available. Please install: pip install google-generativeai")
            self.model = None
            return
        
        api_key = os.getenv('GEMINI_FREE_KEY')
        if not api_key:
            api_key = "test_api_key"
            logger.warning("No API key found")
        
        try:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-2.5-flash', 
                                             system_instruction=SYSTEM_PROMPT)
            print("[API] Ready\n")
            logger.info("API configured")
        except Exception as e:
            print(f"[API] ERROR: {e}\n")
            self.model = None
    
    def setup_computer_control(self):
        try:
            if GUI_AVAILABLE and pyautogui:
                # Disable fail-safe to prevent corner-trigger errors during automation
                pyautogui.FAILSAFE = False
                pyautogui.PAUSE = 0.05
                print(f"[CONTROL] GUI libraries ready - Screen: {self.screen_size[0]}x{self.screen_size[1]}\n")
            
            try:
                with mss.mss(with_cursor=True) as sct:
                    monitors = sct.monitors
                    print(f"[CONTROL] {len(monitors)-1} monitor(s) detected\n")
            except Exception as e:
                print(f"[CONTROL] WARNING: {e}\n")
        except Exception as e:
            print(f"[CONTROL] ERROR: {e}\n")
    
    def take_screenshot(self, mark_cursor: bool = True) -> Tuple[str, Dict[str, Any]]:
        """Take screenshot with cursor position marked"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            filename = f"screenshot_{timestamp}.png"
            filepath = self.screenshot_dir / filename
            
            cursor_x, cursor_y = self.get_cursor_position()
            
            with mss.mss() as sct:
                monitor = sct.monitors[1]
                sct_img = sct.grab(monitor)
                img = Image.frombytes("RGB", sct_img.size, sct_img.rgb)
                
                if mark_cursor and cursor_x > 0 and cursor_y > 0:
                    draw = ImageDraw.Draw(img)
                    radius = 15
                    
                    draw.ellipse(
                        [cursor_x - radius, cursor_y - radius, 
                         cursor_x + radius, cursor_y + radius],
                        outline='red',
                        width=3
                    )
                    
                    draw.line([cursor_x - radius - 5, cursor_y, cursor_x + radius + 5, cursor_y], 
                             fill='red', width=2)
                    draw.line([cursor_x, cursor_y - radius - 5, cursor_x, cursor_y + radius + 5], 
                             fill='red', width=2)
                
                img.save(filepath)
            
            metadata = {
                "screen_width": self.screen_size[0],
                "screen_height": self.screen_size[1],
                "cursor_x": cursor_x,
                "cursor_y": cursor_y,
                "timestamp": timestamp
            }
            
            logger.info(f"Screenshot: {filepath} | Cursor: ({cursor_x}, {cursor_y})")
            return str(filepath), metadata
        
        except Exception as e:
            logger.error(f"Screenshot error: {e}")
            return "", {}
    
    def cleanup_screenshots(self) -> None:
        """Auto-cleanup screenshots without user interaction"""
        try:
            screenshot_files = list(self.screenshot_dir.glob("screenshot_*.png"))
            if not screenshot_files:
                return
            logger.info(f"Auto-cleaning {len(screenshot_files)} screenshot(s)")
            for file in screenshot_files:
                try:
                    file.unlink()
                except Exception as e:
                    logger.error(f"Failed to delete {file}: {e}")
            
            logger.info(f"Removed {len(screenshot_files)} screenshot(s)")
        
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
    
    def execute_action_with_verification(self, action: Dict[str, Any], attempt: int = 1) -> Dict[str, Any]:
        """
        Execute an action and verify its success
        Retries up to max_action_retries times if verification fails
        """
        max_retries = self.max_action_retries
        ui_context = {}
        
        for retry in range(max_retries):
            if retry > 0:
                print(f"[RETRY {retry}/{max_retries-1}] Attempting action again...\n")
                
                if ui_context.get('requires_reanalysis'):
                    print(f"[REANALYSIS] UI changed, re-analyzing before retry...")
                    reanalysis_action = {
                        "action": "analyze_ui",
                        "parameters": {
                            "app_name": action.get('parameters', {}).get('app_name', 'application'),
                            "elements_to_find": ["all interactive elements"],
                            "full_analysis": True
                        }
                    }
                    reanalysis_result = self.execute_action(reanalysis_action)
                    if reanalysis_result.get('success'):
                        if reanalysis_result.get('ui_elements'):
                            print(f"[REANALYSIS] Found {len(reanalysis_result['ui_elements'])} elements")
                            ui_context['ui_elements'] = reanalysis_result['ui_elements']
            
            self.frontend.send_action_start(action.get('description', 'Executing action'))
            print(f"[EXECUTE] {action.get('description', 'Action')}")
            result = self.execute_action(action)
            
            if not result.get('success'):
                print(f"[EXECUTION_FAILED] {result.get('message')}")
                self.frontend.send_action_complete(action.get('description', 'Action'), False, result.get('message'))
                if retry < max_retries - 1:
                    time.sleep(self.verification_wait)
                    continue
                else:
                    return {
                        "success": False,
                        "message": f"Action failed after {max_retries} attempts",
                        "final_result": result
                    }
            
            time.sleep(self.verification_wait)
            print(f"[VERIFY] Checking if action succeeded...")
            verification = self.verifier.verify_action(action, result)
            
            if verification.get('verified'):
                print(f"[VERIFIED] ✓ {verification.get('message')}\n")
                self.frontend.send_action_complete(action.get('description', 'Action'), True, verification.get('message'))
                return {
                    "success": True,
                    "verified": True,
                    "message": verification.get('message'),
                    "result": result,
                    "verification": verification
                }
            else:
                print(f"[VERIFICATION_FAILED] ✗ {verification.get('message')}")
                ui_context = verification.get('details', {})
                self.frontend.send_action_complete(action.get('description', 'Action'), False, verification.get('message'))
                
                if retry < max_retries - 1:
                    retry_suggestion = verification.get('retry_suggestion')
                    if retry_suggestion:
                        print(f"[SUGGESTION] {retry_suggestion}")
                    time.sleep(0.5)
                else:
                    print(f"[FAILED] Action could not be verified after {max_retries} attempts\n")
                    return {
                        "success": False,
                        "verified": False,
                        "message": verification.get('message'),
                        "result": result,
                        "verification": verification
                    }
        
        return {
            "success": False,
            "message": "Max retries exceeded"
        }
    
    def execute_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a single action (original implementation)"""
        result = {"success": False, "message": "", "action": action.get('action'), "screenshot": None, "metadata": {}}
        
        try:
            action_type = action.get('action', '').lower()
            params = action.get('parameters', {})
            
            if action_type == 'screenshot':
                filepath, metadata = self.take_screenshot()
                result["success"] = bool(filepath)
                result["message"] = filepath
                result["screenshot"] = filepath
                result["metadata"] = metadata
            
            elif action_type == 'click':
                if GUI_AVAILABLE and pyautogui:
                    x, y = params.get('coordinates', [0, 0])
                    pyautogui.click(x, y)
                    time.sleep(0.3)
                    screenshot_path, metadata = self.take_screenshot()
                    result["success"] = True
                    result["message"] = f"Clicked ({x}, {y})"
                    result["screenshot"] = screenshot_path
                    result["metadata"] = metadata
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'double_click':
                if GUI_AVAILABLE and pyautogui:
                    x, y = params.get('coordinates', [0, 0])
                    pyautogui.click(x, y, clicks=2)
                    time.sleep(0.3)
                    screenshot_path, metadata = self.take_screenshot()
                    result["success"] = True
                    result["message"] = f"Double-clicked ({x}, {y})"
                    result["screenshot"] = screenshot_path
                    result["metadata"] = metadata
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'type':
                if GUI_AVAILABLE and pyautogui:
                    text = params.get('text', '')
                    clear_first = params.get('clear_first', False)
                    if clear_first:
                        pyautogui.hotkey('ctrl', 'a')
                        time.sleep(0.1)
                    pyautogui.write(text)
                    time.sleep(0.3)
                    screenshot_path, metadata = self.take_screenshot()
                    result["success"] = True
                    result["message"] = f"Typed: {text[:30]}"
                    result["screenshot"] = screenshot_path
                    result["metadata"] = metadata
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'key_press':
                if GUI_AVAILABLE and pyautogui:
                    keys = params.get('keys', [])
                    combo = params.get('combo', len(keys) > 1)
                    if combo and len(keys) > 1:
                        pyautogui.hotkey(*keys)
                    else:
                        for key in keys:
                            pyautogui.press(key)
                    time.sleep(0.3)
                    screenshot_path, metadata = self.take_screenshot()
                    result["success"] = True
                    result["message"] = f"Keys: {'+'.join(keys)}"
                    result["screenshot"] = screenshot_path
                    result["metadata"] = metadata
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'focus_window':
                if GUI_AVAILABLE and pyautogui:
                    app_name = params.get('app_name', '')
                    method = params.get('method', 'alt_tab')
                    max_attempts = params.get('max_attempts', 5)
                    verify_focus = params.get('verify_focus', True)
                    
                    attempt = 0
                    focus_verified = False
                    
                    while attempt < max_attempts and not focus_verified:
                        attempt += 1
                        
                        if method == 'alt_tab':
                            pyautogui.hotkey('alt', 'tab')
                            time.sleep(0.5)
                        elif method == 'search':
                            pyautogui.hotkey('win')
                            time.sleep(0.3)
                            pyautogui.write(app_name)
                            time.sleep(0.5)
                            pyautogui.press('enter')
                            time.sleep(0.5)
                        elif method == 'terminal':
                            if sys.platform == 'win32':
                                check_cmd = f'tasklist /FI "IMAGENAME eq {app_name}.exe"'
                            else:
                                check_cmd = f'pgrep -x {app_name}'
                            
                            check_result = subprocess.run(check_cmd, shell=True, capture_output=True, text=True, timeout=5)
                            if check_result.returncode == 0 and app_name.lower() in check_result.stdout.lower():
                                pyautogui.hotkey('alt', 'tab')
                                time.sleep(0.5)
                            else:
                                if sys.platform == 'win32':
                                    subprocess.Popen(f'start {app_name}', shell=True)
                                else:
                                    subprocess.Popen(app_name, shell=True)
                                time.sleep(1.5)
                        
                        screenshot_path, metadata = self.take_screenshot()
                        result["screenshot"] = screenshot_path
                        result["metadata"] = metadata
                        
                        if verify_focus:
                            verification_prompt = f"""Is '{app_name}' currently in focus?

Respond ONLY with JSON:
{{
  "window_in_focus": true/false,
  "window_name": "name of focused window",
  "reason": "brief explanation"
}}"""
                            
                            verification = self.send_to_llm(verification_prompt, screenshot_path, metadata)
                            
                            if verification.get('window_in_focus', False):
                                focus_verified = True
                                result["success"] = True
                                result["message"] = f"Focused {app_name}"
                                break
                            elif attempt < max_attempts:
                                time.sleep(0.5)
                        else:
                            focus_verified = True
                            result["success"] = True
                            result["message"] = "Focused window (verification skipped)"
                            break
                    
                    if not focus_verified:
                        result["success"] = False
                        result["message"] = f"Failed to focus {app_name}"
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'terminal':
                command = params.get('command', '')
                try:
                    output = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=10)
                    result["success"] = output.returncode == 0
                    result["message"] = output.stdout[:200] if output.stdout else output.stderr[:200]
                    time.sleep(0.3)
                    screenshot_path, metadata = self.take_screenshot()
                    result["screenshot"] = screenshot_path
                    result["metadata"] = metadata
                except Exception as e:
                    result["message"] = str(e)
                    result["success"] = False
            
            elif action_type == 'wait':
                duration = params.get('duration', 1)
                time.sleep(duration)
                screenshot_path, metadata = self.take_screenshot()
                result["success"] = True
                result["message"] = f"Waited {duration}s"
                result["screenshot"] = screenshot_path
                result["metadata"] = metadata
            
            elif action_type == 'mouse_move':
                if GUI_AVAILABLE and pyautogui:
                    coordinates = params.get('coordinates')
                    if not coordinates or len(coordinates) < 2:
                        result["success"] = False
                        result["message"] = "Coordinates required for mouse_move"
                    else:
                        x, y = coordinates[0], coordinates[1]
                        if x < 0 or y < 0:
                            result["success"] = False
                            result["message"] = "Invalid coordinates: cannot move to negative position"
                        else:
                            pyautogui.moveTo(x, y)
                            time.sleep(0.2)
                            screenshot_path, metadata = self.take_screenshot()
                            result["success"] = True
                            result["message"] = f"Moved to ({x}, {y})"
                            result["screenshot"] = screenshot_path
                            result["metadata"] = metadata
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'scroll':
                if GUI_AVAILABLE and pyautogui:
                    x, y = params.get('coordinates', [500, 500])
                    direction = params.get('direction', 'down')
                    amount = params.get('amount', 3)
                    scroll_amount = amount if direction == 'down' else -amount
                    pyautogui.moveTo(x, y)
                    pyautogui.scroll(scroll_amount)
                    time.sleep(0.3)
                    screenshot_path, metadata = self.take_screenshot()
                    result["success"] = True
                    result["message"] = f"Scrolled {direction} by {amount}"
                    result["screenshot"] = screenshot_path
                    result["metadata"] = metadata
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'drag':
                if GUI_AVAILABLE and pyautogui:
                    coordinates = params.get('coordinates')
                    end_coordinates = params.get('end_coordinates')
                    if not coordinates or len(coordinates) < 2 or not end_coordinates or len(end_coordinates) < 2:
                        result["success"] = False
                        result["message"] = "Both start and end coordinates required for drag"
                    else:
                        start_x, start_y = coordinates[0], coordinates[1]
                        end_x, end_y = end_coordinates[0], end_coordinates[1]
                        if start_x < 0 or start_y < 0 or end_x < 0 or end_y < 0:
                            result["success"] = False
                            result["message"] = "Invalid coordinates: cannot drag to/from negative position"
                        else:
                            duration = params.get('duration', 0.5)
                            button = params.get('button', 'left')
                            pyautogui.moveTo(start_x, start_y)
                            pyautogui.drag(end_x - start_x, end_y - start_y, duration=duration, button=button)
                            time.sleep(0.3)
                            screenshot_path, metadata = self.take_screenshot()
                            result["success"] = True
                            result["message"] = f"Dragged from ({start_x}, {start_y}) to ({end_x}, {end_y})"
                            result["screenshot"] = screenshot_path
                            result["metadata"] = metadata
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'execute_pyautogui':
                if GUI_AVAILABLE and pyautogui:
                    command = params.get('command', '')
                    if not command:
                        result["success"] = False
                        result["message"] = "PyAutoGUI command string required"
                    else:
                        try:
                            safe_globals = {'pyautogui': pyautogui, '__builtins__': __builtins__}
                            safe_locals = {}
                            exec(f"result_value = {command}", safe_globals, safe_locals)
                            time.sleep(0.2)
                            screenshot_path, metadata = self.take_screenshot()
                            result["success"] = True
                            result["message"] = f"Executed PyAutoGUI command: {command}"
                            result["screenshot"] = screenshot_path
                            result["metadata"] = metadata
                        except Exception as e:
                            result["success"] = False
                            result["message"] = f"PyAutoGUI execution error: {str(e)}"
                else:
                    result["message"] = "GUI not available"
            
            elif action_type == 'human_in_the_loop':
                action_description = params.get('action_description', '')
                risk_level = params.get('risk_level', 'medium')
                if not action_description:
                    result["success"] = False
                    result["message"] = "Action description required for human-in-the-loop"
                else:
                    result["success"] = True
                    result["message"] = "Human-in-the-loop requested"
                    result["requires_approval"] = True
                    result["action_description"] = action_description
                    result["risk_level"] = risk_level
                    result["user_approved"] = False
            
            else:
                result["message"] = f"Unknown action: {action_type}"
        
        except Exception as e:
            result["message"] = str(e)
            logger.error(f"Action error: {e}")
        
        return result
    
    def send_to_llm(self, prompt: str, screenshot_path: str = None, metadata: Dict[str, Any] = None, retry_info: str = None, attachments: list = None) -> Dict[str, Any]:
        try:
            if not self.model:
                return {"status": "error", "actions": []}
            
            content_parts = []
            
            if metadata:
                os_type = platform.system()
                os_version = platform.version()
                screen_context = f"""SCREEN CONTEXT:
- Operating System: {os_type} {os_version}
- Screen Resolution: {metadata.get('screen_width', self.screen_size[0])}x{metadata.get('screen_height', self.screen_size[1])}
- Current Cursor Position: ({metadata.get('cursor_x', 0)}, {metadata.get('cursor_y', 0)})
- Cursor is marked with RED CIRCLE on the screenshot

"""
                content_parts.append(screen_context)
            
            if retry_info:
                content_parts.append(f"RETRY NOTICE: {retry_info}\n\n")
            
            if attachments:
                for att in attachments:
                    file_path = att.get('path')
                    if file_path and os.path.exists(file_path):
                        ext = file_path.split('.')[-1].lower()
                        
                        # Image MIME types
                        image_mime_types = {
                            'png': 'image/png', 
                            'jpg': 'image/jpeg', 
                            'jpeg': 'image/jpeg', 
                            'webp': 'image/webp',
                            'gif': 'image/gif',
                            'bmp': 'image/bmp'
                        }
                        
                        if ext in image_mime_types:
                            # Handle image files
                            try:
                                with open(file_path, 'rb') as f:
                                    image_data = f.read()
                                content_parts.append({
                                    "mime_type": image_mime_types[ext],
                                    "data": image_data
                                })
                                logger.info(f"Added image attachment to LLM: {att.get('name', 'unknown')} ({len(image_data)} bytes)")
                            except Exception as e:
                                logger.error(f"Failed to read image attachment {file_path}: {e}")
                        
                        elif ext == 'pdf':
                            # Handle PDF files
                            try:
                                with open(file_path, 'rb') as f:
                                    pdf_data = f.read()
                                content_parts.append({
                                    "mime_type": "application/pdf",
                                    "data": pdf_data
                                })
                                logger.info(f"Added PDF attachment to LLM: {att.get('name', 'unknown')} ({len(pdf_data)} bytes)")
                            except Exception as e:
                                logger.error(f"Failed to read PDF attachment {file_path}: {e}")
                        
                        else:
                            # Handle text files (default fallback)
                            try:
                                with open(file_path, 'r', encoding='utf-8') as f:
                                    text_content = f.read()
                                # Include text content directly in the prompt with clear delimiters
                                content_parts.append(f"\n--- Attached File: {att.get('name', 'file')} ---\n{text_content}\n--- End of Attached File ---\n")
                                logger.info(f"Added text attachment to LLM: {att.get('name', 'unknown')} ({len(text_content)} chars)")
                            except Exception as e:
                                logger.warning(f"Could not read attachment as text: {e}")
                    else:
                        logger.warning(f"Attachment path missing or file does not exist: {att}")
            
            content_parts.append(prompt)
            
            if screenshot_path and os.path.exists(screenshot_path):
                with open(screenshot_path, 'rb') as f:
                    image_data = f.read()
                content_parts.append({
                    "mime_type": "image/png",
                    "data": image_data
                })
            
            response = self.model.generate_content(content_parts)
            response_text = response.text.strip()
            
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    json_str = json_match.group()
                else:
                    raise ValueError("No JSON found")
            
            llm_response = json.loads(json_str)
            logger.info("LLM response received: %s", json.dumps(llm_response)[:1000])

            if not isinstance(llm_response, dict) or 'type' not in llm_response:
                logger.error("LLM returned invalid structure, missing 'type'. Raw response: %s", response_text)
                return {"status": "error", "actions": []}

            if llm_response.get('type') == 'task':
                actions = llm_response.get('actions')
                if not isinstance(actions, list) or len(actions) == 0:
                    logger.error("LLM task response missing actions. Raw: %s", response_text)
                    return {"status": "error", "actions": []}

                for a in actions:
                    if not isinstance(a, dict) or 'action' not in a or 'description' not in a:
                        logger.error("LLM action item malformed: %s", json.dumps(a))
                        return {"status": "error", "actions": []}

            return llm_response
        
        except Exception as e:
            logger.error(f"LLM error: {e}")
            error_str = str(e).lower()
            if 'quota' in error_str or 'exceeded' in error_str or '429' in error_str:
                self.frontend.send_error("Unable to connect to AI. Please try again later.")
            return {"status": "error", "actions": []}
    
    def execute_task(self, user_request: str, attachments: list = None) -> None:
        print(f"\n{'='*80}")
        print(f" REQUEST: {user_request}")
        if attachments:
            print(f" ATTACHMENTS: {len(attachments)} file(s)")
        print(f"{'='*80}\n")
        
        self.frontend.send_task_start(user_request)
        try:
            self.frontend.send_action_start(user_request)
        except Exception as e:
            logger.error(f"Failed to send action_start: {e}")
        
        screenshot_path, metadata = self.take_screenshot()
        if not screenshot_path:
            print("[ERROR] Cannot capture initial screenshot\n")
            self.frontend.send_error("Cannot capture initial screenshot")
            return
        
        print(f"[SCREEN] {metadata['screen_width']}x{metadata['screen_height']} | Cursor: ({metadata['cursor_x']}, {metadata['cursor_y']})\n")
        
        print(f"[SCREEN] {metadata['screen_width']}x{metadata['screen_height']} | Cursor: ({metadata['cursor_x']}, {metadata['cursor_y']})\n")
        
        prompt = f"""User Request: {user_request}

Analyze the current screen state and the user request.
Provide a step-by-step PLAN to execute this task.
Respond with the JSON TASK structure defined in the system prompt."""
        
        initial_response = self.send_to_llm(prompt, screenshot_path, metadata, attachments=attachments)
        
        if initial_response.get('status') == 'error':
            print(f"[ERROR] Failed to process request\n")
            self.frontend.send_error("Failed to process request")
            self.cleanup_screenshots()
            return
        
        if initial_response.get('type') != 'task':
             print(f"[ERROR] LLM did not return a task plan. Response type: {initial_response.get('type')}\n")
             self.frontend.send_error("I can only perform actions in Act mode. Please switch to Ask mode for questions.")
             self.cleanup_screenshots()
             return

        print(f"[TYPE] Task detected\n")
        self._execute_task_with_verification(user_request, initial_response, screenshot_path, metadata)
    
    def _execute_task_with_verification(self, task: str, llm_response: Dict[str, Any], initial_screenshot: str, initial_metadata: Dict[str, Any]) -> None:
        """Execute task with per-action verification"""
        analysis = llm_response.get('analysis', '')
        plan = llm_response.get('plan', '')
        actions = llm_response.get('actions', [])
        
        print(f"[ANALYSIS] {analysis}\n")
        print(f"[PLAN] {plan}\n")
        print(f"[EXECUTING] {len(actions)} steps with verification\n")
        
        self.frontend.send_action_start(f"{task} ({len(actions)} steps)")
        step_results = []
        current_step = 0
        ui_context = {}
        task_success = True
        
        while current_step < len(actions):
            if self.stop_event.is_set():
                print(f"\n{'='*80}")
                print(f" [CANCELLED] Task stopped by user")
                print(f"{'='*80}\n")
                self.frontend.send_action_complete(task, False, "Task cancelled by user")
                self.frontend.send_task_complete(task, False)
                return

            action = actions[current_step]
            step_num = current_step + 1
            
            print(f"\n{'─'*80}")
            print(f"[STEP {step_num}/{len(actions)}] {action.get('description', 'Executing action')}")
            print(f"{'─'*80}")
            
            self.frontend.send_message("action_step", {
                "step": step_num,
                "total_steps": len(actions),
                "description": action.get('description', 'Executing action'),
                "action_type": action.get('action')
            })
            
            result = self.execute_action_with_verification(action, attempt=step_num)
            
            step_results.append({
                "step": step_num,
                "action": action,
                "result": result,
                "verified": result.get('verified', False)
            })
            
            if action.get('action') == 'analyze_ui' and result.get('success'):
                ui_context['ui_elements'] = result.get('result', {}).get('ui_elements', [])
                ui_context['layout'] = result.get('result', {}).get('layout', '')
                print(f"[CONTEXT] Stored {len(ui_context.get('ui_elements', []))} UI elements for reference")
            
            if result.get('success') and result.get('verified', True):
                print(f"[STEP_COMPLETE] ✓ Step {step_num} verified successfully")
                current_step += 1
            else:
                print(f"[STEP_FAILED] ✗ Step {step_num} could not be completed")
                task_success = False
                
                print(f"\n[RECOVERY] Requesting alternative approach...")
                recovery_screenshot, recovery_metadata = self.take_screenshot()
                
                recovery_prompt = f"""Task: {task}

Action that failed:
Step {step_num}: {action.get('description')}
Action type: {action.get('action')}
Parameters: {json.dumps(action.get('parameters', {}))}

Failure reason: {result.get('message')}
Verification details: {json.dumps(result.get('verification', {}), indent=2)}

Current UI context: {json.dumps(ui_context, indent=2) if ui_context else "No UI context available"}

Remaining steps: {len(actions) - current_step}

Provide an alternative approach to complete this specific step and continue the task.
Try a completely different method if possible.

Respond ONLY with JSON for a TASK with NEW actions starting from the failed step:
{{
  "type": "task",
  "recovery_strategy": "Explanation of new approach",
  "actions": [...]
}}"""
                
                recovery_response = self.send_to_llm(recovery_prompt, recovery_screenshot, recovery_metadata)
                
                if recovery_response.get('status') != 'error' and recovery_response.get('type') == 'task':
                    recovery_actions = recovery_response.get('actions', [])
                    recovery_strategy = recovery_response.get('recovery_strategy', 'Trying alternative approach')
                    
                    print(f"[RECOVERY_PLAN] {recovery_strategy}")
                    print(f"[NEW_ACTIONS] {len(recovery_actions)} alternative steps\n")
                    
                    actions = actions[:current_step] + recovery_actions
                else:
                    print(f"[ERROR] Could not generate recovery plan. Aborting task.\n")
                    break
            
            time.sleep(0.3)
        
        print(f"\n{'='*80}")
        print(f" FINAL VERIFICATION")
        print(f"{'='*80}\n")
        
        if task_success:
            completion_message = f"Task completed successfully in {len(actions)} steps"
            self.frontend.send_action_complete(task, True, completion_message)
            print(f"[SUCCESS] {completion_message}")
        else:
            completion_message = "Task could not be completed - recovery strategies exhausted"
            self.frontend.send_action_complete(task, False, completion_message)
            print(f"[FAILED] {completion_message}")
        
        final_screenshot, final_metadata = self.take_screenshot()
        
        completion_prompt = f"""Task was: {task}

All planned actions have been executed. Analyze the final state and confirm task completion.

Respond ONLY with JSON:
{{
  "type": "question",
  "response": "Your detailed assessment",
  "completed": true/false,
  "completion_percentage": 0-100,
  "state": "Current system state description",
  "status": "success|partial|failed",
  "remaining_work": "What still needs to be done (if any)"
}}"""
        
        verification = self.send_to_llm(completion_prompt, final_screenshot, final_metadata)
        
        completed = verification.get('completed', False)
        completion_pct = verification.get('completion_percentage', 0)
        status = verification.get('status', 'unknown')
        
        print(f"[COMPLETION] {'✓' if completed else '✗'} Task Completed: {completed}")
        print(f"[PROGRESS] {completion_pct}% complete")
        print(f"[STATUS] {status.upper()}")
        print(f"[STATE] {verification.get('state', 'Unknown')}")
        
        if verification.get('remaining_work'):
            print(f"[REMAINING] {verification.get('remaining_work')}")
        
        print(f"\n{'='*80}")
        print(f" EXECUTION SUMMARY")
        print(f"{'='*80}")
        print(f"Total Steps: {len(step_results)}")
        print(f"Verified: {sum(1 for r in step_results if r.get('verified', False))}")
        print(f"Failed: {sum(1 for r in step_results if not r.get('result', {}).get('success', False))}")
        print(f"Final Status: {status.upper()}")
        print(f"Completion: {completion_pct}%")
        print(f"{'='*80}\n")
        
        self.frontend.send_task_complete(task, completed)
        
        try:
            quota_issue = False
            for r in step_results:
                msg = r.get('result', {}).get('message', '') or ''
                if 'quota' in msg.lower() or 'exceeded' in msg.lower():
                    quota_issue = True
                    break
            if not quota_issue:
                vmsg = str(verification.get('state', '') or '')
                if 'quota' in vmsg.lower() or 'exceeded' in vmsg.lower():
                    quota_issue = True

            if quota_issue:
                err_msg = 'Task failed due to LLM quota limits. Please check API usage or try again later.'
                self.frontend.send_response(err_msg, is_action=False)
                self.frontend.send_error(err_msg)
            final_response = verification.get('response', 'Task execution completed.')
            self.frontend.send_response(final_response, is_action=True)
        except Exception as e:
            logger.error(f"Failed to send final response: {e}")
            self.frontend.send_response('Task execution completed.', is_action=True)
        
        self.cleanup_screenshots()
    
    def run_frontend_loop(self) -> None:
        """Run in frontend communication mode"""
        print("\n" + "="*80)
        print(" Control - Frontend Integration Mode")
        print("="*80)
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
                                if self.execution_thread and self.execution_thread.is_alive():
                                    self.frontend.send_error("Agent is busy with another task")
                                    continue

                                self.stop_event.clear()
                                # The 'request' object from backend-manager now contains the task, e.g. { "text": "...", "attachments": [...] }
                                req_data = request.get('request', {})
                                text = ""
                                attachments = []
                                
                                if isinstance(req_data, dict):
                                    text = req_data.get('text', '') or ''
                                    attachments = req_data.get('attachments', [])
                                elif isinstance(req_data, str):
                                    text = req_data
                                else:
                                    text = str(req_data)

                                if text:
                                    self.execution_thread = threading.Thread(
                                        target=self.execute_task,
                                        args=(text, attachments)
                                    )
                                    self.execution_thread.daemon = True
                                    self.execution_thread.start()
                            
                            elif request.get('type') == 'cancel_task':
                                logger.info("Received cancel request")
                                self.stop_event.set()
                        
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
        backend = ComputerUseAgentBackend()
        backend.run_frontend_loop()
    except Exception as e:
        print(f"[FATAL] {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()