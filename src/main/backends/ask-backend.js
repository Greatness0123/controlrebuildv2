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
    this.setupGeminiAPI();
  }

  setupGeminiAPI() {
    const apiKey = process.env.GEMINI_FREE_KEY || "test_api_key";
    if (apiKey === "test_api_key") {
      console.warn("[ASK JS] No API key found in GEMINI_FREE_KEY");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const systemPrompt = `You are Control (Ask Mode), an intelligent AI assistant.

**YOUR ROLE:**
- Answer user questions clearly and concisely
- Assist with coding, general knowledge, and explanations
- Analyze images, PDFs, and file attachments users send
- **Analyze what's visible on the user's screen** when needed
- **Check system status** (battery, memory, processes, etc.) when needed

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

**WORKFLOW:**
1. If user asks about their screen → Request a screenshot first
2. If user asks about system status → Request appropriate command
3. When you receive the result, analyze it and respond to the user
4. You can make multiple requests if needed

**IMPORTANT:**
- You only OBSERVE and INFORM - you do NOT perform actions
- Only use read-only commands (no writes, deletes, or system changes)
- If user asks for actions (e.g., "open Chrome"), explain they should switch to Act mode

**RESPONSE FORMAT:**
- Chat directly with the user using Markdown
- Be helpful and friendly
- When you have enough information, provide your answer directly (no special tags)
`;
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });
  }

  async takeScreenshot() {
    try {
      const img = await screenshot({ format: "png" });
      return img; // Buffer
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

  async processRequest(userRequest, attachments = [], onResponse, onError) {
    if (!this.model) {
      onResponse({ text: "Error: AI model not configured.", is_action: false });
      return;
    }

    try {
      const conversationParts = [];

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
        iteration++;
        console.log(`[ASK JS] AI loop iteration ${iteration}/${this.maxLoopIterations}`);

        const result = await this.model.generateContent(conversationParts);
        const response = await result.response;
        const responseText = response.text().trim();

        console.log(`[ASK JS] AI response: ${responseText.substring(0, 200)}...`);

        const { requestType, requestData, cleanText } = this.parseAIResponse(responseText);

        if (requestType === "screenshot") {
          console.log("[ASK JS] AI requested screenshot");
          const screenshotData = await this.takeScreenshot();
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

      onResponse({
        text: "I apologize, but I couldn't complete the analysis within the allowed iterations. Please try a more specific question.",
        is_action: false,
      });
    } catch (err) {
      console.error("[ASK JS] Error processing request:", err);
      let userMessage = "I encountered an error. Please try again.";
      const errorStr = err.message.toLowerCase();
      if (errorStr.includes("quota") || errorStr.includes("exceeded") || errorStr.includes("429")) {
        userMessage = "Unable to connect to AI. Please try again later.";
      }
      onError({ message: userMessage });
    }
  }
}

module.exports = AskBackend;
