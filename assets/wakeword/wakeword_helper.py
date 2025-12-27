import sys
import time
import os
import struct

# Simple Porcupine helper PoC. Requires pvporcupine and pyaudio to be installed.
# Usage: python wakeword_helper.py --model path/to/hey-control_en_windows_v4_0_0.ppn --access-key YOUR_ACCESS_KEY

try:
    import argparse
    import pvporcupine
    import pyaudio
except Exception as e:
    print('PORCUPINE_MISSING', file=sys.stderr)
    print('Porcupine/PyAudio not installed - helper cannot run', file=sys.stderr)
    sys.exit(1)

parser = argparse.ArgumentParser()
parser.add_argument('--model', type=str, required=True)
parser.add_argument('--access-key', type=str, default=None)
args = parser.parse_args()

# Get access key from command line argument or environment variable
# access_key = args.access_key or os.getenv('PORCUPINE_ACCESS_KEY')
access_key = "9EttpjRka/x8fH6GtikEIU3UB0nXm+UoQkTBhsWKEn9s1TgBGpSLxQ=="

if not access_key:
    print('ERROR: Porcupine access key not provided', file=sys.stderr)
    print('Set PORCUPINE_ACCESS_KEY environment variable or use --access-key argument', file=sys.stderr)
    sys.exit(1)

try:
    porcupine = pvporcupine.create(access_key=access_key, keyword_paths=[args.model])
except Exception as e:
    print(f'ERROR: Failed to initialize Porcupine: {e}', file=sys.stderr)
    sys.exit(1)

pa = pyaudio.PyAudio()
stream = pa.open(
    rate=porcupine.sample_rate, 
    channels=1, 
    format=pyaudio.paInt16, 
    input=True, 
    frames_per_buffer=porcupine.frame_length
)

print('WAKEWORD_HELPER_STARTED')
sys.stdout.flush()

try:
    while True:
        pcm = stream.read(porcupine.frame_length, exception_on_overflow=False)
        
        # Convert bytes to int16 array manually
        pcm_int16 = struct.unpack_from("h" * porcupine.frame_length, pcm)
        
        result = porcupine.process(pcm_int16)
        if result >= 0:
            print('DETECTED')
            sys.stdout.flush()
            # Throttle to avoid repeated triggers
            time.sleep(1.0)
except KeyboardInterrupt:
    pass
finally:
    stream.stop_stream()
    stream.close()
    pa.terminate()
    porcupine.delete()