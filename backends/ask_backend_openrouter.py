#!/usr/bin/env python3
"""
Ask Backend - OpenRouter Variant (X AI Model)
Uses OpenRouter API with X AI free model for questions and knowledge
"""

import sys
import json
import os
import logging
import base64
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

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

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [ASK-OPENROUTER] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Control (Ask Mode), an intelligent AI assistant.

**YOUR ROLE:**
- Answer user questions clearly and concisely.
- Assist with coding, general knowledge, and explanations.
- You CAN process and analyze images, PDFs, and other file attachments that users send.
- When users attach images or files, analyze them and provide helpful information about their contents.
- You do NOT have access to computer control tools in this mode.
- If the user asks for a computer action (e.g., "Open Chrome"), politely explain that they should switch to "Act" mode.

**RESPONSE FORMAT:**
- You are chatting directly with the user.
- Use Markdown for formatting.
- Be helpful and friendly.
- When analyzing attachments, describe what you see or understand from the files.
"""

class AskBackend:
    def __init__(self):
        self.running = True
        self.setup_openrouter_api()
        logger.info("Ask Backend (OpenRouter) initialized")

    def setup_openrouter_api(self):
        api_key = os.getenv('OPENROUTER_API_KEY')
        if not api_key:
            logger.warning("No API key found in OPENROUTER_API_KEY")
            self.api_key = None
            return
        
        try:
            self.api_key = api_key
            self.model_name = "x-ai/grok-beta"
            logger.info("OpenRouter API configured")
        except Exception as e:
            logger.error(f"API Setup Error: {e}")
            self.api_key = None

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

    def process_request(self, user_request: str, attachments: list = None):
        if not self.api_key:
            self.send_message("ai_response", {
                "text": "Error: AI model not configured.",
                "is_action": False
            })
            return

        try:
            messages = [{"role": "user", "content": []}]
            
            if attachments:
                for att in attachments:
                    if att.get('path') and os.path.exists(att.get('path')):
                        mime_types = {
                            'png': 'image/png', 
                            'jpg': 'image/jpeg', 
                            'jpeg': 'image/jpeg', 
                            'webp': 'image/webp',
                            'gif': 'image/gif',
                            'bmp': 'image/bmp'
                        }
                        ext = att.get('path').split('.')[-1].lower()
                        if ext in mime_types:
                            try:
                                with open(att.get('path'), 'rb') as f:
                                    image_data = f.read()
                                image_b64 = base64.b64encode(image_data).decode('utf-8')
                                messages[0]["content"].append({
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/{ext};base64,{image_b64}"}
                                })
                                logger.info(f"Added image attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.error(f"Failed to read image attachment {att.get('path')}: {e}")
                        elif ext == 'pdf':
                            try:
                                with open(att.get('path'), 'rb') as f:
                                    pdf_data = f.read()
                                pdf_b64 = base64.b64encode(pdf_data).decode('utf-8')
                                messages[0]["content"].append({
                                    "type": "text",
                                    "text": f"[PDF Attachment: {att.get('name', 'file')}]"
                                })
                                logger.info(f"Added PDF attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.error(f"Failed to read PDF attachment {att.get('path')}: {e}")
                        else:
                            try:
                                with open(att.get('path'), 'r', encoding='utf-8') as f:
                                    text_content = f.read()
                                messages[0]["content"].append({
                                    "type": "text",
                                    "text": f"\n[Attachment: {att.get('name', 'file')}]\n{text_content}\n"
                                })
                                logger.info(f"Added text attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.warning(f"Could not read attachment as text: {e}")
            
            messages[0]["content"].append({"type": "text", "text": user_request})

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/control-app",
                "X-Title": "Control App"
            }
            
            payload = {
                "model": self.model_name,
                "messages": messages,
                "system": SYSTEM_PROMPT
            }
            
            if requests is None:
                logger.error("requests library not available. Please install: pip install requests")
                self.send_message("error", {
                    "message": "Error: requests library not available"
                })
                return
            
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=60
            )
            
            if response.status_code != 200:
                logger.error(f"OpenRouter API error: {response.status_code} - {response.text}")
                self.send_message("error", {
                    "message": f"I encountered an error: {response.text}"
                })
                return
            
            result = response.json()
            response_text = result['choices'][0]['message']['content'].strip()
            
            self.send_message("ai_response", {
                "text": response_text,
                "is_action": False
            })

        except Exception as e:
            logger.error(f"Error processing request: {e}")
            self.send_message("error", {
                "message": f"I encountered an error: {str(e)}"
            })

    def run_loop(self):
        logger.info("Ask Backend (OpenRouter) Ready")
        
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
                            user_query = request.get('request', '')
                            attachments = []
                            
                            if isinstance(user_query, dict):
                                attachments = user_query.get('attachments', [])
                                user_query = user_query.get('text', '')
                            
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

