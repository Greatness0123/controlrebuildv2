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
    
    this.conversationHistory = [];
    this.maxHistoryLength = 20;
  }

  setupGeminiAPI(apiKey) {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_FREE_KEY || "test_api_key";
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash"; // Default to 2.0 or 2.5 flash

    if (key === this.currentApiKey && this.model) return;

    this.currentApiKey = key;
    const genAI = new GoogleGenerativeAI(key);
    const systemPrompt = `You are Control (Ask Mode), an intelligent AI assistant.

**YOUR ROLE:**
- Answer user questions clearly and concisely
- Assist with coding, general knowledge, and explanations
- Analyze images, PDFs, and file attachments
- **Analyze user's screen** when needed
- **Check system status** (battery, memory, etc.)
- **Use web search** for real-time info or research

**TOOLS AVAILABLE:**
- \`[REQUEST_SCREENSHOT]\`: Request a current screen capture
- \`[REQUEST_COMMAND: <command>]\`: Run read-only system commands

**WORKFLOW:**
1. Request info tools automatically if needed.
2. Use web search (googleSearch tool) proactively.
3. Provide final answers grounded in the gathered information.
4. Include citations if web search was used.
`;
    const modelOptions = {
      model: modelName,
      systemInstruction: systemPrompt,
      generationConfig: {}
    };

    if (!process.env.DISABLE_SEARCH_TOOL) {
      modelOptions.tools = [{ googleSearch: {} }];
    }

    this.model = genAI.getGenerativeModel(modelOptions);
    console.log(`[ASK JS] Model initialized with: ${modelName}`);
  }

  async takeScreenshot() {
    try {
      return await screenshot({ format: "png" });
    } catch (err) {
      console.error("[ASK JS] Screenshot failed:", err);
      return null;
    }
  }

  async runSystemCommand(command) {
    return new Promise((resolve) => {
      exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        let output = stdout.trim() || stderr.trim() || "(No output)";
        resolve(output);
      });
    });
  }

  parseAIResponse(responseText) {
    const screenshotMatch = /\[REQUEST_SCREENSHOT\]/.exec(responseText);
    const commandMatch = /\[REQUEST_COMMAND:\s*(.+?)\]/.exec(responseText);

    let requestType = null;
    let requestData = null;

    if (screenshotMatch) requestType = "screenshot";
    else if (commandMatch) {
      requestType = "command";
      requestData = commandMatch[1].trim();
    }

    let cleanText = responseText.replace(/\[REQUEST_SCREENSHOT\]/g, "").replace(/\[REQUEST_COMMAND:\s*.+?\]/g, "").trim();
    return { requestType, requestData, cleanText };
  }

  formatCitations(response) {
    try {
        const metadata = response.candidates?.[0]?.groundingMetadata;
        if (!metadata || !metadata.groundingChunks) return response.text();

        let text = response.text();
        const chunks = metadata.groundingChunks;
        const supports = metadata.groundingSupports || [];

        // Sort supports in reverse to avoid index shifts
        const sortedSupports = [...supports].sort((a, b) =>
            (b.segment?.endIndex || 0) - (a.segment?.endIndex || 0)
        );

        const usedLinks = new Map();
        let linkCounter = 1;

        for (const support of sortedSupports) {
            const endIndex = support.segment?.endIndex;
            if (endIndex === undefined || !support.groundingChunkIndices?.length) continue;

            const links = support.groundingChunkIndices.map(idx => {
                const chunk = chunks[idx];
                if (chunk?.web?.uri) {
                    if (!usedLinks.has(chunk.web.uri)) {
                        usedLinks.set(chunk.web.uri, linkCounter++);
                    }
                    return `[${usedLinks.get(chunk.web.uri)}](${chunk.web.uri})`;
                }
                return null;
            }).filter(Boolean);

            if (links.length > 0) {
                text = text.slice(0, endIndex) + " " + links.join(", ") + text.slice(endIndex);
            }
        }

        // Add a "Sources" section at the end if links were used
        if (usedLinks.size > 0) {
            text += "\n\n**Sources:**\n";
            const sortedLinks = Array.from(usedLinks.entries()).sort((a, b) => a[1] - b[1]);
            for (const [uri, id] of sortedLinks) {
                const domain = new URL(uri).hostname;
                text += `${id}. [${domain}](${uri})\n`;
            }
        }

        return text;
    } catch (e) {
        console.error("[ASK JS] Citation formatting error:", e);
        return response.text();
    }
  }

  async processRequest(userRequest, attachments = [], onResponse, onError, apiKey) {
    this.stopRequested = false;
    this.setupGeminiAPI(apiKey);
    const firebaseService = require('../firebase-service');
    const cachedUser = firebaseService.checkCachedUser();

    try {
      const conversationParts = [];
      if (this.conversationHistory.length > 0) {
        const recent = this.conversationHistory.slice(-this.maxHistoryLength);
        for (const ex of recent) {
          conversationParts.push(`User: ${ex.user}`, `Assistant: ${ex.ai}`);
        }
      }

      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          if (att.path && fs.existsSync(att.path)) {
            const ext = path.extname(att.path).toLowerCase();
            const mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf"}[ext];
            if (mime) conversationParts.push({ inlineData: { mimeType: mime, data: fs.readFileSync(att.path).toString("base64") } });
          }
        }
      }

      conversationParts.push(`User: ${userRequest}`);

      let iteration = 0;
      while (iteration < this.maxLoopIterations && !this.stopRequested) {
        iteration++;
        const result = await this.model.generateContent(conversationParts);
        const response = await result.response;
        if (response.usageMetadata && cachedUser) firebaseService.updateTokenUsage(cachedUser.id, 'ask', response.usageMetadata);

        const responseText = response.text().trim();
        const { requestType, requestData, cleanText } = this.parseAIResponse(responseText);

        if (requestType === "screenshot") {
          const shot = await this.takeScreenshot();
          if (shot) {
            conversationParts.push(`Assistant: ${cleanText}`, { inlineData: { mimeType: "image/png", data: shot.toString("base64") } }, "System: Here is the screenshot.");
          }
          continue;
        } else if (requestType === "command") {
          const output = await this.runSystemCommand(requestData);
          conversationParts.push(`Assistant: ${cleanText}`, `System: Command output:\n\`\`\`\n${output}\n\`\`\``);
          continue;
        } else {
          const finalPromptText = this.formatCitations(response);
          this.conversationHistory.push({ user: userRequest, ai: finalPromptText.substring(0, 1000) });
          onResponse({ text: finalPromptText, is_action: false });
          return;
        }
      }
    } catch (err) {
      console.error("[ASK JS] Error:", err);
      onError({ message: err.message });
    }
  }

  stopTask() { this.stopRequested = true; }
}

module.exports = AskBackend;
