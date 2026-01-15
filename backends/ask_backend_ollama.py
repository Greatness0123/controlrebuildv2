#!/usr/bin/env python3
"""
Ask Backend - Ollama Variant
Uses Ollama local API for questions and knowledge
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
    format='%(asctime)s - %(levelname)s - [ASK-OLLAMA] - %(message)s',
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
        self.setup_ollama_api()
        logger.info("Ask Backend (Ollama) initialized")

    def setup_ollama_api(self):
        ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')
        model_name = os.getenv('OLLAMA_MODEL', 'llama3.2')
        
        try:
            if requests is None:
                logger.error("requests library not available. Please install: pip install requests")
                self.ollama_url = None
                return
            
            self.ollama_url = ollama_url
            self.model_name = model_name
            response = requests.get(f"{ollama_url}/api/tags", timeout=5)
            if response.status_code == 200:
                logger.info("Ollama API configured")
            else:
                logger.warning(f"Ollama not responding at {ollama_url}")
        except Exception as e:
            logger.error(f"API Setup Error: {e}")
            self.ollama_url = None

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
        if not self.ollama_url:
            self.send_message("ai_response", {
                "text": "Error: Ollama not configured. Please ensure Ollama is running.",
                "is_action": False
            })
            return

        try:
            full_prompt = user_request
            
            if attachments:
                for att in attachments:
                    if att.get('path') and os.path.exists(att.get('path')):
                        ext = att.get('path').split('.')[-1].lower()
                        if ext in ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']:
                            try:
                                with open(att.get('path'), 'rb') as f:
                                    image_data = f.read()
                                image_b64 = base64.b64encode(image_data).decode('utf-8')
                                full_prompt += f"\n[Image attachment: {att.get('name', 'file')}]"
                                logger.info(f"Added image attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.error(f"Failed to read image attachment {att.get('path')}: {e}")
                        else:
                            try:
                                with open(att.get('path'), 'r', encoding='utf-8') as f:
                                    text_content = f.read()
                                full_prompt += f"\n[Attachment: {att.get('name', 'file')}]\n{text_content}\n"
                                logger.info(f"Added text attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.warning(f"Could not read attachment as text: {e}")
            
            payload = {
                "model": self.model_name,
                "prompt": full_prompt,
                "stream": False,
                "system": SYSTEM_PROMPT
            }
            
            if requests is None:
                logger.error("requests library not available. Please install: pip install requests")
                self.send_message("error", {
                    "message": "Error: requests library not available"
                })
                return
            
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
                timeout=120
            )
            
            if response.status_code != 200:
                logger.error(f"Ollama API error: {response.status_code} - {response.text}")
                self.send_message("error", {
                    "message": f"I encountered an error: {response.text}"
                })
                return
            
            result = response.json()
            response_text = result.get('response', '').strip()
            
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
        logger.info("Ask Backend (Ollama) Ready")
        
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

