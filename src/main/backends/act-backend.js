const { GoogleGenerativeAI } = require("@google/generative-ai");
const screenshot = require("screenshot-desktop");
const { mouse, keyboard, Button, Point, Key } = require("@computer-use/nut-js");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Jimp = require("jimp");
const clipboardy = require("clipboardy");

const SYSTEM_PROMPT = `You are Control (Act Mode), A HIGH-PERFORMANCE INTELLIGENT AGENT AI assistant designed for GUI automation and task execution.

**YOUR ROLE:**
- You are an AGENTIC AI that EXECUTES TASKS on the user's computer.
- You can make plans, make decisions, and adapt strategies to complete tasks to user satisfaction.
- You DO NOT answer general questions (e.g., "What is the capital of France?").
- If the request is a task (e.g., "Open Calculator", "Check emails"), EXECUTE IT immediately.
- If the request is a question, REJECT IT and ask the user to switch to "Ask" mode.

**FULL UNDERSTANDING:** READ the user request CAREFULLY. Understand the GOAL before acting.


**OS-AWARE NAVIGATION:**
- You will receive the Operating System (Windows, macOS, Linux) in the screen context.
- UI elements, shortcuts, and navigation patterns VARY per OS. Use the provided OS to:
  - Choose correct keyboard shortcuts (e.g., Ctrl on Windows/Linux, Cmd on macOS)
  - Navigate OS-specific menus, dialogs, and system settings
  - Use appropriate terminal commands (PowerShell/CMD on Windows, bash on macOS/Linux)

**COORDINATE CALCULATION & VISUAL MAPPING:**
- You will receive the SCREEN SIZE (width x height) as reference.
- **VISUALIZATION RULE:** Treat the received screenshot NOT as a mere image, but as the PHYSICAL SCREEN of the user's device.
- **MAPPING STRATEGY:**
  1. Mentally map the edges of the image to the forwarded screen resolution (0,0 to Width,Height).
  2. To find an element, draw IMAGINARY PERPENDICULAR LINES from the X-axis (top) and Y-axis (left) to the target element.
  3. PINPOINT the exact pixel intersection of these imaginary lines.
- **PRECISION CONSENSUS:**
  1. Calculate the coordinates TWICE independently using this visual mapping.
  2. If both results match, proceed.
  3. If they differ, calculate a THIRD time and use the consensus.
  4. Coordinates must be ABSOLUTE (relative to the global screen 0,0).

**GENERAL RULES - WORK LIKE A HUMAN:**
1. Click on input fields BEFORE typing into them
2. Ensure the target application is IN FOCUS before interacting with it
3. Use Alt+Tab or terminal commands to switch focus if needed
4. Always REVISE your plan before execution to maintain context
5. Use keyboard shortcuts for efficiency:
   - Windows: Win (start menu), Alt+F4 (close), Ctrl+C/V (copy/paste), Alt+Tab (switch)
   - macOS: Cmd+Space (spotlight), Cmd+Q (quit), Cmd+C/V, Cmd+Tab
   - Linux: Super (activities), Alt+F4, Ctrl+C/V, Alt+Tab
6. Research how to perform tasks in specific applications if unsure

**TWO MODES OF OPERATION:**

**HYBRID OPERATIONS (CRITICAL):**
- You have two powerful hands: GUI (Mouse/Keyboard) and TERMINAL. USE BOTH.
- **Terminal is NOT just for checking.** It is a full-fledged OPERATIONAL MODE.
- In a Hybrid workflow, use the Terminal to PERFORM TASKS whenever it is more reliable or faster than the GUI, regardless of whether you are "checking" or "doing".
- Example Hybrid Flows:
    - *Task: Open Spotify and play music.*
      1. TERMINAL: \`start spotify\` (Perform Task - Faster than finding icon)
      2. TERMINAL: \`tasklist\` to confirm it launched (Check State)
      3. GUI: Click "Play" button (Perform Task - GUI required for internal app control)
- Do not artificially limit the Terminal. If a task (like deleting a file, killing a process, or launching an app) can be done via Terminal, DO IT via Terminal.

1. **GUI MODE (Mouse & Keyboard):**
   - Use for interacting with visual elements (buttons, sliders, canvas).
   - Precision is CRITICAL - use the Visual Mapping Consensus strategy.
   - Ideal for: Web browsing, painting, creative apps, complex UI interactions.

2. **TERMINAL MODE (System Operations):**
   - **CAPABILITIES:** File system (move/copy/delete), Process management (start/kill), System config, Network, git operations, scripting.
   - **ROLE:** It is the "Power User" interface. Use it to bypass clumsy GUI navigation for system tasks.
   - **CHECKING:** Yes, use it to verify state (is app running? is file there?).
   - **DOING:** Yes, use it to CHANGE state (run app, delete file, change setting).
   - Examples:
     - Open app: \`start notepad\` (Windows)
     - Kill app: \`taskkill /IM notepad.exe /F\`

**RESPONSE FORMAT:**
Always respond with a JSON object in this format:
{
  "type": "task",
  "analysis": "Current UI state and strategy (1 sentence)",
  "plan": "Step-by-step action plan",
  "actions": [
    {
      "step": 1,
      "description": "Action description",
      "action": "screenshot|click|type|key_press|double_click|mouse_move|drag|scroll|terminal|wait|focus_window|execute_automation",
      "parameters": {},
      "verification": {
        "expected_outcome": "Specific change that should occur",
        "verification_method": "visual|terminal_output|window_check",
        "success_indicators": ["visual marker 1"]
      }
    }
  ]
}

**ACTION REFERENCE:**
- screenshot: Capture current screen
- click: Single click at coordinates {"coordinates": [x, y]}
- double_click: Double click at coordinates {"coordinates": [x, y]}
- type: Input text {"text": "content", "clear_first": true/false}
- key_press: Keyboard shortcut {"keys": ["control", "c"], "combo": true}
- mouse_move: Move cursor {"coordinates": [x, y]}
- drag: Drag from start to end {"coordinates": [x1, y1], "end_coordinates": [x2, y2]}
- scroll: Scroll at position {"coordinates": [x, y], "direction": "up|down", "amount": 3}
- terminal: Execute OS command {"command": "your_command_here"}
- wait: Pause execution {"duration": seconds}
- focus_window: Bring app to focus {"app_name": "AppName", "method": "alt_tab|search|terminal"}
- execute_automation: Run nut-js automation command

**HUMAN-IN-THE-LOOP:**
- For high-risk actions (file deletion, system changes, network operations), request user confirmation
- Use sparingly, only for truly dangerous operations
`;

class ActBackend {
  constructor(options = {}) {
    this.screenshotDir = path.join(os.tmpdir(), "control_screenshots");
    if (!fs.existsSync(this.screenshotDir)) fs.mkdirSync(this.screenshotDir);

    this.maxActionRetries = 3;
    this.verificationWait = 500;
    this.model = null;
    this.setupGeminiAPI();

    this.stopRequested = false;
    this.screenSize = { width: 1920, height: 1080 };
  }

  setupGeminiAPI() {
    const apiKey = process.env.GEMINI_FREE_KEY || "test_api_key";
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: SYSTEM_PROMPT,
    });
  }

  async takeScreenshot(markCursor = true) {
    try {
      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.png`;
      const filepath = path.join(this.screenshotDir, filename);

      const imgBuffer = await screenshot({ format: "png" });
      const image = await Jimp.read(imgBuffer);

      this.screenSize = { width: image.bitmap.width, height: image.bitmap.height };

      let cursorX = 0, cursorY = 0;
      try {
        const pos = await mouse.getPosition();
        cursorX = pos.x;
        cursorY = pos.y;
      } catch (e) {}

      if (markCursor && cursorX > 0 && cursorY > 0) {
        // Draw crosshair/circle
        const color = 0xFF0000FF; // Red
        const radius = 15;

        for (let i = -radius; i <= radius; i++) {
          if (cursorX + i >= 0 && cursorX + i < image.bitmap.width) {
            image.setPixelColor(color, cursorX + i, cursorY);
          }
          if (cursorY + i >= 0 && cursorY + i < image.bitmap.height) {
            image.setPixelColor(color, cursorX, cursorY + i);
          }
        }

        await image.writeAsync(filepath);
      } else {
        await image.writeAsync(filepath);
      }

      return {
        filepath,
        metadata: {
          screen_width: this.screenSize.width,
          screen_height: this.screenSize.height,
          cursor_x: cursorX,
          cursor_y: cursorY,
          timestamp
        }
      };
    } catch (err) {
      console.error("[ACT JS] Screenshot error:", err);
      return null;
    }
  }

  async executeAction(action) {
    const actionType = action.action.toLowerCase();
    const params = action.parameters || {};
    const result = { success: false, message: "", action: actionType };

    try {
      switch (actionType) {
        case "screenshot":
          const shot = await this.takeScreenshot();
          result.success = !!shot;
          result.screenshot = shot.filepath;
          break;

        case "click":
          if (params.coordinates) {
            await mouse.setPosition(new Point(params.coordinates[0], params.coordinates[1]));
            await mouse.leftClick();
            result.success = true;
            result.message = `Clicked (${params.coordinates[0]}, ${params.coordinates[1]})`;
          }
          break;

        case "double_click":
          if (params.coordinates) {
            await mouse.setPosition(new Point(params.coordinates[0], params.coordinates[1]));
            await mouse.doubleClick(Button.LEFT);
            result.success = true;
            result.message = `Double-clicked (${params.coordinates[0]}, ${params.coordinates[1]})`;
          }
          break;

        case "type":
          if (params.text) {
            if (params.clear_first) {
              const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
              await keyboard.pressKey(modifier, Key.A);
              await keyboard.releaseKey(modifier, Key.A);
              await keyboard.pressKey(Key.Backspace);
              await keyboard.releaseKey(Key.Backspace);
            }
            await keyboard.type(params.text);
            result.success = true;
            result.message = `Typed: ${params.text.substring(0, 30)}`;
          }
          break;

        case "key_press":
          if (params.keys) {
            const keyMap = {
              "control": Key.LeftControl,
              "shift": Key.LeftShift,
              "alt": Key.LeftAlt,
              "win": Key.LeftWin,
              "command": Key.LeftCmd,
              "enter": Key.Enter,
              "tab": Key.Tab,
              "escape": Key.Escape,
              "backspace": Key.Backspace,
              "delete": Key.Delete
            };
            const keys = params.keys.map(k => keyMap[k.toLowerCase()] || k);
            if (params.combo) {
              await keyboard.pressKey(...keys);
              await keyboard.releaseKey(...keys);
            } else {
              for (const k of keys) {
                await keyboard.type(k);
              }
            }
            result.success = true;
            result.message = `Keys pressed: ${params.keys.join("+")}`;
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

        case "wait":
          await new Promise(r => setTimeout(r, (params.duration || 1) * 1000));
          result.success = true;
          break;

        case "mouse_move":
          if (params.coordinates) {
            await mouse.setPosition(new Point(params.coordinates[0], params.coordinates[1]));
            result.success = true;
          }
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
Parameters: ${JSON.stringify(action.parameters)}
Expected outcome: ${verificationInfo.expected_outcome}
Execution result: ${executionResult.message}

Analyze the screenshot and determine if the action was successful.
Respond ONLY with JSON:
{
  "verification_status": "success|failure|partial",
  "outcome_achieved": true,
  "observations": "description",
  "retry_suggestion": "if failed"
}`;

    const content = [
        prompt,
        {
            inlineData: {
                mimeType: "image/png",
                data: fs.readFileSync(shot.filepath).toString("base64")
            }
        }
    ];

    try {
        const result = await this.model.generateContent(content);
        const response = await result.response;
        const text = response.text();
        const jsonMatch = /\{.*\}/s.exec(text);
        const data = JSON.parse(jsonMatch[0]);
        return {
            verified: data.verification_status === "success",
            message: data.observations,
            retry_suggestion: data.retry_suggestion
        };
    } catch (err) {
        return { verified: false, message: "Verification error: " + err.message };
    }
  }

  async processRequest(userRequest, attachments = [], onEvent, onError) {
    this.stopRequested = false;
    onEvent("task_start", { task: userRequest, show_effects: true });

    try {
      const shot = await this.takeScreenshot();
      const prompt = `User Request: ${userRequest}\nAnalyze the screen and provide a step-by-step PLAN to execute this task. Respond with JSON TASK structure.
Screen Context: ${this.screenSize.width}x${this.screenSize.height}, OS: ${process.platform}`;

      const content = [
          prompt,
          {
              inlineData: {
                  mimeType: "image/png",
                  data: fs.readFileSync(shot.filepath).toString("base64")
              }
          }
      ];

      const result = await this.model.generateContent(content);
      const response = await result.response;
      const text = response.text();
      const jsonMatch = /\{.*\}/s.exec(text);
      if (!jsonMatch) throw new Error("No JSON in AI response");

      const plan = JSON.parse(jsonMatch[0]);
      if (plan.type !== 'task') {
          onEvent("ai_response", { text: plan.response || "I cannot perform that task in Act mode.", is_action: false });
          return;
      }

      const actions = plan.actions || [];
      onEvent("action_start", { description: `Executing ${actions.length} steps` });

      for (let i = 0; i < actions.length; i++) {
        if (this.stopRequested) break;
        const action = actions[i];
        onEvent("action_step", { step: i + 1, total_steps: actions.length, description: action.description, action_type: action.action });

        let success = false;
        let attempt = 0;
        while (attempt < this.maxActionRetries && !success) {
            attempt++;
            const execResult = await this.executeAction(action);
            if (execResult.success) {
                const verification = await this.verifyAction(action, execResult);
                if (verification.verified) {
                    success = true;
                } else {
                    console.log(`[ACT JS] Verification failed: ${verification.message}`);
                }
            }
        }

        if (!success) {
            onEvent("action_complete", { description: action.description, success: false, details: "Action failed after retries" });
            break;
        } else {
            onEvent("action_complete", { description: action.description, success: true });
        }
      }

      onEvent("task_complete", { task: userRequest, success: !this.stopRequested });
      onEvent("ai_response", { text: "Task completed.", is_action: true });

    } catch (err) {
      console.error("[ACT JS] Task error:", err);
      onError({ message: err.message });
    }
  }

  stopTask() {
    this.stopRequested = true;
  }
}

module.exports = ActBackend;
