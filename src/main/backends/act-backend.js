const { GoogleGenerativeAI } = require("@google/generative-ai");
const screenshot = require("screenshot-desktop");
const { mouse, keyboard, Button, Point, Key, straightTo } = require("@computer-use/nut-js");
const { screen } = require("electron");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Jimp = require("jimp");
const storageManager = require("../storage-manager");

const SYSTEM_PROMPT = `You are Control (Act Mode), A HIGH-PERFORMANCE INTELLIGENT AGENT AI assistant designed for GUI automation and task execution.

**YOUR ROLE:**
- You are an AGENTIC AI that EXECUTES TASKS on the user's computer.
- You create dynamic plans (BLUEPRINTS) that adapt as you act and learn from changes.
- You can make plans, make decisions, and adapt strategies to complete tasks to user satisfaction.
- If the request is a question, REJECT IT and ask the user to switch to "Ask" mode.

**DYNAMIC PLANNING:**
- Create a clear internal plan for how to achieve the user's goal.
- After each set of actions, re-evaluate your plan based on the new screen state.

**FULL UNDERSTANDING:** READ the user request CAREFULLY. Understand the GOAL before acting.

**CRITICAL: TERMINAL-FIRST APPROACH**
- For tasks involving third-party applications or system control, ALWAYS PREFER TERMINAL COMMANDS and lightweight packages over GUI automation.
- Terminal is more reliable and faster than GUI clicking.
- If a package (Python/Node) exists to perform the task (e.g. `pyatspi`, `nut-js`, `robotjs`, or app-specific CLI tools like `spotify-cli`), USE IT.
- Before installing any new package, PERFORM SUFFICIENT RESEARCH to ensure it exists, is maintained, and fits the task. Use `googleSearch` if needed.
- If you must use GUI, explain WHY the terminal method was not chosen.

**COORDINATE PRECISION & SPATIAL REASONING:**
- You perceive the screenshot in a normalized 1000x1000 grid.
- **COORDINATES:** Use x and y values from 0 to 999 (normalized grid).
- **IMPORTANT:** You MUST map your 1000x1000 mental grid to the ACTUAL OS resolution provided in the context (e.g. 1920x1080).
- **SCALING LOGIC:** For a screen of WxH, a coordinate (x,y) in your 1000-unit grid will be executed at (x/1000 * W, y/1000 * H).
- **ANCHORING:** Look for distinct UI anchors (text, icons, borders) and use them to triangulate your coordinates.
- **CENTERING:** Always target the EXACT VISUAL CENTER of an element.
- **CONFIDENCE:** For every coordinate-based action, you MUST provide a "confidence" percentage (0-100). If confidence is low, consider using keyboard shortcuts or terminal instead.

**OS-AWARE NAVIGATION:**
- You will receive the Operating System (Windows, macOS, Linux).
- UI elements, shortcuts, and navigation patterns VARY per OS. Use correct keyboard shortcuts (e.g. Cmd vs Ctrl) and terminal commands (e.g. `ls` vs `dir`).

**RESPONSE FORMAT:**
You can provide free-form markdown commentary BEFORE the JSON block to explain your research or thoughts. Then, always conclude with a JSON object in this format:
{
  "type": "task",
  "thought": "Your internal reasoning for the current step",
  "analysis": "Current UI state analysis",
  "actions": [
    {
      "step": 1,
      "description": "Action description",
      "action": "screenshot|click|type|key_press|double_click|mouse_move|drag|scroll|terminal|wait|focus_window|read_preferences|write_preferences|read_libraries|write_libraries|research_package",
      "parameters": {
        "x": 500, // Normalized 0-999
        "y": 500, // Normalized 0-999
        "confidence": 95
      },
      "verification": {
        "expected_outcome": "Outcome",
        "verification_method": "visual|terminal_output|window_check"
      }
    }
  ],
  "after_message": "Final summary or suggestion"
}

**ACTION REFERENCE:**
- click/double_click/mouse_move/scroll: Include {"x": val, "y": val, "confidence": 95}
- drag: {"x": x1, "y": y1, "end_x": x2, "end_y": y2, "confidence": 95}
- type: {"text": "...", "x": optional_x, "y": optional_y, "clear_first": true, "confidence": 100}
- terminal: {"command": "...", "confidence": 100}
- research_package: {"name": "package-name", "type": "python|node", "query": "..."}
- focus_window: {"app_name": "...", "confidence": 100}

**HUMAN-IN-THE-LOOP:**
- For high-risk actions (terminal, system changes), if "proceedWithoutConfirmation" is FALSE, request confirmation.
`;

class ActBackend {
  constructor(options = {}) {
    this.screenshotDir = path.join(os.tmpdir(), "control_screenshots");
    if (!fs.existsSync(this.screenshotDir)) fs.mkdirSync(this.screenshotDir);

    this.maxActionRetries = 3;
    this.verificationWait = 500;
    this.model = null;
    this.currentApiKey = null;
    this.setupGeminiAPI();

    this.stopRequested = false;
    this.screenSize = { width: 1920, height: 1080 };
    
    this.conversationHistory = [];
    this.maxHistoryLength = 20;
    this.currentBlueprint = [];
  }

  setupGeminiAPI(apiKey) {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_FREE_KEY || "test_api_key";
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (key === this.currentApiKey && this.model) return;

    this.currentApiKey = key;
    const genAI = new GoogleGenerativeAI(key);
    const modelOptions = {
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {}
    };

    if (!process.env.DISABLE_SEARCH_TOOL) {
      modelOptions.tools = [{ googleSearch: {} }];
    }

    this.model = genAI.getGenerativeModel(modelOptions);
    console.log(`[ACT JS] Model initialized with: ${modelName}`);
  }

  async takeScreenshot(markCursor = true) {
    try {
      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.png`;
      const filepath = path.join(this.screenshotDir, filename);

      // Attempt to capture primary display specifically to match coordinate scaling
      let imgBuffer;
      try {
        const displays = await screenshot.listDisplays();
        const primary = displays.find(d => d.id === 0) || displays[0];
        imgBuffer = await screenshot({ format: "png", screen: primary.id });
      } catch (e) {
        imgBuffer = await screenshot({ format: "png" });
      }

      const image = await Jimp.read(imgBuffer);

      // Important: Use primary display bounds for perceived screen size to match executeAction scaling
      const primaryDisplay = screen.getPrimaryDisplay();
      this.screenSize = { 
        width: primaryDisplay.bounds.width,
        height: primaryDisplay.bounds.height,
        pixelWidth: image.bitmap.width,
        pixelHeight: image.bitmap.height
      };

      let cursorX = 0, cursorY = 0;
      try {
        const pos = await mouse.getPosition();
        cursorX = pos.x;
        cursorY = pos.y;
      } catch (e) { }

      if (markCursor && cursorX > 0 && cursorY > 0) {
        const color = 0xFF0000FF;
        const radius = 15;
        let markX = cursorX;
        let markY = cursorY;

        const primaryDisplay = screen.getPrimaryDisplay();
        const logicalWidth = primaryDisplay.bounds.width;
        const logicalHeight = primaryDisplay.bounds.height;

        if (cursorX <= logicalWidth && cursorY <= logicalHeight && (logicalWidth !== image.bitmap.width)) {
           markX = Math.round(cursorX * (image.bitmap.width / logicalWidth));
           markY = Math.round(cursorY * (image.bitmap.height / logicalHeight));
        }

        for (let i = -radius; i <= radius; i++) {
          if (markX + i >= 0 && markX + i < image.bitmap.width) image.setPixelColor(color, markX + i, markY);
          if (markY + i >= 0 && markY + i < image.bitmap.height) image.setPixelColor(color, markX, markY + i);
        }
      }
      await image.writeAsync(filepath);
      return { filepath, metadata: { screen_width: this.screenSize.width, screen_height: this.screenSize.height, cursor_x: cursorX, cursor_y: cursorY, timestamp } };
    } catch (err) {
      console.error("[ACT JS] Screenshot error:", err);
      return null;
    }
  }

  async executeAction(action, onEvent) {
    const actionType = action.action.toLowerCase();
    const params = action.parameters || {};
    const result = { success: false, message: "", action: actionType };

    if (params.confidence !== undefined) {
        console.log(`[ACT JS] Action: ${actionType}, Confidence: ${params.confidence}%`);
    }

    try {
      switch (actionType) {
        case "screenshot":
          const shot = await this.takeScreenshot();
          result.success = !!shot;
          result.screenshot = shot.filepath;
          break;

        case "click":
        case "double_click":
        case "mouse_move":
          if (params.x !== undefined && params.y !== undefined) {
            const x = Math.round((params.x / 1000) * this.screenSize.width);
            const y = Math.round((params.y / 1000) * this.screenSize.height);

            await mouse.setPosition(new Point(x, y));
            if (actionType === "click") await mouse.leftClick();
            if (actionType === "double_click") await mouse.doubleClick(Button.LEFT);
            result.success = true;
            result.message = `${actionType} at (${x}, ${y}) with ${params.confidence}% confidence`;
          }
          break;

        case "type":
          if (params.text) {
            if (params.x !== undefined && params.y !== undefined) {
              const x = Math.round((params.x / 1000) * this.screenSize.width);
              const y = Math.round((params.y / 1000) * this.screenSize.height);

              await mouse.setPosition(new Point(x, y));
              await mouse.leftClick();
              await new Promise(r => setTimeout(r, 200));
            }
            if (params.clear_first) {
              const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
              await keyboard.pressKey(modifier, Key.A);
              await keyboard.releaseKey(modifier, Key.A);
              await keyboard.pressKey(Key.Backspace);
              await keyboard.releaseKey(Key.Backspace);
            }
            await keyboard.type(params.text);
            result.success = true;
            result.message = `Typed text with ${params.confidence || 100}% confidence`;
          }
          break;

        case "key_press":
          if (params.keys) {
            const keyMap = {
              "control": Key.LeftControl, "ctrl": Key.LeftControl,
              "shift": Key.LeftShift, "alt": Key.LeftAlt,
              "win": Key.LeftWin, "command": Key.LeftCmd, "cmd": Key.LeftCmd,
              "enter": Key.Enter, "return": Key.Enter,
              "tab": Key.Tab, "escape": Key.Escape, "esc": Key.Escape,
              "backspace": Key.Backspace, "delete": Key.Delete,
              "space": Key.Space, "up": Key.Up, "down": Key.Down,
              "left": Key.Left, "right": Key.Right
            };
            const keys = params.keys.map(k => {
              const lowK = k.toLowerCase();
              if (keyMap[lowK]) return keyMap[lowK];
              if (/^[a-z]$/.test(lowK)) return Key[lowK.toUpperCase()];
              if (/^[0-9]$/.test(lowK)) return Key[`Num${lowK}`];
              return k;
            });
            if (params.combo) {
              await keyboard.pressKey(...keys);
              await keyboard.releaseKey(...keys);
            } else {
              for (const k of keys) await keyboard.type(k);
            }
            result.success = true;
            result.message = `Keys pressed: ${params.keys.join("+")}`;
          }
          break;

        case "drag":
          if (params.x !== undefined && params.y !== undefined && params.end_x !== undefined && params.end_y !== undefined) {
            const x1 = Math.round((params.x / 1000) * this.screenSize.width);
            const y1 = Math.round((params.y / 1000) * this.screenSize.height);
            const x2 = Math.round((params.end_x / 1000) * this.screenSize.width);
            const y2 = Math.round((params.end_y / 1000) * this.screenSize.height);

            await mouse.setPosition(new Point(x1, y1));
            await mouse.drag(straightTo(new Point(x2, y2)));
            result.success = true;
            result.message = `Dragged from (${x1}, ${y1}) to (${x2}, ${y2})`;
          }
          break;

        case "scroll":
          if (params.direction) {
            if (params.x !== undefined && params.y !== undefined) {
              const x = Math.round((params.x / 1000) * this.screenSize.width);
              const y = Math.round((params.y / 1000) * this.screenSize.height);
              await mouse.setPosition(new Point(x, y));
            }
            const amount = params.amount || 3;
            if (params.direction === "up") await mouse.scrollUp(amount * 100);
            else await mouse.scrollDown(amount * 100);
            result.success = true;
            result.message = `Scrolled ${params.direction}`;
          }
          break;

        case "focus_window":
          if (params.app_name) {
            let command = "";
            if (process.platform === "win32") command = `powershell -Command "(New-Object -ComObject WScript.Shell).AppActivate('${params.app_name}')"`;
            else if (process.platform === "darwin") command = `osascript -e 'tell application "${params.app_name}" to activate'`;
            else command = `wmctrl -a "${params.app_name}"`;
            await new Promise(resolve => exec(command, resolve));
            result.success = true;
            result.message = `Focused ${params.app_name}`;
          }
          break;

        case "terminal":
          if (params.command) {
            const output = await new Promise(resolve => {
              exec(params.command, (err, stdout, stderr) => {
                resolve({ success: !err, out: stdout || stderr });
              });
            });
            result.success = output.success;
            result.message = output.out.substring(0, 200);
          }
          break;

        case "research_package":
          result.success = true;
          result.message = `Researched package: ${params.name}`;
          break;

        case "read_preferences":
          result.success = true;
          result.message = JSON.stringify(storageManager.readPreferences());
          break;

        case "write_preferences":
          storageManager.writePreferences(params.preferences);
          result.success = true;
          result.message = "Preferences updated";
          break;

        case "read_libraries":
          result.success = true;
          result.message = JSON.stringify(storageManager.readLibraries());
          break;

        case "write_libraries":
          storageManager.addLibrary(params.type, params.name, params.version);
          result.success = true;
          result.message = `Library ${params.name} added`;
          break;

        case "wait":
          await new Promise(r => setTimeout(r, (params.duration || 1) * 1000));
          result.success = true;
          break;

        default:
          result.message = `Unknown action: ${actionType}`;
      }
    } catch (err) {
      result.message = err.message;
    }

    return result;
  }

  async verifyAction(action, executionResult) {
    const verificationInfo = action.verification || {};
    if (!verificationInfo.expected_outcome) return { verified: true, message: "No verification needed" };

    const shot = await this.takeScreenshot();
    const prompt = `VERIFICATION TASK:
Action executed: ${action.action}
Description: ${action.description}
Expected outcome: ${verificationInfo.expected_outcome}
Execution result: ${executionResult.message}

Analyze the screenshot and determine if the action was successful. Respond ONLY with JSON: {"verification_status": "success|failure", "observations": "..."}`;

    const content = [
      { inlineData: { mimeType: "image/png", data: fs.readFileSync(shot.filepath).toString("base64") } },
      prompt
    ];
    try {
      const result = await this.model.generateContent(content);
      const text = (await result.response).text();
      const jsonMatch = /\{[\s\S]*\}/.exec(text);
      if (!jsonMatch) throw new Error("No JSON found in verification response");
      const data = JSON.parse(jsonMatch[0]);
      return { verified: data.verification_status === "success", message: data.observations };
    } catch (err) {
      return { verified: false, message: "Verification error: " + err.message };
    }
  }

  formatCitations(response) {
    try {
        const metadata = response.candidates?.[0]?.groundingMetadata;
        let text = "";
        try {
            text = response.text();
        } catch (e) {
            console.warn("[ACT JS] No text in response, checking metadata");
        }

        if (!metadata || !metadata.groundingChunks) return text;
        const chunks = metadata.groundingChunks;
        const supports = metadata.groundingSupports || [];

        const sortedSupports = [...supports].sort((a, b) =>
            (b.segment?.endIndex || 0) - (a.segment?.endIndex || 0)
        );

        const usedLinks = new Map();
        let linkCounter = 1;

        for (const support of sortedSupports) {
            const endIndex = support.segment?.endIndex;
            if (endIndex === undefined || !support.groundingChunkIndices?.length) continue;

            const citations = support.groundingChunkIndices.map(idx => {
                const chunk = chunks[idx];
                if (chunk?.web?.uri) {
                    if (!usedLinks.has(chunk.web.uri)) {
                        usedLinks.set(chunk.web.uri, linkCounter++);
                    }
                    // Return plain text citation without Markdown link
                    return `[${usedLinks.get(chunk.web.uri)}]`;
                }
                return null;
            }).filter(Boolean);

            if (citations.length > 0) {
                text = text.slice(0, endIndex) + " " + citations.join(", ") + text.slice(endIndex);
            }
        }

        // If text is empty but we have metadata, use a placeholder
        if (!text.trim() && usedLinks.size > 0) {
            text = "I researched the following sources for your task:";
        }

        if (usedLinks.size > 0) {
            text += "\n\n**Sources:**\n";
            const sortedLinks = Array.from(usedLinks.entries()).sort((a, b) => a[1] - b[1]);
            for (const [uri, id] of sortedLinks) {
                try {
                    const domain = new URL(uri).hostname;
                    text += `${id}. ${domain}\n`;
                } catch (e) {
                    text += `${id}. Source [${id}]\n`;
                }
            }
        }

        return text;
    } catch (e) {
        console.error("[ACT JS] Citation formatting error:", e);
        return response.text();
    }
  }

  async processRequest(userRequest, attachments = [], onEvent, onError, apiKey) {
    this.stopRequested = false;
    this.setupGeminiAPI(apiKey);
    const firebaseService = require('../firebase-service');
    const cachedUser = firebaseService.checkCachedUser();

    onEvent("task_start", { task: userRequest, show_effects: true });

    try {
      let loopCount = 0;
      const maxLoops = 15;
      let lastResultContext = "";

      while (loopCount < maxLoops && !this.stopRequested) {
        loopCount++;
        await new Promise(r => setTimeout(r, 400));
        const shot = await this.takeScreenshot();
        if (!shot) throw new Error("Screenshot failed");

        const prefs = storageManager.readPreferences();
        const libs = storageManager.readLibraries();

        const prompt = `User Request: ${userRequest}
User Preferences: ${JSON.stringify(prefs)}
Installed Libraries: ${JSON.stringify(libs)}
Last Action Result: ${lastResultContext}
OS: ${process.platform}, Screen: ${this.screenSize.width}x${this.screenSize.height}

Analyze screen and provide IMMEDIATE ACTIONS. Respond with JSON.`;

        const content = [
          { inlineData: { mimeType: "image/png", data: fs.readFileSync(shot.filepath).toString("base64") } }
        ];

        if (attachments && attachments.length > 0) {
            for (const att of attachments) {
                if (att.path && fs.existsSync(att.path)) {
                    const ext = path.extname(att.path).toLowerCase();
                    const mimeMap = {
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.webp': 'image/webp',
                        '.pdf': 'application/pdf'
                    };
                    if (mimeMap[ext]) {
                        content.push({ inlineData: { mimeType: mimeMap[ext], data: fs.readFileSync(att.path).toString("base64") } });
                    }
                }
            }
        }

        // Place text prompt after images as per best practices
        content.push(prompt);

        const result = await this.model.generateContent(content);
        const response = await result.response;
        if (response.usageMetadata && cachedUser) firebaseService.updateTokenUsage(cachedUser.id, 'act', response.usageMetadata);

        const fullText = this.formatCitations(response);
        const jsonMatch = /\{[\s\S]*\}/.exec(fullText);

        // If no JSON found, it might be a pure research response or grounding metadata
        if (!jsonMatch) {
            const cleanMarkdown = fullText.trim();
            if (cleanMarkdown) {
                onEvent("ai_response", { text: cleanMarkdown, is_action: false });
            }
            // If it's the last loop or no content, we should probably stop
            if (loopCount >= maxLoops) break;
            // Otherwise, we continue to the next loop which will re-take screenshot and re-prompt
            // This allows the model to "think" via search before acting
            continue;
        }

        const plan = JSON.parse(jsonMatch[0]);

        // Remove the JSON block from the text to get the clean markdown commentary
        const cleanMarkdown = fullText.replace(/\{[\s\S]*\}/, "").trim();

        // this.currentBlueprint = plan.blueprint || this.currentBlueprint;
        // onEvent("plan_update", { blueprint: this.currentBlueprint, thought: plan.thought });

        const thoughtToDisplay = plan.thought || cleanMarkdown;
        if (thoughtToDisplay) onEvent("ai_response", { text: thoughtToDisplay, is_action: false });

        const actions = plan.actions || [];
        if (actions.length === 0) {
            onEvent("task_complete", { task: userRequest, success: true });
            // For the final message, use the clean markdown if thought is empty
            const finalMessage = plan.after_message || (plan.thought ? "" : cleanMarkdown);
            if (finalMessage) onEvent("after_message", { text: finalMessage });
            break;
        }

        for (const action of actions) {
            if (this.stopRequested) break;

            const isHighRisk = ["terminal", "write_preferences", "write_libraries"].includes(action.action.toLowerCase());
            if (!prefs.proceedWithoutConfirmation && isHighRisk) {
                onEvent("request_confirmation", {
                    description: action.description,
                    action: action.action,
                    parameters: action.parameters
                });

                const confirmed = await new Promise((resolve) => {
                    this.confirmationResolver = resolve;
                    setTimeout(() => {
                        if (this.confirmationResolver === resolve) {
                            this.confirmationResolver = null;
                            resolve(false);
                        }
                    }, 60000);
                });

                if (!confirmed) {
                    onEvent("ai_response", { text: "Task paused. High-risk action was not confirmed by user.", is_action: false });
                    this.stopRequested = true;
                    break;
                }
            }

            onEvent("action_start", { description: action.description });
            const execResult = await this.executeAction(action, onEvent);
            const verification = await this.verifyAction(action, execResult);
            lastResultContext = `Action: ${action.action}, Success: ${verification.verified}, Notes: ${verification.message}`;
            onEvent("action_complete", {
                description: action.description,
                success: verification.verified,
                details: verification.message,
                confidence: action.parameters?.confidence
            });
            if (!verification.verified) break;
        }
      }
    } catch (err) {
      console.error("[ACT JS] Task error:", err);
      const errorStr = err.message.toLowerCase();
      let userMessage = err.message;

      if (errorStr.includes("quota") || errorStr.includes("exceeded") || errorStr.includes("429")) {
        userMessage = "AI Quota exceeded. Rotating API key for next request. Please try again in a moment.";
        firebaseService.rotateGeminiKey();
      } else if (errorStr.includes("google_search_retrieval")) {
        userMessage = "Search tool configuration error. Rotating key and updating tool settings. Please retry.";
        firebaseService.rotateGeminiKey();
      }

      onError({ message: userMessage });
    }
  }

  handleConfirmation(confirmed) {
    if (this.confirmationResolver) {
        this.confirmationResolver(confirmed);
        this.confirmationResolver = null;
    }
  }

  stopTask() {
    this.stopRequested = true;
  }
}

module.exports = ActBackend;
