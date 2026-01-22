#!/usr/bin/env python3
"""
Ask Backend - Enhanced with System Analysis Capabilities
Handles queries using Gemini with AI-driven screenshot and command requests.
"""

import sys
import json
import os
import logging
import subprocess
import re
import platform
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, Tuple

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        pass
    print("Warning: python-dotenv not found. Please install: pip install python-dotenv", file=sys.stderr)

try:
    import google.generativeai as genai
except ImportError:
    genai = None
    print("Warning: google.generativeai not found. Please install: pip install google-generativeai", file=sys.stderr)

try:
    import mss
    from PIL import Image
    import io as bytes_io
    SCREENSHOT_AVAILABLE = True
except ImportError:
    SCREENSHOT_AVAILABLE = False
    print("Warning: mss or PIL not found. Screenshot capability disabled.", file=sys.stderr)

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [ASK] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger(__name__)

OS_TYPE = platform.system()

SYSTEM_PROMPT = f"""You are Control (Ask Mode), an intelligent AI assistant.

**YOUR ROLE:**
- Answer user questions clearly and concisely
- Assist with coding, general knowledge, and explanations
- Analyze images, PDFs, and file attachments users send
- **Analyze what's visible on the user's screen** when needed
- **Check system status** (battery, memory, processes, etc.) when needed

**CURRENT OS:** {OS_TYPE}

**TOOLS AVAILABLE:**
You can request information by including these tags in your response:

1. **Screenshot Request** - To see what's on the user's screen:
   `[REQUEST_SCREENSHOT]`

2. **Command Request** - To run a system command (READ-ONLY queries only):
   `[REQUEST_COMMAND: <command>]`
   
   Examples for {OS_TYPE}:
   - Battery: `[REQUEST_COMMAND: powershell (Get-WmiObject Win32_Battery).EstimatedChargeRemaining]` (Windows)
   - Memory: `[REQUEST_COMMAND: powershell Get-Process | Sort-Object -Property WS -Descending | Select-Object -First 5 Name,WS]` (Windows)
   - Disk: `[REQUEST_COMMAND: powershell Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free]` (Windows)
   - Processes: `[REQUEST_COMMAND: tasklist /FI "STATUS eq RUNNING" /NH]` (Windows)
   - Battery: `[REQUEST_COMMAND: pmset -g batt]` (macOS)
   - Memory: `[REQUEST_COMMAND: top -l 1 | head -10]` (macOS)
   - Battery: `[REQUEST_COMMAND: cat /sys/class/power_supply/BAT0/capacity]` (Linux)

**WORKFLOW:**
1. If user asks about their screen → Request a screenshot first
2. If user asks about system status → Request appropriate command
3. When you receive the result, analyze it and respond to the user
4. You can make multiple requests if needed

**IMPORTANT:**
- You only OBSERVE and INFORM - you do NOT perform actions
- Only use read-only commands (no writes, deletes, or system changes)
- If user asks for actions (e.g., "open Chrome"), explain they should switch to Act mode

**RESPONSE FORMAT:**
- Chat directly with the user using Markdown
- Be helpful and friendly
- When you have enough information, provide your answer directly (no special tags)
"""

class AskBackend:
    def __init__(self):
        self.running = True
        self.max_loop_iterations = 5
        self.sct = None
        
        if SCREENSHOT_AVAILABLE:
            self.sct = mss.mss()
        
        self.setup_gemini_api()
        logger.info("Ask Backend initialized with system analysis capabilities")

    def setup_gemini_api(self):
        if genai is None:
            logger.error("google.generativeai not available. Please install: pip install google-generativeai")
            self.model = None
            return
        
        api_key = os.getenv('GEMINI_FREE_KEY')
        if not api_key:
            logger.warning("No API key found in GEMINI_FREE_KEY")
        
        try:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-2.5-flash', 
                                             system_instruction=SYSTEM_PROMPT)
            logger.info("Gemini API configured")
        except Exception as e:
            logger.error(f"API Setup Error: {e}")
            self.model = None

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
            logger.error(f"Failed to send message: {e}")

    def take_screenshot(self) -> Optional[bytes]:
        if not SCREENSHOT_AVAILABLE or not self.sct:
            logger.warning("Screenshot not available")
            return None
        
        try:
            monitor = self.sct.monitors[0]
            screenshot = self.sct.grab(monitor)
            
            img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
            
            buffer = bytes_io.BytesIO()
            img.save(buffer, format='PNG')
            image_data = buffer.getvalue()
            
            logger.info(f"Screenshot captured: {len(image_data)} bytes")
            return image_data
        except Exception as e:
            logger.error(f"Screenshot failed: {e}")
            return None

    def run_system_command(self, command: str) -> str:
        try:
            logger.info(f"Running command: {command}")
            
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            output = result.stdout.strip()
            if result.stderr:
                output += f"\n[stderr]: {result.stderr.strip()}"
            
            if not output:
                output = "(No output)"
            
            logger.info(f"Command output: {output[:200]}...")
            return output
        except subprocess.TimeoutExpired:
            return "[Error: Command timed out after 10 seconds]"
        except Exception as e:
            logger.error(f"Command failed: {e}")
            return f"[Error: {str(e)}]"

    def parse_ai_response(self, response_text: str) -> Tuple[Optional[str], Optional[str], str]:
        screenshot_match = re.search(r'\[REQUEST_SCREENSHOT\]', response_text)
        command_match = re.search(r'\[REQUEST_COMMAND:\s*(.+?)\]', response_text)
        
        request_type = None
        request_data = None
        
        if screenshot_match:
            request_type = "screenshot"
        elif command_match:
            request_type = "command"
            request_data = command_match.group(1).strip()
        
        clean_text = re.sub(r'\[REQUEST_SCREENSHOT\]', '', response_text)
        clean_text = re.sub(r'\[REQUEST_COMMAND:\s*.+?\]', '', clean_text)
        clean_text = clean_text.strip()
        
        return request_type, request_data, clean_text

    def process_request(self, user_request: str, attachments: list = None):
        if not self.model:
            self.send_message("ai_response", {
                "text": "Error: AI model not configured.",
                "is_action": False
            })
            return

        try:
            conversation_parts = []
            
            if attachments:
                for att in attachments:
                    file_path = att.get('path')
                    if file_path and os.path.exists(file_path):
                        ext = file_path.split('.')[-1].lower()
                        
                        image_mime_types = {
                            'png': 'image/png', 
                            'jpg': 'image/jpeg', 
                            'jpeg': 'image/jpeg', 
                            'webp': 'image/webp',
                            'gif': 'image/gif',
                            'bmp': 'image/bmp'
                        }
                        
                        if ext in image_mime_types:
                            try:
                                with open(file_path, 'rb') as f:
                                    image_data = f.read()
                                conversation_parts.append({
                                    "mime_type": image_mime_types[ext],
                                    "data": image_data
                                })
                                logger.info(f"Added image attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.error(f"Failed to read image: {e}")
                        
                        elif ext == 'pdf':
                            try:
                                with open(file_path, 'rb') as f:
                                    pdf_data = f.read()
                                conversation_parts.append({
                                    "mime_type": "application/pdf",
                                    "data": pdf_data
                                })
                                logger.info(f"Added PDF attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.error(f"Failed to read PDF: {e}")
                        
                        else:
                            try:
                                with open(file_path, 'r', encoding='utf-8') as f:
                                    text_content = f.read()
                                conversation_parts.append(f"\n--- Attached File: {att.get('name', 'file')} ---\n{text_content}\n--- End ---\n")
                                logger.info(f"Added text attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.warning(f"Could not read as text: {e}")
            
            conversation_parts.append(f"User: {user_request}")
            
            iteration = 0
            while iteration < self.max_loop_iterations:
                iteration += 1
                logger.info(f"AI loop iteration {iteration}/{self.max_loop_iterations}")
                
                response = self.model.generate_content(conversation_parts)
                response_text = response.text.strip()
                
                logger.info(f"AI response: {response_text[:200]}...")
                
                request_type, request_data, clean_text = self.parse_ai_response(response_text)
                
                if request_type == "screenshot":
                    logger.info("AI requested screenshot")
                    
                    screenshot_data = self.take_screenshot()
                    if screenshot_data:
                        conversation_parts.append(f"Assistant: {clean_text}")
                        conversation_parts.append({
                            "mime_type": "image/png",
                            "data": screenshot_data
                        })
                        conversation_parts.append("System: Here is the requested screenshot of the user's screen.")
                    else:
                        conversation_parts.append(f"Assistant: {clean_text}")
                        conversation_parts.append("System: Screenshot capture failed. Please answer based on available information.")
                    
                    continue
                
                elif request_type == "command":
                    logger.info(f"AI requested command: {request_data}")
                    
                    command_output = self.run_system_command(request_data)
                    
                    conversation_parts.append(f"Assistant: {clean_text}")
                    conversation_parts.append(f"System: Command output:\n```\n{command_output}\n```")
                    
                    continue
                
                else:
                    self.send_message("ai_response", {
                        "text": response_text,
                        "is_action": False
                    })
                    return
            
            self.send_message("ai_response", {
                "text": "I apologize, but I couldn't complete the analysis within the allowed iterations. Please try a more specific question.",
                "is_action": False
            })

        except Exception as e:
            logger.error(f"Error processing request: {e}")
            error_str = str(e).lower()
            if 'quota' in error_str or 'exceeded' in error_str or '429' in error_str:
                user_message = "Unable to connect to AI. Please try again later."
            elif 'timeout' in error_str:
                user_message = "Request timed out. Please try again."
            elif 'network' in error_str or 'connection' in error_str:
                user_message = "Connection failed. Please check your internet."
            else:
                user_message = "I encountered an error. Please try again."
            
            self.send_message("error", {
                "message": user_message
            })

    def run_loop(self):
        logger.info("Ask Backend Ready")
        
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
                        
                        if request.get('type') == 'ask_question':
                            req_data = request.get('request', {})
                            user_query = ""
                            attachments = []
                            
                            if isinstance(req_data, dict):
                                user_query = req_data.get('text', '')
                                attachments = req_data.get('attachments', [])
                                logger.info(f"Parsed request: text_len={len(user_query)}, attachments={len(attachments)}")
                            elif isinstance(req_data, str):
                                user_query = req_data
                            else:
                                user_query = str(req_data)
                            
                            self.process_request(user_query, attachments)
                            
                    except json.JSONDecodeError as e:
                        logger.error(f"Invalid JSON: {e}")
                
                elif line.lower() in ['quit', 'exit', 'q']:
                    break
                    
            except KeyboardInterrupt:
                break
            except Exception as e:
                logger.error(f"Loop error: {e}")

if __name__ == "__main__":
    backend = AskBackend()
    backend.run_loop()
