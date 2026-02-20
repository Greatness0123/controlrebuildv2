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

  setupGeminiAPI(apiKey, modelName) {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_FREE_KEY || "test_api_key";
    const finalModelName = modelName || process.env.GEMINI_MODEL || "gemini-1.5-flash";

    if (key === this.currentApiKey && this.model && this.currentModelName === finalModelName) return;

    this.currentApiKey = key;
    this.currentModelName = finalModelName;
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
- \`[DISPLAY_CODE: <language>\n<code>]\`: Display a formatted code block with a copy button

**WORKFLOW:**
1. Request info tools automatically if needed.
2. Use web search (googleSearch tool) proactively.
3. Provide final answers grounded in the gathered information.
4. Include citations if web search was used.
`;
    const modelOptions = {
      model: finalModelName,
      systemInstruction: systemPrompt,
      generationConfig: {}
    };

    if (!process.env.DISABLE_SEARCH_TOOL) {
      modelOptions.tools = [{ googleSearch: {} }];
    }

    this.model = genAI.getGenerativeModel(modelOptions);
    console.log(`[ASK JS] Model initialized with: ${finalModelName}`);
  }

  async takeScreenshot() {
    try {
      let imgBuffer;
      try {
        const displays = await screenshot.listDisplays();
        const primary = displays.find(d => d.id === 0) || displays[0];
        imgBuffer = await screenshot({ format: "png", screen: primary.id });
      } catch (e) {
        imgBuffer = await screenshot({ format: "png" });
      }
      return imgBuffer;
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
    const codeMatch = /\[DISPLAY_CODE:\s*([\s\S]+?)\]/.exec(responseText);

    let requestType = null;
    let requestData = null;

    if (screenshotMatch) requestType = "screenshot";
    else if (commandMatch) {
      requestType = "command";
      requestData = commandMatch[1].trim();
    } else if (codeMatch) {
      requestType = "display_code";
      requestData = codeMatch[1].trim();
    }

    let cleanText = responseText
        .replace(/\[REQUEST_SCREENSHOT\]/g, "")
        .replace(/\[REQUEST_COMMAND:\s*.+?\]/g, "")
        .replace(/\[DISPLAY_CODE:\s*[\s\S]+?\]/g, "")
        .trim();
    return { requestType, requestData, cleanText };
  }

  formatCitations(response) {
    try {
        // Citations disabled per user request to minimize space and remove unclickable links
        return response.text();
    } catch (e) {
        console.error("[ASK JS] Error getting text from response:", e);
        return "";
    }
  }

  async ollamaGenerate(prompt, systemPrompt, settings, images = []) {
    const url = `${settings.ollamaUrl || 'http://localhost:11434'}/api/generate`;
    const body = {
      model: settings.ollamaModel || 'llama3',
      prompt: prompt,
      system: systemPrompt,
      stream: false
    };
    if (images.length > 0) {
      body.images = images;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    return data.response;
  }

  async openrouterGenerate(conversationParts, systemPrompt, settings) {
    const firebaseService = require('../firebase-service');
    const cachedKeys = firebaseService.getKeys();

    const apiKey = settings.openrouterApiKey || (cachedKeys && cachedKeys.openrouter);
    if (!apiKey) throw new Error("OpenRouter API key is missing. Please add one in settings or contact support.");

    const model = settings.openrouterModel === 'custom' ? settings.openrouterCustomModel : settings.openrouterModel;

    // Convert conversation parts to OpenAI format
    const messages = [{ role: "system", content: systemPrompt }];
    for (const part of conversationParts) {
      if (typeof part === 'string') {
        const role = part.startsWith('User:') ? 'user' : (part.startsWith('Assistant:') ? 'assistant' : 'user');
        const content = part.replace(/^(User:|Assistant:|System:)\s*/, '');
        messages.push({ role, content });
      } else if (part.inlineData) {
        // Handle images for OpenRouter (multimodal)
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
          if (typeof lastMessage.content === 'string') {
            lastMessage.content = [
              { type: "text", text: lastMessage.content },
              { type: "image_url", image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` } }
            ];
          } else {
            lastMessage.content.push({ type: "image_url", image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` } });
          }
        }
      }
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://controlrebuild-website.vercel.app",
        "X-Title": "Control AI",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: messages
      })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenRouter error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async processRequest(userRequest, attachments = [], onResponse, onError, apiKey, settings = {}) {
    this.stopRequested = false;

    const provider = settings.modelProvider || 'gemini';

    // Special case: if OpenRouter is selected but the model is Gemini 1.5 Flash (SDK version), switch to gemini provider logic
    let effectiveProvider = provider;
    if (provider === 'openrouter' && (settings.openrouterModel === 'google/gemini-flash-1.5-sdk' || settings.openrouterModel === 'gemini-native')) {
        effectiveProvider = 'gemini';
    }

    const firebaseService = require('../firebase-service');
    const cachedKeys = firebaseService.getKeys();
    const defaultGeminiModel = cachedKeys ? cachedKeys.gemini_model : "gemini-1.5-flash";
    const geminiModel = settings.selectedModel || defaultGeminiModel;

    if (effectiveProvider === 'gemini') {
      this.setupGeminiAPI(apiKey, geminiModel);
    }
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

        let responseText = "";
        let responseObj = null;

        if (effectiveProvider === 'ollama') {
          // Flatten conversationParts for Ollama
          const prompt = conversationParts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
          const images = []; // Extract images from conversationParts if any
          responseText = await this.ollamaGenerate(prompt, "You are Control (Ask Mode), an intelligent AI assistant.", settings, images);
        } else if (effectiveProvider === 'openrouter') {
          responseText = await this.openrouterGenerate(conversationParts, "You are Control (Ask Mode), an intelligent AI assistant.", settings);
        } else {
          const result = await this.model.generateContent(conversationParts);
          responseObj = await result.response;
          if (responseObj.usageMetadata && cachedUser) firebaseService.updateTokenUsage(cachedUser.id, 'ask', responseObj.usageMetadata);
          responseText = responseObj.text().trim();
        }

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
        } else if (requestType === "display_code") {
            const parts = requestData.split('\n');
            const language = parts[0].trim();
            const code = parts.slice(1).join('\n').trim();
            const markdownCode = `\`\`\`${language}\n${code}\n\`\`\``;

            // Send the code block as the final response part
            this.conversationHistory.push({ user: userRequest, ai: cleanText + "\n" + markdownCode });
            onResponse({ text: cleanText + "\n" + markdownCode, is_action: false });
            return;
        } else {
          const finalPromptText = (effectiveProvider === 'ollama' || effectiveProvider === 'openrouter') ? responseText : this.formatCitations(responseObj);
          this.conversationHistory.push({ user: userRequest, ai: finalPromptText.substring(0, 1000) });
          onResponse({ text: finalPromptText, is_action: false });
          return;
        }
      }
    } catch (err) {
      console.error("[ASK JS] Error:", err);
      const errorStr = err.message.toLowerCase();
      let userMessage = err.message;
      const provider = settings.modelProvider || 'gemini';

      if (errorStr.includes("quota") || errorStr.includes("exceeded") || errorStr.includes("429")) {
        userMessage = "AI Quota exceeded. Rotating API key for next request. Please try again in a moment.";
        if (provider === 'openrouter') firebaseService.rotateOpenRouterKey();
        else firebaseService.rotateGeminiKey();
      }

      onError({ message: userMessage });
    }
  }

  stopTask() { this.stopRequested = true; }
}

module.exports = AskBackend;
