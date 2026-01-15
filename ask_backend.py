#!/usr/bin/env python3
"""
Ask Backend - Specialized for Questions and Knowledge
Handles queries using Gemini without GUI automation tools.
"""

import sys
import json
import os
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:
    def load_dotenv():
        pass
    print("Warning: python-dotenv not found. Please install: pip install python-dotenv", file=sys.stderr)

try:
    import google.generativeai as genai  # type: ignore
except ImportError:
    genai = None
    print("Warning: google.generativeai not found. Please install: pip install google-generativeai", file=sys.stderr)

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Setup path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [ASK] - %(message)s',
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
        self.setup_gemini_api()
        logger.info("Ask Backend initialized")

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
        """Send message to frontend via stdout"""
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
        """Process a text request"""
        if not self.model:
            self.send_message("ai_response", {
                "text": "Error: AI model not configured.",
                "is_action": False
            })
            return

        try:
            content_parts = []
            
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
                                content_parts.append({
                                    "mime_type": mime_types[ext],
                                    "data": image_data
                                })
                                logger.info(f"Added image attachment: {att.get('name', 'unknown')} ({len(image_data)} bytes)")
                            except Exception as e:
                                logger.error(f"Failed to read image attachment {att.get('path')}: {e}")
                    elif att.get('path') and os.path.exists(att.get('path')):
                        ext = att.get('path').split('.')[-1].lower()
                        if ext == 'pdf':
                            try:
                                with open(att.get('path'), 'rb') as f:
                                    pdf_data = f.read()
                                content_parts.append({
                                    "mime_type": "application/pdf",
                                    "data": pdf_data
                                })
                                logger.info(f"Added PDF attachment: {att.get('name', 'unknown')} ({len(pdf_data)} bytes)")
                            except Exception as e:
                                logger.error(f"Failed to read PDF attachment {att.get('path')}: {e}")
                        else:
                            try:
                                # Try to read as text file
                                with open(att.get('path'), 'r', encoding='utf-8') as f:
                                    text_content = f.read()
                                content_parts.append(f"\n[Attachment: {att.get('name', 'file')}]\n{text_content}\n")
                                logger.info(f"Added text attachment: {att.get('name', 'unknown')}")
                            except Exception as e:
                                logger.warning(f"Could not read attachment as text: {e}")
            
            content_parts.append(user_request)

            response = self.model.generate_content(content_parts)
            response_text = response.text.strip()
            
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
        """Main loop listening for stdin"""
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
                            user_query = request.get('request', '')
                            attachments = []
                            
                            # Handle object format
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
