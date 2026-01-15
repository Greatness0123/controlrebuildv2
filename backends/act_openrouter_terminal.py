#!/usr/bin/env python3
"""
Terminal access script for ACT backend (OpenRouter)
Run this script directly to use ACT mode with OpenRouter from terminal
"""

import sys
import json
from backends.act_backend_openrouter import ComputerUseAgentBackend

def main():
    print("\n" + "="*80)
    print(" Control - ACT Mode (OpenRouter/Terminal)")
    print("="*80)
    print("Enter your task request. Type 'quit' or 'exit' to stop.\n")
    
    backend = ComputerUseAgentBackend()
    
    try:
        while True:
            user_input = input("> ").strip()
            
            if not user_input:
                continue
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("\nGoodbye!")
                break
            
            print()
            backend.execute_task(user_input, [])
            print()
            
    except KeyboardInterrupt:
        print("\n\nGoodbye!")
    except Exception as e:
        print(f"\n[ERROR] {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

