#!/usr/bin/env python3
"""
Control Backend - Ollama Variant
Uses Ollama local API for GUI automation
"""

import sys
import json
import time
import logging
import os
import subprocess
import re
import base64
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
    import requests  # type: ignore
except ImportError:
    requests = None
    print("Warning: requests not found. Please install: pip install requests", file=sys.stderr)

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
        import pyautogui  # type: ignore
        GUI_AVAILABLE = True
    except ImportError:
        pyautogui = None
        GUI_AVAILABLE = False
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Please run: pip install -r requirements.txt", file=sys.stderr)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [CONTROL-OLLAMA] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('control_ollama.log')
    ]
)
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Control (Act Mode), an intelligent AI assistant designed for GUI automation and task execution.

**YOUR ROLE:**
- You are an AGENT that EXECUTES TASKS on the user's computer.
- You DO NOT answer general questions (e.g., "What is the capital of France?").
- If the request is a task (e.g., "Open Calculator", "Check emails"), EXECUTE IT immediately.
- If the request is a question, REJECT IT and ask the user to switch to "Ask" mode.

**RESPONSE FORMAT:**
- Always respond with a JSON object.
- If you can execute the task, provide the plan and actions.
- If it is not a task, return a specialized error/message.

**TASK RESPONSE FORMAT:**
{
  "type": "task",
  "analysis": "Current UI state and strategy (1 sentence)",
  "plan": "Step-by-step action plan",
  "actions": [
    {
      "step": 1,
      "description": "Action description",
      "action": "screenshot|click|type|key_press|double_click|mouse_move|drag|scroll|terminal|wait|focus_window|analyze_ui",
      "parameters": {},
      "verification": {
        "expected_outcome": "Specific change that should occur",
        "verification_method": "visual|terminal_output|window_check",
        "success_indicators": ["visual marker 1"]
      }
    }
  ]
}

**SCREEN COORDINATES:**
- Screen: (0,0) = top-left, max = bottom-right
- Cursor marked with RED CIRCLE on screenshots
- Use exact pixel coordinates from analyze_ui results
- Always validate coordinates are within screen bounds

**CRITICAL GUI EXECUTION RULES:**
1. ALWAYS start with analyze_ui to map interactive elements
2. Use EXACT coordinates from analyze_ui - never estimate
3. Focus window BEFORE clicking within it
4. VERIFY each action succeeds before proceeding
5. If verification fails 3x, try completely different approach
6. Re-analyze UI after state changes

**VERIFICATION RESPONSE FORMAT:**
{
  "verification_status": "success|failure|partial",
  "outcome_achieved": true/false,
  "observations": "What you observe on screen",
  "indicators_found": ["List of expected indicators you see"],
  "indicators_missing": ["Any indicators not visible"],
  "retry_suggestion": "Alternative approach if failed",
  "requires_reanalysis": true/false
}

**ACTION REFERENCE:**
- screenshot: Capture current screen with cursor
- analyze_ui: Map ALL interactive elements (MUST do first)
- click [x,y]: Single click at coordinates
- type text: Input text (use clear_first: true to replace)
- key_press: Keyboard shortcuts (ctrl+c, alt+tab, etc)
- focus_window app: Bring app to focus
- terminal command: Execute OS command
- wait duration: Pause for UI loading
"""


class FrontendIntegration:
    def __init__(self):
        self.message_queue = queue.Queue()
        self.is_running = False
        
    def send_message(self, message_type: str, data: Any):
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
        self.send_message("action_start", {
            "description": description,
            "status": "running"
        })
    
    def send_action_complete(self, description: str, success: bool, details: str = ""):
        self.send_message("action_complete", {
            "description": description,
            "success": success,
            "details": details,
            "status": "completed" if success else "failed"
        })
    
    def send_response(self, response: str, is_action: bool = False):
        self.send_message("ai_response", {
            "text": response,
            "is_action": is_action
        })
    
    def send_error(self, error: str):
        self.send_message("error", {
            "message": error
        })
    
    def send_task_start(self, task: str):
        self.send_message("task_start", {
            "task": task,
            "show_effects": True
        })
    
    def send_task_complete(self, task: str, success: bool):
        self.send_message("task_complete", {
            "task": task,
            "success": success
        })


class ActionVerifier:
    def __init__(self, api_call_func, screenshot_func, get_metadata_func):
        self.api_call = api_call_func
        self.take_screenshot = screenshot_func
        self.get_metadata = get_metadata_func
    
    def verify_action(self, action: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
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
  "retry_suggestion": "If failed, specific suggestion for retry",
  "ui_changed": true/false,
  "requires_reanalysis": true/false
}}"""
            
            verification_response = self.api_call(
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


class ComputerUseAgentBackend:
    def __init__(self):
        self.running = True
        self.screenshot_dir = project_root / "screenshots"
        self.screenshot_dir.mkdir(exist_ok=True)
        self.execution_history = []
        self.frontend = FrontendIntegration()
        self.screen_size = self.get_screen_size()
        self.setup_ollama_api()
        self.setup_computer_control()
        self.verifier = ActionVerifier(
            self.call_ollama_api,
            self.take_screenshot,
            lambda: {"screen_width": self.screen_size[0], "screen_height": self.screen_size[1]}
        )
        self.max_action_retries = 3
        self.verification_wait = 0.5
        logger.info(f"Control Backend (Ollama) initialized - Screen: {self.screen_size[0]}x{self.screen_size[1]}")
    
    def get_screen_size(self) -> Tuple[int, int]:
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
        try:
            if GUI_AVAILABLE and pyautogui:
                pos = pyautogui.position()
                return (pos.x, pos.y)
            return (0, 0)
        except:
            return (0, 0)
    
    def setup_ollama_api(self):
        ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')
        model_name = os.getenv('OLLAMA_MODEL', 'llama3.2-vision')
        
        try:
            if requests is None:
                logger.error("requests library not available. Please install: pip install requests")
                self.ollama_url = None
                return
            
            self.ollama_url = ollama_url
            self.model_name = model_name
            response = requests.get(f"{ollama_url}/api/tags", timeout=5)
            if response.status_code == 200:
                print("[API] Ollama API configured\n")
                logger.info("Ollama API configured")
            else:
                print(f"[API] WARNING: Ollama not responding at {ollama_url}\n")
                logger.warning(f"Ollama not responding at {ollama_url}")
        except Exception as e:
            print(f"[API] ERROR: {e}\n")
            logger.error(f"Ollama setup error: {e}")
            self.ollama_url = None
    
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
                             fill='red', width=3)
                    draw.line([cursor_x, cursor_y - radius - 5, cursor_x, cursor_y + radius + 5], 
                             fill='red', width=3)
                
                img.save(str(filepath))
            
            return str(filepath), {
                "screen_width": self.screen_size[0],
                "screen_height": self.screen_size[1],
                "cursor_x": cursor_x,
                "cursor_y": cursor_y
            }
        except Exception as e:
            logger.error(f"Screenshot error: {e}")
            return None, {}
    
    def call_ollama_api(self, prompt: str, screenshot_path: str = None, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        if not self.ollama_url:
            return {"status": "error", "actions": []}
        
        try:
            full_prompt = SYSTEM_PROMPT + "\n\n" + prompt
            
            if metadata:
                screen_context = f"""SCREEN CONTEXT:
- Screen Resolution: {metadata.get('screen_width', self.screen_size[0])}x{metadata.get('screen_height', self.screen_size[1])}
- Current Cursor Position: ({metadata.get('cursor_x', 0)}, {metadata.get('cursor_y', 0)})
- Cursor is marked with RED CIRCLE on the screenshot

"""
                full_prompt = screen_context + full_prompt
            
            payload = {
                "model": self.model_name,
                "prompt": full_prompt,
                "stream": False,
                "system": SYSTEM_PROMPT
            }
            
            if screenshot_path and os.path.exists(screenshot_path):
                with open(screenshot_path, 'rb') as f:
                    image_data = f.read()
                    image_b64 = base64.b64encode(image_data).decode('utf-8')
                    payload["images"] = [image_b64]
            
            if requests is None:
                logger.error("requests library not available. Please install: pip install requests")
                return {"status": "error", "actions": []}
            
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
                timeout=120
            )
            
            if response.status_code != 200:
                logger.error(f"Ollama API error: {response.status_code} - {response.text}")
                return {"status": "error", "actions": []}
            
            result = response.json()
            response_text = result.get('response', '').strip()
            
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
            logger.info("Ollama response received")
            
            if not isinstance(llm_response, dict) or 'type' not in llm_response:
                logger.error("Invalid response structure")
                return {"status": "error", "actions": []}
            
            if llm_response.get('type') == 'task':
                actions = llm_response.get('actions')
                if not isinstance(actions, list) or len(actions) == 0:
                    logger.error("Missing actions in response")
                    return {"status": "error", "actions": []}
                
                for a in actions:
                    if not isinstance(a, dict) or 'action' not in a or 'description' not in a:
                        logger.error("Malformed action item")
                        return {"status": "error", "actions": []}
            
            return llm_response
        
        except Exception as e:
            logger.error(f"Ollama API error: {e}")
            return {"status": "error", "actions": []}
    
    def execute_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        result = {"success": False, "message": ""}
        action_type = action.get('action')
        
        try:
            if action_type == 'screenshot':
                screenshot_path, metadata = self.take_screenshot()
                result["success"] = True
                result["message"] = f"Screenshot saved: {screenshot_path}"
            
            elif action_type == 'click' and GUI_AVAILABLE:
                params = action.get('parameters', {})
                x = params.get('x', 0)
                y = params.get('y', 0)
                pyautogui.click(x, y)
                result["success"] = True
                result["message"] = f"Clicked at ({x}, {y})"
            
            elif action_type == 'type' and GUI_AVAILABLE:
                params = action.get('parameters', {})
                text = params.get('text', '')
                if params.get('clear_first', False):
                    pyautogui.hotkey('ctrl', 'a')
                    time.sleep(0.1)
                pyautogui.write(text, interval=0.05)
                result["success"] = True
                result["message"] = f"Typed: {text}"
            
            elif action_type == 'key_press' and GUI_AVAILABLE:
                params = action.get('parameters', {})
                keys = params.get('keys', [])
                pyautogui.hotkey(*keys)
                result["success"] = True
                result["message"] = f"Pressed keys: {keys}"
            
            elif action_type == 'wait':
                params = action.get('parameters', {})
                duration = params.get('duration', 1.0)
                time.sleep(duration)
                result["success"] = True
                result["message"] = f"Waited {duration}s"
            
            elif action_type == 'terminal':
                params = action.get('parameters', {})
                command = params.get('command', '')
                process = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
                result["success"] = process.returncode == 0
                result["message"] = process.stdout or process.stderr or "Command executed"
            
            else:
                result["message"] = f"Unknown action: {action_type}"
        
        except Exception as e:
            result["message"] = str(e)
            logger.error(f"Action error: {e}")
        
        return result
    
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
        
        prompt = f"""User Request: {user_request}

Analyze the current screen state and the user request.
Provide a step-by-step PLAN to execute this task.
Respond with the JSON TASK structure defined in the system prompt."""
        
        initial_response = self.call_ollama_api(prompt, screenshot_path, metadata)
        
        if initial_response.get('status') == 'error':
            print(f"[ERROR] Failed to process request\n")
            self.frontend.send_error("Failed to process request")
            return
        
        if initial_response.get('type') != 'task':
            rejection_msg = initial_response.get('message', 'This is not a task. Please switch to Ask mode.')
            self.frontend.send_response(rejection_msg, is_action=False)
            return
        
        actions = initial_response.get('actions', [])
        print(f"[PLAN] {len(actions)} action(s) planned\n")
        
        for idx, action in enumerate(actions, 1):
            step = action.get('step', idx)
            description = action.get('description', 'Unknown action')
            print(f"[STEP {step}] {description}")
            
            self.frontend.send_action_start(description)
            
            for attempt in range(1, self.max_action_retries + 1):
                result = self.execute_action(action)
                
                if result.get('success'):
                    print(f"  ✓ Success: {result.get('message')}")
                    time.sleep(self.verification_wait)
                    verification = self.verifier.verify_action(action, result)
                    
                    if verification.get('verified'):
                        print(f"  ✓ Verified\n")
                        self.frontend.send_action_complete(description, True, verification.get('message', ''))
                        break
                    else:
                        if attempt < self.max_action_retries:
                            print(f"  ⚠ Verification failed, retrying...")
                            if verification.get('requires_reanalysis'):
                                screenshot_path, metadata = self.take_screenshot()
                        else:
                            print(f"  ✗ Verification failed after {self.max_action_retries} attempts\n")
                            self.frontend.send_action_complete(description, False, verification.get('message', ''))
                else:
                    if attempt < self.max_action_retries:
                        print(f"  ⚠ Failed: {result.get('message')}, retrying...")
                    else:
                        print(f"  ✗ Failed after {self.max_action_retries} attempts: {result.get('message')}\n")
                        self.frontend.send_action_complete(description, False, result.get('message', ''))
        
        self.frontend.send_task_complete(user_request, True)
        self.frontend.send_response('Task execution completed.', is_action=True)
    
    def run_frontend_loop(self) -> None:
        print("\n" + "="*80)
        print(" Control - Ollama Backend (Frontend Mode)")
        print("="*80)
        print("Ready for frontend communication...")
        print(f"Screen: {self.screen_size[0]}x{self.screen_size[1]}")
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
        backend = ComputerUseAgentBackend()
        backend.run_frontend_loop()
    except Exception as e:
        print(f"[FATAL] {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()

