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

**WORKFLOW EXECUTION:**
- If the user provides a "Workflow" with numbered steps, you MUST follow these steps sequentially.
- Treat each step as a sub-goal. Use your intelligence to decide the best actions (clicking, typing, etc.) to complete each step.
- Continue until all steps in the workflow are finished or you encounter an unrecoverable error.

**FULL UNDERSTANDING:** READ the user request CAREFULLY. Understand the GOAL before acting.

**CRITICAL: TERMINAL-FIRST APPROACH**
- For tasks involving third-party applications, system control, OR VERIFICATION, ALWAYS PREFER TERMINAL COMMANDS and lightweight packages over GUI automation.
- Terminal is more reliable and faster than GUI clicking.
- **VERIFICATION:** Use terminal commands (e.g. \`pgrep\`, \`ls\`, \`test -f\`) to verify the success of your actions whenever possible.
- If a package (Python/Node) exists to perform the task (e.g. \`pyatspi\`, \`nut-js\`, \`robotjs\`, or app-specific CLI tools like \`spotify-cli\`), USE IT.
- Before installing any new package, PERFORM SUFFICIENT RESEARCH to ensure it exists, is maintained, and fits the task. Use \`googleSearch\` if needed.
- If you must use GUI, explain WHY the terminal method was not chosen.

**CODE DISPLAY & FORMATTING:**
- **CRITICAL:** When you need to provide code snippets, scripts, or HTML to the user, you MUST use the \`display_code\` action.
- **NEVER** output raw HTML or large code blocks in your markdown commentary. This prevents accidental rendering of code as actual UI.
- The \`display_code\` action will show the code in a specialized, copyable code box with syntax highlighting.
- Supported languages include: python, javascript, html, css, bash, json, etc.

**COORDINATE PRECISION & NATIVE OBJECT DETECTION:**
- You perceive the screenshot in a normalized 1000x1000 grid.
- **OBJECT DETECTION:** Use your native object detection capabilities. When identifying elements to interact with, you MUST provide the "box2d" parameter.
- **BOX2D FORMAT:** Use [ymin, xmin, ymax, xmax] normalized to 0-1000.
- **IMPORTANT:** Always target the EXACT VISUAL CENTER of the identified element for maximum precision.
- **COORDINATES:** We will map your normalized [0, 1000] coordinates to the actual display dimensions.
- **ANCHORING:** Look for distinct UI anchors (text, icons, borders) and use them to triangulate your coordinates.
- **CONFIDENCE:** For every spatial action, provide a "confidence" percentage (0-100). If confidence is low, consider using keyboard shortcuts or terminal instead.

**OS-AWARE NAVIGATION:**
- You will receive the Operating System (Windows, macOS, Linux).
- UI elements, shortcuts, and navigation patterns VARY per OS. Use correct keyboard shortcuts (e.g. Cmd vs Ctrl) and terminal commands (e.g. \`ls\` vs \`dir\`).

**STABILITY & VERIFICATION:**
- If an action (like opening an app or saving a file) takes time to reflect on the screen, use a \`wait\` action (e.g. 1-3 seconds) BEFORE performing visual verification.
- Accurate results are paramount. If you are unsure if an action finished, \`wait\` and take another \`screenshot\`.

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
      "action": "screenshot|click|type|key_press|double_click|mouse_move|drag|scroll|terminal|wait|focus_window|read_preferences|write_preferences|read_libraries|write_libraries|research_package|web_search|display_code",
      "parameters": {
        "box2d": [ymin, xmin, ymax, xmax], // Normalized [0, 1000]
        "label": "button name",
        "confidence": 95
      },
      "verification": {
        "expected_outcome": "Outcome",
        "verification_method": "visual|terminal_output|window_check",
        "verification_command": "ls | grep file (Required if method is terminal_output)"
      }
    }
  ],
  "after_message": "Final summary or suggestion"
}

**ACTION REFERENCE:**
- click/double_click/mouse_move/scroll: Include {"box2d": [ymin, xmin, ymax, xmax], "confidence": 95}
- drag: {"box2d": [ymin, xmin, ymax, xmax], "end_box2d": [ymin, xmin, ymax, xmax], "confidence": 95}
- type: {"text": "...", "box2d": [ymin, xmin, ymax, xmax], "clear_first": true, "confidence": 100}
- terminal: {"command": "...", "confidence": 100}
- research_package: {"name": "package-name", "type": "python|node", "query": "..."}
- focus_window: {"app_name": "...", "confidence": 100}
- web_search: {"query": "..."} Use this to search the web for information when required by a workflow or task.
- browser_open: {"url": "..."} - Opens a dedicated, AI-controlled browser window. Use this for deep research or if native search tools are unavailable.
- browser_execute_js: {"script": "..."} - Executes JavaScript on the current page in the AI-controlled browser. (Wait for page load if navigation is triggered).
- browser_screenshot: {} - Captures a screenshot of ONLY the agentic browser window content for detailed analysis.
- browser_close: {} - Hides the AI-controlled browser window.
- display_code: {"code": "...", "language": "python|javascript|html|..."} (Use this to show code blocks clearly to the user with a copy button)

**AGENTIC BROWSER CONTROL:**
- For models without native web search (like Ollama), use \`browser_open\` to navigate to a search engine and \`browser_execute_js\` to interact with results.
- This browser is a DEDICATED instance managed by Control, titled "Control Agentic Browser".
- **CRITICAL:** You must ONLY use \`browser_execute_js\` to interact with this specific browser window. Do NOT attempt to use \`click\` or \`type\` on other system browser windows (like Chrome or Edge) unless explicitly asked to automate the user's primary browser.
- This dedicated browser is visible to the user and shows a banner: "CONTROL IS USING THIS BROWSER".

**HUMAN-IN-THE-LOOP:**
- For high-risk actions (terminal, system changes), if "proceedWithoutConfirmation" is FALSE, request confirmation.
`;

const GENERAL_SYSTEM_PROMPT = `You are Control (Act Mode), an AI assistant for computer automation.
You receive screenshots of the user's screen and must provide actions to achieve their goal.

**COORDINATE SYSTEM:**
- The screen is normalized to a 1000x1000 grid.
- When you want to interact with an element, identify its bounding box.
- **FORMAT:** Use [xmin, ymin, xmax, ymax] normalized to 0-1000.
- **IMPORTANT:** Target the center of the element.

**CRITICAL: TERMINAL-FIRST VERIFICATION**
- ALWAYS PREFER TERMINAL COMMANDS (e.g. \`ls\`, \`pgrep\`) over visual checks to verify if an action was successful.
- Use the \`wait\` action if you believe the OS needs time to process a previous action before it becomes verifiable.

**RESPONSE FORMAT:**
Respond with a JSON object:
{
  "type": "task",
  "thought": "Reasoning",
  "actions": [
    {
      "description": "Action description",
      "action": "click|type|key_press|scroll|terminal|wait|web_search|display_code",
      "parameters": {
        "box2d": [xmin, ymin, xmax, ymax],
        "text": "text to type (if applicable)",
        "keys": ["key1", "key2"] (if applicable)
      }
    }
  ]
}

**WORKFLOW EXECUTION:**
- If the user provides a "Workflow" with numbered steps, follow them sequentially.
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
    this.currentProvider = 'gemini';
  }

  setupGeminiAPI(apiKey, modelName) {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_FREE_KEY || "test_api_key";
    const finalModelName = modelName || process.env.GEMINI_MODEL || "gemini-1.5-flash";

    if (key === this.currentApiKey && this.model && this.currentModelName === finalModelName) return;

    this.currentApiKey = key;
    this.currentModelName = finalModelName;
    const genAI = new GoogleGenerativeAI(key);
    const modelOptions = {
      model: finalModelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {}
    };

    if (!process.env.DISABLE_SEARCH_TOOL) {
      modelOptions.tools = [{ googleSearch: {} }];
    }

    this.model = genAI.getGenerativeModel(modelOptions);
    console.log(`[ACT JS] Model initialized with: ${finalModelName}`);
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
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
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
          if (params.box2d && Array.isArray(params.box2d) && params.box2d.length === 4) {
            let xmin, ymin, xmax, ymax;
            if (this.currentProvider === 'gemini') {
                [ymin, xmin, ymax, xmax] = params.box2d;
            } else {
                [xmin, ymin, xmax, ymax] = params.box2d;
            }
            const centerX = xmin + (xmax - xmin) / 2;
            const centerY = ymin + (ymax - ymin) / 2;

            const x = Math.round((centerX / 1000) * this.screenSize.width) + this.screenSize.x;
            const y = Math.round((centerY / 1000) * this.screenSize.height) + this.screenSize.y;

            console.log(`[ACT JS] Action: ${actionType}, Normalized Box: [${params.box2d}], Target: (${x}, ${y}) [${params.label || 'unlabeled'}]`);

            await mouse.setPosition(new Point(x, y));
            if (actionType === "click") await mouse.leftClick();
            if (actionType === "double_click") await mouse.doubleClick(Button.LEFT);
            result.success = true;
            result.message = `${actionType} at (${x}, ${y}) [${params.label || 'unlabeled'}] with ${params.confidence}% confidence`;
          } else if (params.x !== undefined && params.y !== undefined) {
            const x = Math.round((params.x / 1000) * this.screenSize.width) + this.screenSize.x;
            const y = Math.round((params.y / 1000) * this.screenSize.height) + this.screenSize.y;

            await mouse.setPosition(new Point(x, y));
            if (actionType === "click") await mouse.leftClick();
            if (actionType === "double_click") await mouse.doubleClick(Button.LEFT);
            result.success = true;
            result.message = `${actionType} at (${x}, ${y}) with ${params.confidence}% confidence`;
          }
          break;

        case "type":
          if (params.text) {
            if (params.box2d && Array.isArray(params.box2d) && params.box2d.length === 4) {
              let xmin, ymin, xmax, ymax;
              if (this.currentProvider === 'gemini') {
                  [ymin, xmin, ymax, xmax] = params.box2d;
              } else {
                  [xmin, ymin, xmax, ymax] = params.box2d;
              }
              const centerX = xmin + (xmax - xmin) / 2;
              const centerY = ymin + (ymax - ymin) / 2;

              const x = Math.round((centerX / 1000) * this.screenSize.width) + this.screenSize.x;
              const y = Math.round((centerY / 1000) * this.screenSize.height) + this.screenSize.y;

              await mouse.setPosition(new Point(x, y));
              await mouse.leftClick();
              await new Promise(r => setTimeout(r, 200));
            } else if (params.x !== undefined && params.y !== undefined) {
              const x = Math.round((params.x / 1000) * this.screenSize.width) + this.screenSize.x;
              const y = Math.round((params.y / 1000) * this.screenSize.height) + this.screenSize.y;

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
          if (params.box2d && params.end_box2d) {
            let x1_n, y1_n, x1_m, y1_m, x2_n, y2_n, x2_m, y2_m;
            if (this.currentProvider === 'gemini') {
                [y1_n, x1_n, y1_m, x1_m] = params.box2d;
                [y2_n, x2_n, y2_m, x2_m] = params.end_box2d;
            } else {
                [x1_n, y1_n, x1_m, y1_m] = params.box2d;
                [x2_n, y2_n, x2_m, y2_m] = params.end_box2d;
            }

            const x1 = Math.round(((x1_n + (x1_m - x1_n) / 2) / 1000) * this.screenSize.width) + this.screenSize.x;
            const y1 = Math.round(((y1_n + (y1_m - y1_n) / 2) / 1000) * this.screenSize.height) + this.screenSize.y;
            const x2 = Math.round(((x2_n + (x2_m - x2_n) / 2) / 1000) * this.screenSize.width) + this.screenSize.x;
            const y2 = Math.round(((y2_n + (y2_m - y2_n) / 2) / 1000) * this.screenSize.height) + this.screenSize.y;

            await mouse.setPosition(new Point(x1, y1));
            await mouse.drag(straightTo(new Point(x2, y2)));
            result.success = true;
            result.message = `Dragged from (${x1}, ${y1}) to (${x2}, ${y2})`;
          } else if (params.x !== undefined && params.y !== undefined && params.end_x !== undefined && params.end_y !== undefined) {
            const x1 = Math.round((params.x / 1000) * this.screenSize.width) + this.screenSize.x;
            const y1 = Math.round((params.y / 1000) * this.screenSize.height) + this.screenSize.y;
            const x2 = Math.round((params.end_x / 1000) * this.screenSize.width) + this.screenSize.x;
            const y2 = Math.round((params.end_y / 1000) * this.screenSize.height) + this.screenSize.y;

            await mouse.setPosition(new Point(x1, y1));
            await mouse.drag(straightTo(new Point(x2, y2)));
            result.success = true;
            result.message = `Dragged from (${x1}, ${y1}) to (${x2}, ${y2})`;
          }
          break;

        case "scroll":
          if (params.direction) {
            if (params.box2d) {
               let xmin, ymin, xmax, ymax;
               if (this.currentProvider === 'gemini') {
                   [ymin, xmin, ymax, xmax] = params.box2d;
               } else {
                   [xmin, ymin, xmax, ymax] = params.box2d;
               }
               const x = Math.round(((xmin + (xmax - xmin) / 2) / 1000) * this.screenSize.width) + this.screenSize.x;
               const y = Math.round(((ymin + (ymax - ymin) / 2) / 1000) * this.screenSize.height) + this.screenSize.y;
               await mouse.setPosition(new Point(x, y));
            } else if (params.x !== undefined && params.y !== undefined) {
              const x = Math.round((params.x / 1000) * this.screenSize.width) + this.screenSize.x;
              const y = Math.round((params.y / 1000) * this.screenSize.height) + this.screenSize.y;
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

        case "web_search":
          if (params.query) {
            const encodedQuery = encodeURIComponent(params.query);
            const searchUrl = `https://www.google.com/search?q=${encodedQuery}`;

            // Fallback to Agentic Browser if native tools (gemini) are unavailable
            if (this.currentProvider !== 'gemini') {
                const win = global.windowManager.getWindow('browser');
                if (win) {
                    console.log(`[ACT JS] Web search fallback to agentic browser for: ${params.query}`);
                    global.windowManager.showWindow('browser');
                    await win.loadURL(searchUrl);
                    result.success = true;
                    result.message = `Web search for "${params.query}" performed using agentic browser (native tool fallback).`;
                    return result;
                }
            }

            console.log(`[ACT JS] Web search requested for: ${params.query}`);
            let command = "";
            if (process.platform === "win32") {
                command = `start ${searchUrl}`;
            } else if (process.platform === "darwin") {
                command = `open "${searchUrl}"`;
            } else {
                command = `xdg-open "${searchUrl}"`;
            }

            await new Promise(resolve => exec(command, resolve));
            await new Promise(r => setTimeout(r, 2000)); // Wait for browser to open

            result.success = true;
            result.message = `Web search for "${params.query}" performed via system browser. Results are now visible on screen.`;
          } else {
            result.message = "No query provided for web search";
          }
          break;

        case "browser_open":
          if (params.url) {
            const win = global.windowManager.getWindow('browser');
            if (win) {
              global.windowManager.showWindow('browser');
              await win.loadURL(params.url);
              result.success = true;
              result.message = `Agentic browser opened to ${params.url}`;
            } else {
              result.message = "Browser window not available";
            }
          } else {
            result.message = "No URL provided for browser_open";
          }
          break;

        case "browser_execute_js":
          if (params.script) {
            const win = global.windowManager.getWindow('browser');
            if (win) {
              try {
                const jsResult = await win.webContents.executeJavaScript(params.script);
                // Give it a moment to react if it triggered a navigation
                await new Promise(r => setTimeout(r, 800));

                const currentUrl = win.webContents.getURL();
                const currentTitle = win.webContents.getTitle();

                result.success = true;
                result.message = `JS executed. Result: ${JSON.stringify(jsResult) || "Success (no return value)"}. Current URL: ${currentUrl}, Title: ${currentTitle}`;
                result.result = jsResult;
                result.url = currentUrl;
              } catch (e) {
                result.message = `JS error: ${e.message}`;
              }
            } else {
              result.message = "Browser window not available";
            }
          } else {
            result.message = "No script provided for browser_execute_js";
          }
          break;

        case "browser_screenshot":
          const browserWin = global.windowManager.getWindow('browser');
          if (browserWin) {
            try {
              const image = await browserWin.capturePage();
              const timestamp = Date.now();
              const filename = `browser_shot_${timestamp}.png`;
              const filepath = path.join(this.screenshotDir, filename);
              fs.writeFileSync(filepath, image.toPNG());
              result.success = true;
              result.screenshot = filepath;
              result.message = "Browser content captured specifically.";
            } catch (e) {
              result.message = `Browser screenshot error: ${e.message}`;
            }
          } else {
            result.message = "Browser window not available";
          }
          break;

        case "browser_close":
          global.windowManager.hideWindow('browser');
          result.success = true;
          result.message = "Agentic browser window hidden";
          break;

        case "display_code":
          result.success = true;
          result.code = params.code;
          result.language = params.language;
          result.message = "Code displayed";
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

    const method = verificationInfo.verification_method || "visual";
    let terminalContext = "";

    if (method === "terminal_output" && verificationInfo.verification_command) {
      try {
        const output = await new Promise(resolve => {
          exec(verificationInfo.verification_command, (err, stdout, stderr) => {
            resolve({ success: !err, out: stdout || stderr });
          });
        });
        terminalContext = `Terminal verification output: ${output.out}`;
      } catch (e) {
        terminalContext = `Terminal verification failed to run: ${e.message}`;
      }
    }

    const shot = await this.takeScreenshot();
    const prompt = `VERIFICATION TASK:
Action executed: ${action.action}
Description: ${action.description}
Expected outcome: ${verificationInfo.expected_outcome}
Execution result: ${executionResult.message}
Verification method: ${method}
${terminalContext ? terminalContext : ""}

Analyze the state and determine if the action was successful. Respond ONLY with JSON: {"verification_status": "success|failure", "observations": "..."}`;

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
        // Citations disabled per user request to minimize space and remove unclickable links
        return response.text();
    } catch (e) {
        console.error("[ACT JS] Error getting text from response:", e);
        return "";
    }
  }

  async ollamaGenerate(prompt, systemPrompt, settings, images = []) {
    const url = `${settings.ollamaUrl || 'http://localhost:11434'}/api/generate`;
    const body = {
      model: settings.ollamaModel || 'llama3',
      prompt: prompt,
      system: systemPrompt,
      stream: false,
      format: 'json'
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

  async openrouterGenerate(prompt, systemPrompt, settings, images = []) {
    const firebaseService = require('../firebase-service');
    const cachedKeys = firebaseService.getKeys();

    const apiKey = settings.openrouterApiKey || (cachedKeys && cachedKeys.openrouter);
    if (!apiKey) throw new Error("OpenRouter API key is missing. Please add one in settings or contact support.");

    const model = settings.openrouterModel === 'custom' ? settings.openrouterCustomModel : settings.openrouterModel;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: [
          { type: "text", text: prompt },
          ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/png;base64,${img}` } }))
        ]
      }
    ];

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
        messages: messages,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenRouter error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async processRequest(userRequest, attachments = [], onEvent, onError, apiKey, settings = {}) {
    this.stopRequested = false;

    const provider = settings.modelProvider || 'gemini';
    let effectiveProvider = provider;
    if (provider === 'openrouter' && (settings.openrouterModel === 'google/gemini-flash-1.5-sdk' || settings.openrouterModel === 'gemini-native')) {
        effectiveProvider = 'gemini';
    }
    this.currentProvider = effectiveProvider;

    const firebaseService = require('../firebase-service');
    const cachedKeys = firebaseService.getKeys();
    const defaultGeminiModel = cachedKeys ? cachedKeys.gemini_model : "gemini-1.5-flash";
    const geminiModel = settings.selectedModel || defaultGeminiModel;

    if (effectiveProvider === 'gemini') {
      this.setupGeminiAPI(apiKey, geminiModel);
    }
    const cachedUser = firebaseService.checkCachedUser();

    onEvent("task_start", { task: userRequest, show_effects: true });

    try {
      let loopCount = 0;
      const maxLoops = 15;
      let lastResultContext = "";
      let taskFinished = false;

      while (loopCount < maxLoops && !this.stopRequested) {
        loopCount++;
        await new Promise(r => setTimeout(r, 400));
        const shot = await this.takeScreenshot();
        if (!shot) throw new Error("Screenshot failed");

        const prefs = storageManager.readPreferences();
        const libs = storageManager.readLibraries();

        let browserStatus = "";
        try {
            const bwin = global.windowManager.getWindow('browser');
            if (bwin && bwin.isVisible()) {
                browserStatus = `\nAgentic Browser Status: URL=${bwin.webContents.getURL()}, Title=${bwin.webContents.getTitle()}`;
            }
        } catch(e) {}

        const prompt = `User Request: ${userRequest}
User Preferences: ${JSON.stringify(prefs)}
Installed Libraries: ${JSON.stringify(libs)}
Last Action Result: ${lastResultContext}${browserStatus}
OS: ${process.platform}, Screen: ${this.screenSize.width}x${this.screenSize.height}
${effectiveProvider !== 'gemini' ? 'NOTE: Native web search tool (googleSearch) is NOT available for this provider. Use browser_open, browser_execute_js, and standard spatial actions to perform web searches manually via a search engine.' : ''}

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

        let fullText = "";

        if (effectiveProvider === 'ollama') {
          const images = [fs.readFileSync(shot.filepath).toString("base64")];
          fullText = await this.ollamaGenerate(prompt, GENERAL_SYSTEM_PROMPT, settings, images);
        } else if (effectiveProvider === 'openrouter') {
          const images = [fs.readFileSync(shot.filepath).toString("base64")];
          // Handle additional attachments if any are images
          if (attachments && attachments.length > 0) {
              for (const att of attachments) {
                  if (att.path && fs.existsSync(att.path)) {
                      const ext = path.extname(att.path).toLowerCase();
                      if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
                          images.push(fs.readFileSync(att.path).toString("base64"));
                      }
                  }
              }
          }
          fullText = await this.openrouterGenerate(prompt, GENERAL_SYSTEM_PROMPT, settings, images);
        } else {
          const result = await this.model.generateContent(content);
          const response = await result.response;
          if (response.usageMetadata && cachedUser) firebaseService.updateTokenUsage(cachedUser.id, 'act', response.usageMetadata);
          fullText = this.formatCitations(response);
        }
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
            taskFinished = true;
            // For the final message, use the clean markdown if thought is empty
            const finalMessage = plan.after_message || (plan.thought ? "" : cleanMarkdown);
            if (finalMessage) onEvent("after_message", { text: finalMessage });
            break;
        }

        for (const action of actions) {
            if (this.stopRequested) break;

            const isHighRisk = ["terminal", "write_preferences", "write_libraries"].includes(action.action.toLowerCase());
            const proceedWithoutConfirmation = settings.proceedWithoutConfirmation || prefs.proceedWithoutConfirmation;

            if (!proceedWithoutConfirmation && isHighRisk) {
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
                confidence: action.parameters?.confidence,
                code: execResult.code,
                language: execResult.language
            });
            if (!verification.verified) break;
        }
      }
      if (!taskFinished) onEvent("task_complete", { task: userRequest, success: !this.stopRequested });
    } catch (err) {
      console.error("[ACT JS] Task error:", err);
      const errorStr = err.message.toLowerCase();
      let userMessage = err.message;

      const provider = settings.modelProvider || 'gemini';
      if (errorStr.includes("quota") || errorStr.includes("exceeded") || errorStr.includes("429")) {
        userMessage = "AI Quota exceeded. Rotating API key for next request. Please try again in a moment.";
        if (provider === 'openrouter') firebaseService.rotateOpenRouterKey();
        else firebaseService.rotateGeminiKey();
      } else if (errorStr.includes("google_search_retrieval")) {
        userMessage = "Search tool configuration error. Rotating key and updating tool settings. Please retry.";
        if (provider === 'openrouter') firebaseService.rotateOpenRouterKey();
        else firebaseService.rotateGeminiKey();
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
