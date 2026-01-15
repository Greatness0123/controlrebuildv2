#!/usr/bin/env python3
"""
Terminal access script for ASK backend (Gemini)
Run this script directly to use ASK mode from terminal
"""

import sys
from ask_backend import AskBackend

def main():
    print("\n" + "="*80)
    print(" Control - ASK Mode (Terminal)")
    print("="*80)
    print("Enter your question. Type 'quit' or 'exit' to stop.\n")
    
    backend = AskBackend()
    
    try:
        while True:
            user_input = input("> ").strip()
            
            if not user_input:
                continue
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("\nGoodbye!")
                break
            
            print()
            backend.process_request(user_input, [])
            print()
            
    except KeyboardInterrupt:
        print("\n\nGoodbye!")
    except Exception as e:
        print(f"\n[ERROR] {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

