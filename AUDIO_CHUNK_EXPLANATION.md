# Audio Chunk Buffering Explanation

## Overview

The audio transcription system uses **chunk buffering** to improve speech recognition accuracy. This document explains how it works, why it's needed, and how to adjust it.

---

## How Audio Transcription Works

### The Problem

When recording audio from a microphone, the audio data comes in very small chunks (typically 43-128 samples per chunk). Vosk (the speech recognition engine) works much better with larger chunks (minimum 320 samples recommended).

**Small chunks (43 samples):**
- ❌ Too small for reliable recognition
- ❌ High overhead (many network messages)
- ❌ Poor accuracy

**Large chunks (320+ samples):**
- ✅ Better recognition accuracy
- ✅ Lower network overhead
- ✅ More efficient processing

### The Solution: Buffering

Instead of sending each tiny chunk immediately, we **buffer** (accumulate) multiple small chunks until we have enough data, then send them together as one larger chunk.

---

## How It Works

### Location in Code

The buffering logic is in: **`src/renderer/chat-window.js`** (lines ~550-655)

### Current Implementation

```javascript
// Buffer for accumulating audio chunks
const audioBuffer = [];
const MIN_CHUNK_SIZE = 320; // Minimum samples to send (recommended for Vosk)
let bufferedSamples = 0;

// When audio data arrives:
1. Convert to 16kHz, 16-bit PCM format
2. Add to buffer
3. Check if buffer >= MIN_CHUNK_SIZE
4. If yes, send all buffered chunks together
5. If no, wait for more chunks

// Also flush buffer every 200ms to avoid delays
```

### Flow Diagram

```
Microphone → AudioWorklet → Small Chunks (43 samples)
                                    ↓
                            Buffer Accumulator
                                    ↓
                    Check: bufferedSamples >= 320?
                    /                    \
                  YES                    NO
                   ↓                      ↓
            Send Combined Chunk    Wait for More
                   ↓
            Clear Buffer
```

---

## Configuration

### Where to Adjust Chunk Size

**File:** `src/renderer/chat-window.js`  
**Line:** ~557

```javascript
const MIN_CHUNK_SIZE = 320; // ← Change this value
```

### Recommended Values

| Value | Pros | Cons | Use Case |
|-------|------|------|----------|
| **160** | Lower latency | May reduce accuracy | Fast response needed |
| **320** | Good balance | Slight delay | **Recommended default** |
| **640** | Higher accuracy | More delay | Best accuracy needed |
| **1280** | Maximum accuracy | Noticeable delay | Offline processing |

### Flush Interval

**File:** `src/renderer/chat-window.js`  
**Line:** ~645

```javascript
const flushInterval = setInterval(() => {
    if (audioBuffer.length > 0 && this.isRecording) {
        flushBuffer();
    }
}, 200); // ← Change this (milliseconds)
```

**Recommended values:**
- **100ms** - Lower latency, more frequent sends
- **200ms** - **Recommended default** (good balance)
- **500ms** - Higher efficiency, more delay

---

## Trade-offs

### Increasing Chunk Size

**Pros:**
- ✅ Better recognition accuracy
- ✅ Fewer network messages
- ✅ More efficient processing

**Cons:**
- ❌ Slightly higher latency (delay)
- ❌ More memory usage
- ❌ Longer wait before first transcription

### Decreasing Chunk Size

**Pros:**
- ✅ Lower latency
- ✅ Faster initial response
- ✅ Less memory usage

**Cons:**
- ❌ Potentially lower accuracy
- ❌ More network overhead
- ❌ More processing overhead

---

## How to Test Changes

1. **Open browser console** (F12 in Electron DevTools)
2. **Start voice recording**
3. **Look for this log:**
   ```
   [Voice] First audio chunk sent via Worklet, size: XXX samples
   ```
4. **Verify the size is >= MIN_CHUNK_SIZE**

### Testing Different Values

1. Change `MIN_CHUNK_SIZE` in `chat-window.js`
2. Restart the application
3. Test voice input
4. Check console logs for chunk sizes
5. Evaluate recognition accuracy vs latency

---

## Technical Details

### Sample Rate

- **Input:** Variable (depends on microphone, typically 44.1kHz or 48kHz)
- **Output:** 16kHz (required by Vosk)
- **Format:** 16-bit PCM, mono

### Buffer Size Calculation

```
Samples per second = 16,000
Bytes per sample = 2 (16-bit)
Minimum chunk = 320 samples = 640 bytes
```

### Network Protocol

- **Protocol:** WebSocket (ws://127.0.0.1:2700)
- **Format:** Raw binary (Int16Array buffer)
- **Chunking:** Buffered chunks sent as single message

---

## Troubleshooting

### Problem: No transcription results

**Possible causes:**
1. Chunks too small - Increase `MIN_CHUNK_SIZE`
2. Buffer not flushing - Check flush interval
3. Vosk server not receiving - Check WebSocket connection

**Solution:**
```javascript
// Increase minimum chunk size
const MIN_CHUNK_SIZE = 640; // Try larger value

// Reduce flush interval
}, 100); // Flush more frequently
```

### Problem: High latency

**Possible causes:**
1. Chunks too large - Decrease `MIN_CHUNK_SIZE`
2. Flush interval too long - Reduce interval

**Solution:**
```javascript
// Decrease minimum chunk size
const MIN_CHUNK_SIZE = 160; // Try smaller value

// Reduce flush interval
}, 100); // Flush more frequently
```

### Problem: Poor recognition accuracy

**Possible causes:**
1. Chunks too small - Increase `MIN_CHUNK_SIZE`
2. Audio quality issues - Check microphone settings

**Solution:**
```javascript
// Increase minimum chunk size
const MIN_CHUNK_SIZE = 640; // Try larger value
```

---

## Current Settings

**Default Configuration:**
- **MIN_CHUNK_SIZE:** 320 samples
- **Flush Interval:** 200ms
- **Sample Rate:** 16kHz
- **Format:** 16-bit PCM, mono

These settings provide a good balance between accuracy and latency for most use cases.

---

## Advanced: Dynamic Chunk Sizing

For advanced users, you could implement dynamic chunk sizing based on network conditions or recognition confidence:

```javascript
// Example: Adjust based on recognition confidence
let dynamicChunkSize = 320;

if (lastConfidence < 0.7) {
    dynamicChunkSize = 640; // Increase for better accuracy
} else {
    dynamicChunkSize = 320; // Decrease for lower latency
}
```

---

## Summary

- **Location:** `src/renderer/chat-window.js` line ~557
- **Key Variable:** `MIN_CHUNK_SIZE = 320`
- **Purpose:** Accumulate small audio chunks into larger ones
- **Benefit:** Better speech recognition accuracy
- **Trade-off:** Slight increase in latency
- **Recommended:** Keep at 320 unless you have specific needs

