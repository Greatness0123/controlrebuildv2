#!/usr/bin/env python3
"""
Vosk Server V2
Simplified, FFmpeg-free, Raw PCM WebSocket Server.
"""

import sys
import os
import json
import logging
import asyncio
import argparse
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('VoskServerV2')

try:
    import vosk
    import websockets
except ImportError:
    logger.error("Missing dependencies. Run: pip install vosk websockets")
    sys.exit(1)

class VoskServer:
    def __init__(self, host, port, model_path):
        self.host = host
        self.port = port
        self.model_path = model_path
        self.model = None

        if not os.path.exists(self.model_path):
             # Try relative path
             rel_path = os.path.join(os.path.dirname(__file__), self.model_path)
             if os.path.exists(rel_path):
                 self.model_path = rel_path
             else:
                 logger.error(f"Model path not found: {self.model_path}")
                 sys.exit(1)

        logger.info(f"Loading Vosk model from: {self.model_path}")
        self.model = vosk.Model(str(self.model_path))
        logger.info("Model loaded.")

    async def handle_connection(self, websocket):
        logger.info("Client connected")
        rec = vosk.KaldiRecognizer(self.model, 16000.0)
        
        try:
            async for message in websocket:
                if isinstance(message, str):
                    # Handle text commands (e.g. config)
                    # For now we ignore or log, assuming standard 16k mono
                    pass
                elif isinstance(message, bytes):
                    # Raw PCM Audio (16-bit, 16kHz, mono)
                    # Process audio chunks (Vosk works best with chunks >= 320 bytes = 160 samples)
                    if len(message) > 0:
                        try:
                            if rec.AcceptWaveform(message):
                                result_json = rec.Result()
                                result = json.loads(result_json)
                                # Only send if there's actual text
                                if result.get('text') and result['text'].strip():
                                    logger.info(f"Final result: {result['text']}")
                                    await websocket.send(result_json)
                            else:
                                partial_json = rec.PartialResult()
                                partial = json.loads(partial_json)
                                # Only send partial if there's actual text
                                if partial.get('partial') and partial['partial'].strip():
                                    logger.debug(f"Partial result: {partial['partial']}")
                                    await websocket.send(partial_json)
                        except Exception as e:
                            logger.error(f"Error processing audio chunk: {e}")
        except websockets.exceptions.ConnectionClosed:
            logger.info("Client disconnected")
        except Exception as e:
            logger.error(f"Error handling connection: {e}")

    async def start(self):
        async with websockets.serve(self.handle_connection, self.host, self.port):
            logger.info(f"Server listening on ws://{self.host}:{self.port}")
            await asyncio.Future()  # Run forever

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1", help="Host to listen on")
    parser.add_argument("--port", type=int, default=2700, help="Port to listen on")
    parser.add_argument("--model", default="model", help="Path to Vosk model")
    args = parser.parse_args()

    server = VoskServer(args.host, args.port, args.model)
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        pass
