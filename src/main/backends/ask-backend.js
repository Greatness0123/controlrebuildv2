const { GoogleGenerativeAI } = require("@google/generative-ai");
const screenshot = require("screenshot-desktop");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

class AskBackend {
  constructor() {
    this.maxLoopIterations = 5;
    this.model = null;
    this.currentApiKey = null;
    this.stopRequested = false;
    this.setupGeminiAPI();
    
    // Conversation history for context memory
    this.conversationHistory = [];
    this.maxHistoryLength = 20; // Keep last 20 exchanges (10 user + 10 AI)
  }

  setupGeminiAPI(apiKey) {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_FREE_KEY || "test_api_key";
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (key === "test_api_key") {
      console.warn("[ASK JS] No API key found");
    }

    // Only re-initialize if key changed or model is missing
    if (key === this.currentApiKey && this.model) return;

    this.currentApiKey = key;
    const genAI = new GoogleGenerativeAI(key);
    const systemPrompt = `You are Control (Ask Mode), an intelligent AI assistant.

**YOUR ROLE:**
- Answer user questions clearly and concisely
- Assist with coding, general knowledge, and explanations
- Analyze images, PDFs, and file attachments users send
- **Analyze what's visible on the user's screen** when needed
- **Check system status** (battery, memory, processes, etc.) when needed
- **Use web search** when you need current information or need to research how to perform tasks

**CURRENT OS:** ${process.platform}

**TOOLS AVAILABLE:**
You can request information by including these tags in your response:

1. **Screenshot Request** - To see what's on the user's screen:
   \`[REQUEST_SCREENSHOT]\`

2. **Command Request** - To run a system command (READ-ONLY queries only):
   \`[REQUEST_COMMAND: <command>]\`

   Examples for ${process.platform}:
   - Battery: \`[REQUEST_COMMAND: powershell (Get-WmiObject Win32_Battery).EstimatedChargeRemaining]\` (Windows)
   - Memory: \`[REQUEST_COMMAND: powershell Get-Process | Sort-Object -Property WS -Descending | Select-Object -First 5 Name,WS]\` (Windows)
   - Processes: \`[REQUEST_COMMAND: tasklist /FI "STATUS eq RUNNING" /NH]\` (Windows)

3. **Web Search** - You have access to Google Search. Use it when:
   - You need current/real-time information
   - You need to research how to perform specific tasks
   - You need to verify facts or get updated information
   - The user asks about recent events or current data

**WORKFLOW:**
1. If user asks about their screen → Request a screenshot first
2. If user asks about system status → Request appropriate command
3. If you need current information or need to research → Use web search automatically
4. When you receive the result, analyze it and respond to the user
5. You can make multiple requests if needed

**IMPORTANT:**
- You only OBSERVE and INFORM - you do NOT perform actions
- Only use read-only commands (no writes, deletes, or system changes)
- If user asks for actions (e.g., "open Chrome"), explain they should switch to Act mode
- Use web search proactively when it would help answer the user's question better

**RESPONSE FORMAT:**
- Chat directly with the user using Markdown
- Be helpful and friendly
- When you have enough information, provide your answer directly (no special tags)
`;
    const modelOptions = {
      model: modelName,
      systemInstruction: systemPrompt,
    };

    // Only add search tool if not explicitly disabled or if model is known to support it
    // Some custom/fine-tuned models might fail with tools enabled
    if (!process.env.DISABLE_SEARCH_TOOL) {
      modelOptions.tools = [{ googleSearch: {} }];
    }

    this.model = genAI.getGenerativeModel(modelOptions);
    console.log(`[ASK JS] Model initialized with: ${modelName}`);
  }

  async takeScreenshot() {
    try {
      const img = await screenshot({ format: "png" });
      return img;
    } catch (err) {
      console.error("[ASK JS] Screenshot failed:", err);
      return null;
    }
  }

  async runSystemCommand(command) {
    return new Promise((resolve) => {
      console.log(`[ASK JS] Running command: ${command}`);
      exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        let output = stdout.trim();
        if (stderr) {
          output += `\n[stderr]: ${stderr.trim()}`;
        }
        if (!output) {
          output = "(No output)";
        }
        resolve(output);
      });
    });
  }

  parseAIResponse(responseText) {
    const screenshotMatch = /\[REQUEST_SCREENSHOT\]/.exec(responseText);
    const commandMatch = /\[REQUEST_COMMAND:\s*(.+?)\]/.exec(responseText);

    let requestType = null;
    let requestData = null;

    if (screenshotMatch) {
      requestType = "screenshot";
    } else if (commandMatch) {
      requestType = "command";
      requestData = commandMatch[1].trim();
    }

    let cleanText = responseText.replace(/\[REQUEST_SCREENSHOT\]/g, "");
    cleanText = cleanText.replace(/\[REQUEST_COMMAND:\s*.+?\]/g, "");
    cleanText = cleanText.trim();

    return { requestType, requestData, cleanText };
  }

  async processRequest(userRequest, attachments = [], onResponse, onError, apiKey) {
    console.log(`[ASK JS] Processing request: ${userRequest}`);
    this.stopRequested = false;
    this.setupGeminiAPI(apiKey);

    const firebaseService = require('../firebase-service');
    const cachedUser = firebaseService.checkCachedUser();

    if (!this.model) {
      console.error("[ASK JS] AI model not configured.");
      onResponse({ text: "Error: AI model not configured. Please check your API key.", is_action: false });
      return;
    }

    try {
      const conversationParts = [];
      
      // Add conversation history for context
      if (this.conversationHistory.length > 0) {
        const recentHistory = this.conversationHistory.slice(-this.maxHistoryLength);
        for (const exchange of recentHistory) {
          conversationParts.push(`User: ${exchange.user}`);
          conversationParts.push(`Assistant: ${exchange.ai}`);
        }
      }

      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          if (att.path && fs.existsSync(att.path)) {
            const ext = path.extname(att.path).toLowerCase();
            const imageMimeTypes = {
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".webp": "image/webp",
              ".gif": "image/gif",
              ".bmp": "image/bmp",
            };

            if (imageMimeTypes[ext]) {
              const data = fs.readFileSync(att.path);
              conversationParts.push({
                inlineData: {
                  mimeType: imageMimeTypes[ext],
                  data: data.toString("base64"),
                },
              });
            } else if (ext === ".pdf") {
              const data = fs.readFileSync(att.path);
              conversationParts.push({
                inlineData: {
                  mimeType: "application/pdf",
                  data: data.toString("base64"),
                },
              });
            } else {
              try {
                const textContent = fs.readFileSync(att.path, "utf-8");
                conversationParts.push(`\n--- Attached File: ${att.name || "file"} ---\n${textContent}\n--- End ---\n`);
              } catch (e) {
                console.warn(`[ASK JS] Could not read ${att.path} as text`);
              }
            }
          }
        }
      }

      conversationParts.push(`User: ${userRequest}`);

      let iteration = 0;
      while (iteration < this.maxLoopIterations) {
        if (this.stopRequested) break;
        iteration++;
        console.log(`[ASK JS] AI loop iteration ${iteration}/${this.maxLoopIterations}`);

        const result = await this.model.generateContent(conversationParts);
        if (this.stopRequested) break;
        const response = await result.response;

        // Track token usage
        if (response.usageMetadata && cachedUser) {
          firebaseService.updateTokenUsage(cachedUser.id, 'ask', response.usageMetadata);
        }

        if (this.stopRequested) break;
        const responseText = response.text().trim();

        console.log(`[ASK JS] AI response: ${responseText.substring(0, 200)}...`);

        const { requestType, requestData, cleanText } = this.parseAIResponse(responseText);
        if (this.stopRequested) break;
        
        // Store in conversation history (only final responses, not intermediate tool requests)
        if (!requestType) {
          this.conversationHistory.push({
            user: userRequest,
            ai: responseText.substring(0, 1000) // Store first 1000 chars of response
          });
          
          // Trim history if too long
          if (this.conversationHistory.length > this.maxHistoryLength) {
            this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
          }
        }

        if (requestType === "screenshot") {
          console.log("[ASK JS] AI requested screenshot");
          const screenshotData = await this.takeScreenshot();
          if (this.stopRequested) break;
          if (screenshotData) {
            conversationParts.push(`Assistant: ${cleanText}`);
            conversationParts.push({
              inlineData: {
                mimeType: "image/png",
                data: screenshotData.toString("base64"),
              },
            });
            conversationParts.push("System: Here is the requested screenshot of the user's screen.");
          } else {
            conversationParts.push(`Assistant: ${cleanText}`);
            conversationParts.push("System: Screenshot capture failed. Please answer based on available information.");
          }
          continue;
        } else if (requestType === "command") {
          console.log(`[ASK JS] AI requested command: ${requestData}`);
          const commandOutput = await this.runSystemCommand(requestData);
          if (this.stopRequested) break;
          conversationParts.push(`Assistant: ${cleanText}`);
          conversationParts.push(`System: Command output:\n\`\`\`\n${commandOutput}\n\`\`\``);
          continue;
        } else {
          onResponse({
            text: responseText,
            is_action: false,
          });
          return;
        }
      }

      if (!this.stopRequested) {
        onResponse({
          text: "I apologize, but I couldn't complete the analysis within the allowed iterations. Please try a more specific question.",
          is_action: false,
        });
      }
    } catch (err) {
      console.error("[ASK JS] Error processing request:", err);
      let userMessage = "I encountered an error. Please try again.";
      const errorStr = err.message.toLowerCase();

      // Check for quota or 429 errors and rotate key for next time
      if (errorStr.includes("quota") || errorStr.includes("exceeded") || errorStr.includes("429")) {
        userMessage = "AI Quota exceeded. Rotating API key for next request. Please try again in a moment.";
        console.log("[ASK JS] Quota exceeded, rotating key...");
        firebaseService.rotateGeminiKey();
      } else if (errorStr.includes("google_search_retrieval")) {
        userMessage = "Search tool configuration error. Rotating key and updating tool settings. Please retry.";
        firebaseService.rotateGeminiKey();
      }

      onError({ message: userMessage });
    }
  }

  stopTask() {
    this.stopRequested = true;
  }
}

module.exports = AskBackend;
