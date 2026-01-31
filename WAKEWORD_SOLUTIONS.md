# Wakeword Detection Solutions & Alternatives to Picovoice Porcupine

## Current Issue: Porcupine Free Tier Limitation

The current implementation uses **Picovoice Porcupine** with the free tier, which has a critical limitation:
- **Only 1 user per access key** - Multiple users cannot use the same Porcupine key simultaneously
- This causes conflicts when two instances run with the same credentials

---

## Alternative Wakeword Solutions

### 1. **Vosk (Recommended for Multi-User Support)**
**Pros:**
- ✅ Completely free and open-source
- ✅ Works offline (no internet required)
- ✅ No user limits - unlimited concurrent users
- ✅ Lightweight and fast
- ✅ Already integrated in your project for speech recognition

**Cons:**
- ⚠️ Lower accuracy than Porcupine
- ⚠️ Larger model files
- ⚠️ Requires downloading language models

**Implementation:**
- Already available in your project
- Can use Vosk's wake-word detection alongside existing speech recognition
- Models available at: https://alphacephei.com/vosk/models

**Setup:**
```javascript
// Already available via vosk-server-v2.py
// Use the existing Vosk WebSocket for both speech and wakeword detection
```

---

### 2. **Pocketsphinx (CMU Sphinx)**
**Pros:**
- ✅ Completely free and open-source
- ✅ Offline-capable
- ✅ Unlimited users
- ✅ Low resource usage
- ✅ Good for keyword spotting

**Cons:**
- ⚠️ Moderate accuracy
- ⚠️ Requires compilation on some platforms
- ⚠️ Less actively maintained

**Node.js Package:** `pocketsphinx-js` or `sphinx-js`

---

### 3. **Utterances Wake Word Detection**
**Pros:**
- ✅ Open-source
- ✅ Modern approach using neural networks
- ✅ Supports custom wake words
- ✅ Unlimited users

**Cons:**
- ⚠️ Requires training for custom words
- ⚠️ Lower accuracy than commercial solutions

**Repository:** https://github.com/utterance/utterance

---

### 4. **Silero Wake Word (Recommended for Balance)**
**Pros:**
- ✅ Free and open-source
- ✅ High accuracy (comparable to Porcupine)
- ✅ No user limits
- ✅ Offline capability
- ✅ Multiple languages supported
- ✅ Lightweight models

**Cons:**
- ⚠️ Relatively newer project
- ⚠️ Smaller community

**Installation:**
```bash
npm install silero-vad
```

**Example Usage:**
```javascript
const Silero = require('silero-vad');
// Initialize and use for wake word detection
```

---

### 5. **Porcupine Pro/Paid Plans**
**Pros:**
- ✅ Highest accuracy
- ✅ Multi-user support on paid plans
- ✅ Commercial support

**Cons:**
- ❌ Expensive ($0.03+ per minute or monthly subscription)
- ❌ Requires payment

**Pricing:** https://picovoice.ai/pricing/

---

## Comparison Table

| Solution | Multi-User | Cost | Accuracy | Offline | Speed | Maintenance |
|----------|-----------|------|----------|---------|-------|-------------|
| **Porcupine Free** | ❌ 1 user | Free | ⭐⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐⭐ | ✅ Active |
| **Vosk** | ✅ Unlimited | Free | ⭐⭐⭐ | ✅ | ⭐⭐⭐⭐ | ✅ Active |
| **Pocketsphinx** | ✅ Unlimited | Free | ⭐⭐⭐ | ✅ | ⭐⭐⭐⭐ | ⚠️ Slow |
| **Silero VAD** | ✅ Unlimited | Free | ⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐ | ✅ Active |
| **Utterances** | ✅ Unlimited | Free | ⭐⭐⭐ | ✅ | ⭐⭐⭐ | ⚠️ Slow |
| **Porcupine Paid** | ✅ Unlimited | $ | ⭐⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐⭐ | ✅ Active |

---

## Recommended Solution: Silero Wake Word

For your use case (multi-user desktop application), **Silero Wake Word** is recommended because:

1. **No user limits** - Multiple instances can run simultaneously
2. **High accuracy** - Comparable to Porcupine
3. **Completely free** - No subscription costs
4. **Offline** - Works without internet
5. **Lightweight** - Small model files
6. **Active development** - Regular updates

### Migration Steps to Silero:

1. **Install Silero package:**
   ```bash
   npm install silero-vad
   ```

2. **Replace Porcupine initialization in `wakeword-helper.js`:**
   ```javascript
   // Replace Porcupine with Silero
   const SileroVAD = require('silero-vad').SileroVAD;
   ```

3. **Update wakeword detection logic** to use Silero's API

4. **Test with multiple instances** to verify multi-user support

---

## Short-Term Fix (Immediate)

To allow multiple users with current Porcupine setup:

### Option A: Generate Multiple Access Keys
- Ask each user to generate their own Picovoice free tier access key
- Store keys per-user in settings
- Use appropriate key for each instance

**Implementation:**
```javascript
// In wakeword-helper.js
const userAccessKey = getUserSpecificPorcupineKey();
// Creates new Porcupine instance with user-specific key
```

### Option B: Use Single Shared Instance
- Create a central wakeword service that shares a single Porcupine instance
- Other instances communicate via IPC or network sockets
- Requires more complex architecture

---

## Summary

| Timeline | Solution | Cost | Effort |
|----------|----------|------|--------|
| **Immediate** | Per-user Porcupine keys | Free | Low |
| **Short-term** | Silero Wake Word | Free | Medium |
| **Long-term** | Porcupine Paid Plan | $$$ | Low |

**Recommendation: Implement Silero Wake Word** for best balance of cost, accuracy, and multi-user support.
