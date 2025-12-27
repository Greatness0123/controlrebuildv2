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

SYSTEM_PROMPT = """You are Control, an intelligent AI assistant that can:
1. ANSWER QUESTIONS: Respond to queries, provide information, explanations
2. EXECUTE TASKS: Control computer - click, type, open apps, manipulate files

**SCREEN CONTEXT:**
You will receive screen dimensions (width x height) and cursor position (x, y) with each screenshot.
- Use these to understand the available screen space
- Cursor position shows where the user's mouse currently is
- Calculate coordinates precisely within the screen bounds (0,0 is top-left, max is bottom-right)
- The cursor is marked with a RED CIRCLE on screenshots for visual reference

**DETERMINE REQUEST TYPE:**
- QUESTION: "What is X?", "How do I?", "Explain", "Tell me about", "Why is", "Information requests"
  → Respond naturally with information/explanation
- TASK: "Open X", "Create Y", "Send message", "Move file", "Click button", "Action requests" e.t.c
  → Execute computer actions

**FOR QUESTIONS - RESPOND WITH:**
{
  "type": "question",
  "response": "Your detailed answer to the user",
  "requires_action": false
}

**FOR TASKS - RESPOND WITH:**
{
  "type": "task",
  "analysis": "Brief analysis of current state, cursor position, and optimal approach",
  "plan": "Concise step-by-step plan",
  "actions": [
    {
      "step": 1,
      "description": "Brief description",
      "action": "screenshot|click|type|key_press|double_click|mouse_move|drag|scroll|terminal|wait|focus_window|analyze_ui",
      "parameters": {},
      "verification": {
        "expected_outcome": "What should happen after this action",
        "verification_method": "visual|terminal_output|window_check",
        "success_indicators": ["indicator1", "indicator2"]
      }
    }
  ]
}

**CRITICAL: VERIFICATION REQUIREMENTS**
Every action MUST include verification details:
- expected_outcome: Clear description of what should change
- verification_method: How to verify (visual check, terminal output, etc.)
- success_indicators: Specific things to look for (button appeared, text changed, window opened, etc.)

**TASK PRINCIPLES:**
- System Tasks (OS level): Use terminal for opening apps, file operations, folder manipulation, system commands
- Application Tasks: Simulate real user - click, type, shortcuts
- **MANDATORY WORKFLOW FOR ALL UI INTERACTIONS**: 
  1. focus_window - Ensure correct app is focused
  2. analyze_ui - Map ALL interactive elements with coordinates
  3. Execute action using coordinates from analyze_ui
  4. VERIFY success before proceeding to next action
- ALWAYS re-analyze UI if verification fails or UI state changes
- Each action must be verified before moving to next step
- If verification fails, retry action up to 3 times with UI reanalysis
- COORDINATE PRECISION: Always use fresh analyze_ui results
- Never proceed if verification shows failure

**ACTIONS:**
1. screenshot - Capture screen with cursor. params: {}
2. analyze_ui - Analyze application UI and map elements. params: {"app_name": "Chrome", "elements_to_find": ["search bar", "buttons"], "full_analysis": true}
   - full_analysis: if true, maps entire screen comprehensively
3. click - Single click. params: {"coordinates": [x, y]}
4. double_click - Double click. params: {"coordinates": [x, y]}
5. mouse_move - Move cursor. params: {"coordinates": [x, y]}
6. drag - Click and drag. params: {"coordinates": [x, y], "end_coordinates": [x2, y2], "duration": 0.5}
7. scroll - Scroll wheel. params: {"coordinates": [x, y], "direction": "up|down", "amount": 3}
8. type - Type text. params: {"text": "hello", "clear_first": false}
9. key_press - Keys/shortcuts. params: {"keys": ["ctrl", "a"], "combo": true}
10. terminal - OS command. params: {"command": "command"}
11. wait - Pause. params: {"duration": 1}
12. focus_window - Switch to app window. params: {"app_name": "Chrome", "method": "alt_tab|search|terminal", "verify_focus": true}

**VERIFICATION RESPONSE FORMAT:**
When asked to verify an action, respond with:
{
  "verification_status": "success|failure|partial",
  "outcome_achieved": true/false,
  "observations": "What you see on screen",
  "indicators_found": ["list of success indicators found"],
  "indicators_missing": ["list of expected indicators not found"],
  "retry_suggestion": "If failed, what to try differently",
  "ui_changed": true/false,
  "requires_reanalysis": true/false
}

**RULES:**
- ALWAYS verify each action before proceeding
- Re-analyze UI if verification shows changes or failures
- Never use stale coordinates - always get fresh analyze_ui before clicking
- Maximum 3 retries per action with fresh analysis each time
- If action repeatedly fails, try completely different approach
- Speed is secondary to correctness and verification"""


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
            # Send to stdout for frontend to capture
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
                # No verification specified, assume success
                return {
                    "verified": True,
                    "status": "success",
                    "message": "No verification specified, assuming success"
                }
            
            # Take screenshot after action
            screenshot_path, metadata = self.take_screenshot()
            
            # Build verification prompt
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
            
            # Use simple content for verification (no system context needed)
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
            
            # Add screen context
            screen_context = f"""SCREEN CONTEXT:
- Screen: {metadata.get('screen_width')}x{metadata.get('screen_height')}
- Cursor: ({metadata.get('cursor_x')}, {metadata.get('cursor_y')})

"""
            content_parts.append(screen_context + prompt)
            
            # Add screenshot
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
        
        # Frontend integration
        self.frontend = FrontendIntegration()
        
        # Get screen size
        self.screen_size = self.get_screen_size()
        
        self.setup_gemini_api()
        self.setup_computer_control()
        
        # Initialize verifier
        self.verifier = ActionVerifier(
            self.model,
            self.take_screenshot,
            lambda: {"screen_width": self.screen_size[0], "screen_height": self.screen_size[1]}
        )
        
        # Configuration
        self.max_action_retries = 3  # Retries per individual action
        self.verification_wait = 0.5  # Wait before verification
        
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
                pyautogui.FAILSAFE = True
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
                
                # If verification suggested reanalysis, do it
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
                        # Update action with new coordinates if applicable
                        if reanalysis_result.get('ui_elements'):
                            print(f"[REANALYSIS] Found {len(reanalysis_result['ui_elements'])} elements")
                            # Store for potential coordinate updates
                            ui_context['ui_elements'] = reanalysis_result['ui_elements']
            
            # Notify frontend of action start
            self.frontend.send_action_start(action.get('description', 'Executing action'))
            
            # Execute the action
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
            
            # Wait before verification
            time.sleep(self.verification_wait)
            
            # Verify the action
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
            
            elif action_type == 'analyze_ui':
                app_name = params.get('app_name', 'application')
                elements_to_find = params.get('elements_to_find', ['buttons', 'input fields'])
                full_analysis = params.get('full_analysis', True)
                
                screenshot_path, metadata = self.take_screenshot()
                
                analysis_prompt = f"""Analyze the '{app_name}' application UI.

{"Perform COMPREHENSIVE analysis of ALL interactive elements on screen." if full_analysis else f"Focus on finding: {', '.join(elements_to_find)}"}

For EACH interactive element, provide:
1. Element name/description
2. EXACT coordinates [x, y] for clicking
3. Element type
4. Current state
5. Location description (top-left, center, bottom-right, etc.)

Be EXTREMELY PRECISE with coordinates. Consider screen dimensions: {metadata['screen_width']}x{metadata['screen_height']}

Respond ONLY with JSON:
{{
  "ui_elements": [
    {{
      "name": "Element name",
      "type": "button|input|link|icon|menu",
      "coordinates": [x, y],
      "state": "enabled|disabled|focused",
      "description": "Detailed description and location"
    }}
  ],
  "app_ready": true/false,
  "layout_description": "Overall UI layout description",
  "notes": "Any important observations"
}}"""
                
                ui_analysis = self.send_to_llm(analysis_prompt, screenshot_path, metadata)
                
                if ui_analysis.get('status') != 'error':
                    ui_elements = ui_analysis.get('ui_elements', [])
                    result["success"] = True
                    result["message"] = f"Found {len(ui_elements)} UI elements"
                    result["screenshot"] = screenshot_path
                    result["metadata"] = metadata
                    result["ui_elements"] = ui_elements
                    result["layout"] = ui_analysis.get('layout_description', '')
                else:
                    result["message"] = "Failed to analyze UI"
            
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
                    x, y = params.get('coordinates', [0, 0])
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
                    start_x, start_y = params.get('coordinates', [0, 0])
                    end_x, end_y = params.get('end_coordinates', [0, 0])
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
            
            else:
                result["message"] = f"Unknown action: {action_type}"
        
        except Exception as e:
            result["message"] = str(e)
            logger.error(f"Action error: {e}")
        
        return result
    
    def send_to_llm(self, prompt: str, screenshot_path: str = None, metadata: Dict[str, Any] = None, retry_info: str = None) -> Dict[str, Any]:
        try:
            if not self.model:
                return {"status": "error", "actions": []}
            
            content_parts = []
            
            if metadata:
                screen_context = f"""SCREEN CONTEXT:
- Screen Resolution: {metadata.get('screen_width', self.screen_size[0])}x{metadata.get('screen_height', self.screen_size[1])}
- Current Cursor Position: ({metadata.get('cursor_x', 0)}, {metadata.get('cursor_y', 0)})
- Cursor is marked with RED CIRCLE on the screenshot

"""
                content_parts.append(screen_context)
            
            if retry_info:
                content_parts.append(f"RETRY NOTICE: {retry_info}\n\n")
            
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
            logger.info("LLM response received")
            return llm_response
        
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return {"status": "error", "actions": []}
    
    def execute_task(self, user_request: str) -> None:
        print(f"\n{'='*80}")
        print(f" REQUEST: {user_request}")
        print(f"{'='*80}\n")
        
        # Notify frontend of task start
        self.frontend.send_task_start(user_request)
        
        screenshot_path, metadata = self.take_screenshot()
        if not screenshot_path:
            print("[ERROR] Cannot capture initial screenshot\n")
            self.frontend.send_error("Cannot capture initial screenshot")
            return
        
        print(f"[SCREEN] {metadata['screen_width']}x{metadata['screen_height']} | Cursor: ({metadata['cursor_x']}, {metadata['cursor_y']})\n")
        
        prompt = f"""User Request: {user_request}

Determine if this is a QUESTION or a TASK:
- QUESTION: Information request, explanation, asking for knowledge 
- TASK: Action request, computer control needed

Respond with appropriate JSON format with verification details for tasks."""
        
        initial_response = self.send_to_llm(prompt, screenshot_path, metadata)
        
        if initial_response.get('status') == 'error':
            print(f"[ERROR] Failed to process request\n")
            self.frontend.send_error("Failed to process request")
            self.cleanup_screenshots()
            return
        
        request_type = initial_response.get('type', 'unknown')
        
        if request_type == 'question':
            print(f"[TYPE] Question detected\n")
            response = initial_response.get('response', '')
            print(f"[ANSWER]\n{response}\n")
            print(f"{'='*80}\n")
            
            # Send response to frontend
            self.frontend.send_response(response, is_action=False)
            self.cleanup_screenshots()
            return
        
        elif request_type == 'task':
            print(f"[TYPE] Task detected\n")
            self._execute_task_with_verification(user_request, initial_response, screenshot_path, metadata)
        
        else:
            print(f"[ERROR] Unknown request type: {request_type}\n")
            self.frontend.send_error(f"Unknown request type: {request_type}")
            self.cleanup_screenshots()
    
    def _execute_task_with_verification(self, task: str, llm_response: Dict[str, Any], initial_screenshot: str, initial_metadata: Dict[str, Any]) -> None:
        """Execute task with per-action verification"""
        analysis = llm_response.get('analysis', '')
        plan = llm_response.get('plan', '')
        actions = llm_response.get('actions', [])
        
        print(f"[ANALYSIS] {analysis}\n")
        print(f"[PLAN] {plan}\n")
        print(f"[EXECUTING] {len(actions)} steps with verification\n")
        
        step_results = []
        current_step = 0
        ui_context = {}
        task_success = True
        
        while current_step < len(actions):
            action = actions[current_step]
            step_num = current_step + 1
            
            print(f"\n{'─'*80}")
            print(f"[STEP {step_num}/{len(actions)}] {action.get('description', 'Executing action')}")
            print(f"{'─'*80}")
            
            # Execute action with verification and retries
            result = self.execute_action_with_verification(action, attempt=step_num)
            
            step_results.append({
                "step": step_num,
                "action": action,
                "result": result,
                "verified": result.get('verified', False)
            })
            
            # Store UI context if this was an analyze_ui action
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
                
                # Ask LLM for recovery strategy
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
                    
                    # Replace remaining actions with recovery actions
                    actions = actions[:current_step] + recovery_actions
                    
                    # Continue with next step (don't increment current_step, retry same position)
                else:
                    print(f"[ERROR] Could not generate recovery plan. Aborting task.\n")
                    break
            
            time.sleep(0.3)
        
        # Final verification
        print(f"\n{'='*80}")
        print(f" FINAL VERIFICATION")
        print(f"{'='*80}\n")
        
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
        
        # Notify frontend of task completion
        self.frontend.send_task_complete(task, completed)
        
        # Send final response to frontend
        final_response = verification.get('response', 'Task execution completed.')
        self.frontend.send_response(final_response, is_action=True)
        
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
                    # Read from stdin for frontend messages
                    line = sys.stdin.readline()
                    if not line:
                        break
                    
                    line = line.strip()
                    if line.startswith('FRONTEND_REQUEST:'):
                        # Extract JSON request
                        try:
                            request_json = line[len('FRONTEND_REQUEST:'):].strip()
                            request = json.loads(request_json)
                            
                            # Support multiple request types from the frontend
                            if request.get('type') == 'execute_task':
                                user_request = request.get('request', '')
                                # If the request is an object with attachments, fold attachments into text context
                                if isinstance(user_request, dict):
                                    text = user_request.get('text', '') or ''
                                    attachments = user_request.get('attachments', [])
                                    if attachments:
                                        names = [a.get('name') for a in attachments]
                                        text = text + '\n\nAttachments: ' + ', '.join(names)
                                    self.execute_task(text)
                                else:
                                    if user_request:
                                        self.execute_task(user_request)
                        
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