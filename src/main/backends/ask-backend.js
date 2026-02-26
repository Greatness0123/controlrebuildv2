const { GoogleGenerativeAI } = require("@google/generative-ai");
const screenshot = require("screenshot-desktop");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const playwrightManager = require("../playwright-manager");

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
- **Analyze user\'s screen** when needed
- **Check system status** (battery, memory, etc.)
- **Use web search** for real-time info or research

**SYSTEM COMMANDS REFERENCE:**
- **Battery Status:**
  - Windows: \`WMIC Path Win32_Battery Get EstimatedChargeRemaining\`
  - macOS: \`pmset -g batt\`
  - Linux: \`upower -i $(upower -e | grep 'BAT') | grep -E "state|to\ full|percentage"\`
- **Memory/Process:** \`pgrep\`, \`top\`,\`ls\`, \`dir\`

**TOOLS AVAILABLE:**
- \`[REQUEST_SCREENSHOT]\`: Request a current screen capture
- \`[REQUEST_COMMAND: <command>]\`: Run read-only system commands
- \`[BROWSER_OPEN: <url>]\`: Open the agentic browser instance (titled "Control Agentic Browser") to a URL.
- \`[BROWSER_EXECUTE_JS: <script>]\`: Execute JS in the agentic browser instance.
- \`[BROWSER_SCREENSHOT]\`: Capture a screenshot of ONLY the agentic browser window content for detailed analysis.
- \`[DISPLAY_CODE: <language>\\n<code>]\`: Display a formatted code block with a copy button.

**CODE DISPLAY & FORMATTING:**
- **CRITICAL:** When providing code snippets, scripts, or HTML, you MUST use the \`[DISPLAY_CODE: <language>\\n<code>]\` tool.
- **NEVER** output raw HTML or code directly in your text response. This ensures code is displayed in a specialized, copyable box and prevents accidental rendering of HTML as actual UI.
- Example: \`[DISPLAY_CODE: python\\nprint("Hello World")]\`

**WORKFLOW:**
1. Request info tools automatically if needed.
2. ALWAYS PREFER read-only terminal commands (e.g. \`pgrep\`, \`ls\`, \`dir\`) over screenshots to check system state.
3. Use web search (googleSearch tool) proactively.
4. Provide final answers grounded in the gathered information.
5. Include citations if web search was used.
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
    const browserOpenMatch = /\[BROWSER_OPEN:\s*(.+?)\]/.exec(responseText);
    const browserJsMatch = /\[BROWSER_EXECUTE_JS:\s*([\s\S]+?)\]/.exec(responseText);
    const browserScreenshotMatch = /\[BROWSER_SCREENSHOT\]/.exec(responseText);

    let requestType = null;
    let requestData = null;

    if (screenshotMatch) requestType = "screenshot";
    else if (commandMatch) {
      requestType = "command";
      requestData = commandMatch[1].trim();
    } else if (browserOpenMatch) {
      requestType = "browser_open";
      requestData = browserOpenMatch[1].trim();
    } else if (browserJsMatch) {
      requestType = "browser_js";
      requestData = browserJsMatch[1].trim();
    } else if (browserScreenshotMatch) {
      requestType = "browser_screenshot";
    }

    // Process [DISPLAY_CODE] blocks in-place for better flow
    const cleanText = responseText
        .replace(/\[DISPLAY_CODE:\s*([\w-]+)\s*\n([\s\S]+?)\]/g, (match, lang, code) => {
            return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
        })
        .replace(/\[REQUEST_SCREENSHOT\]/g, "")
        .replace(/\[REQUEST_COMMAND:\s*.+?\]/g, "")
        .replace(/\[BROWSER_OPEN:\s*.+?\]/g, "")
        .replace(/\[BROWSER_EXECUTE_JS:\s*.+?\]/g, "")
        .replace(/\[BROWSER_SCREENSHOT\]/g, "")
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
    const url = `${settings.ollamaUrl || "http://localhost:11434"}/api/generate`;
    const body = {
      model: settings.ollamaModel || "llama3",
      prompt: prompt,
      system: systemPrompt,
      stream: false
    };
    if (images.length > 0) {
      body.images = images;
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    return data.response;
  }

  async universalGenerate(conversationParts, systemPrompt, settings) {
    const provider = settings.modelProvider;
    let apiKey = settings[`${provider}ApiKey`] || settings.universalApiKey;
    let model = settings[`${provider}Model`] || settings.universalModel;
    let baseUrl = settings.universalBaseUrl;

    // Default endpoints for known providers
    const endpoints = {
      'openai': 'https://api.openai.com/v1/chat/completions',
      'deepseek': 'https://api.deepseek.com/chat/completions',
      'xai': 'https://api.x.ai/v1/chat/completions',
      'moonshot': 'https://api.moonshot.cn/v1/chat/completions',
      'zai': 'https://api.zhipuai.cn/paas/v4/chat/completions',
      'openrouter': 'https://openrouter.ai/api/v1/chat/completions',
      'lmstudio': 'http://localhost:1234/v1/chat/completions',
      'litellm': settings.universalBaseUrl || 'http://localhost:4000/chat/completions',
      'minimax': 'https://api.minimax.chat/v1/text/chat-completion-v2'
    };

    let url = baseUrl ? (baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`) : endpoints[provider];

    // Handle Cloud Providers specifically
    if (provider === 'azure') {
      apiKey = settings.cloudCredentials;
      model = settings.cloudModel;
      const endpoint = settings.cloudRegion; // Base URL
      if (!endpoint || !apiKey || !model) throw new Error("Azure requires Endpoint URL, API Key, and Deployment Name (Model ID).");
      url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`;
    } else if (provider === 'aws' || provider === 'vertex') {
      throw new Error(`${provider.toUpperCase()} is not yet natively supported. Please use LiteLLM or OpenRouter as a gateway for this provider.`);
    }

    if (!url) throw new Error(`Endpoint for provider ${provider} not found and no Base URL provided.`);

    // Handle OpenRouter specific logic
    if (provider === 'openrouter') {
      apiKey = settings.openrouterApiKey || (require("../firebase-service").getKeys()?.openrouter);
      model = settings.openrouterModel === "custom" ? settings.openrouterCustomModel : settings.openrouterModel;
    }

    if (!apiKey && provider !== 'lmstudio') throw new Error(`API Key for ${provider} is missing.`);

    const messages = [{ role: "system", content: systemPrompt }];
    for (const part of conversationParts) {
      if (typeof part === "string") {
        const role = part.startsWith("User:") ? "user" : (part.startsWith("Assistant:") ? "assistant" : "user");
        const content = part.replace(/^(User:|Assistant:|System:)\s*/, "");
        messages.push({ role, content });
      } else if (part.inlineData) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === "user") {
          if (typeof lastMessage.content === "string") {
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

    const headers = {
      "Content-Type": "application/json"
    };

    if (provider === 'azure') {
      headers["api-key"] = apiKey;
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    if (provider === 'openrouter') {
      headers["HTTP-Referer"] = "https://controlrebuild-website.vercel.app";
      headers["X-Title"] = "Control AI";
    }

    const body = { model, messages };

    // MiniMax uses a slightly different body format for some models but v2 is OpenAI compatible

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`${provider} error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async anthropicGenerate(conversationParts, systemPrompt, settings) {
    const apiKey = settings.anthropicApiKey || settings.universalApiKey;
    const model = settings.anthropicModel || settings.universalModel || "claude-3-5-sonnet-20240620";

    if (!apiKey) throw new Error("Anthropic API key is missing.");

    const messages = [];
    for (const part of conversationParts) {
      if (typeof part === "string") {
        const role = part.startsWith("User:") ? "user" : (part.startsWith("Assistant:") ? "assistant" : "user");
        const content = part.replace(/^(User:|Assistant:|System:)\s*/, "");
        messages.push({ role, content });
      } else if (part.inlineData) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === "user") {
          const imgContent = {
            type: "image",
            source: {
              type: "base64",
              media_type: part.inlineData.mimeType,
              data: part.inlineData.data
            }
          };
          if (typeof lastMessage.content === "string") {
            lastMessage.content = [{ type: "text", text: lastMessage.content }, imgContent];
          } else {
            lastMessage.content.push(imgContent);
          }
        }
      }
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Anthropic error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async processRequest(userRequest, attachments = [], onResponse, onError, apiKey, settings = {}) {
    this.stopRequested = false;

    const provider = settings.modelProvider || "gemini";

    // Special case: if OpenRouter is selected but the model is Gemini 1.5 Flash (SDK version), switch to gemini provider logic
    let effectiveProvider = provider;
    if (provider === "openrouter" && (settings.openrouterModel === "google/gemini-flash-1.5-sdk" || settings.openrouterModel === "gemini-native")) {
        effectiveProvider = "gemini";
    }

    const firebaseService = require("../firebase-service");
    const cachedKeys = firebaseService.getKeys();
    const defaultGeminiModel = cachedKeys ? cachedKeys.gemini_model : "gemini-1.5-flash";
    const geminiModel = settings.selectedModel || defaultGeminiModel;

    if (effectiveProvider === "gemini") {
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

        const sysMsg = "You are Control (Ask Mode), an intelligent AI assistant.";
        if (effectiveProvider === "ollama") {
          const prompt = conversationParts.map(p => typeof p === "string" ? p : JSON.stringify(p)).join("\n");
          responseText = await this.ollamaGenerate(prompt, sysMsg, settings);
        } else if (effectiveProvider === "anthropic") {
          responseText = await this.anthropicGenerate(conversationParts, sysMsg, settings);
        } else if (["openai", "deepseek", "xai", "moonshot", "zai", "openrouter", "lmstudio", "litellm", "minimax", "azure", "aws", "vertex"].includes(effectiveProvider)) {
          responseText = await this.universalGenerate(conversationParts, sysMsg, settings);
        } else if (effectiveProvider === "gemini") {
          const result = await this.model.generateContent(conversationParts);
          responseObj = await result.response;
          if (responseObj.usageMetadata && cachedUser) firebaseService.updateTokenUsage(cachedUser.id, "ask", responseObj.usageMetadata);
          responseText = responseObj.text().trim();
        } else {
          throw new Error(`Provider ${effectiveProvider} is not yet fully integrated in this mode. Please use LiteLLM or OpenRouter as a gateway.`);
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
        } else if (requestType === "browser_open") {
          await playwrightManager.open(requestData);
          conversationParts.push(`Assistant: ${cleanText}`, `System: Browser opened to ${requestData} via Playwright. You can now request a screenshot to see it.`);
          continue;
        } else if (requestType === "browser_js") {
          let output = "";
          try {
            const res = await playwrightManager.executeJs(requestData);
            output = JSON.stringify(res) || "Success (no return value)";
          } catch (e) {
            output = `Error: ${e.message}`;
          }
          const status = await playwrightManager.getStatus();
          conversationParts.push(`Assistant: ${cleanText}`, `System: JS output: ${output}. Current Browser URL: ${status.url}`);
          continue;
        } else if (requestType === "browser_screenshot") {
          try {
            const buffer = await playwrightManager.takeScreenshot();
            conversationParts.push(`Assistant: ${cleanText}`, { inlineData: { mimeType: "image/png", data: buffer.toString("base64") } }, "System: Here is the browser screenshot via Playwright.");
          } catch (e) {
            conversationParts.push(`Assistant: ${cleanText}`, `System: Browser screenshot error: ${e.message}`);
          }
          continue;
        } else {
          // Final response turn
          const finalAIResponse = cleanText || responseText;

          this.conversationHistory.push({ user: userRequest, ai: finalAIResponse });
          onResponse({ text: finalAIResponse, is_action: false });
          return;
        }
      }
    } catch (err) {
      console.error("[ASK JS] Error:", err);
      const errorStr = err.message.toLowerCase();
      let userMessage = err.message;
      const provider = settings.modelProvider || "gemini";

      if (errorStr.includes("quota") || errorStr.includes("exceeded") || errorStr.includes("429")) {
        userMessage = "AI Quota exceeded. Rotating API key for next request. Please try again in a moment.";
        if (provider === "openrouter") firebaseService.rotateOpenRouterKey();
        else firebaseService.rotateGeminiKey();
      }

      onError({ message: userMessage });
    }
  }

  stopTask() { this.stopRequested = true; }
}

module.exports = AskBackend;
