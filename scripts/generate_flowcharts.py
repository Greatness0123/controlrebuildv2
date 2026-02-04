from PIL import Image, ImageDraw, ImageFont
import os

def create_flowchart(title, steps, filename):
    # Image size
    width = 800
    height = 100 + (len(steps) * 100)

    # Create white image
    img = Image.new('RGB', (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Try to load a font
    try:
        font = ImageFont.truetype("arial.ttf", 20)
        title_font = ImageFont.truetype("arial.ttf", 30)
    except:
        font = ImageFont.load_default()
        title_font = ImageFont.load_default()

    # Draw Title
    draw.text((width/2 - 50, 20), title, fill=(0, 0, 0), font=title_font)

    y = 80
    for i, step in enumerate(steps):
        # Draw Box
        box_w = 600
        box_h = 60
        x1 = (width - box_w) / 2
        y1 = y
        x2 = x1 + box_w
        y2 = y1 + box_h

        draw.rectangle([x1, y1, x2, y2], outline=(0, 0, 0), width=2)

        # Draw Text
        draw.text((x1 + 20, y1 + 20), f"{i+1}. {step}", fill=(0, 0, 0), font=font)

        # Draw Arrow
        if i < len(steps) - 1:
            draw.line([(width/2, y2), (width/2, y2 + 40)], fill=(0, 0, 0), width=2)
            # Arrow head
            draw.polygon([(width/2 - 10, y2 + 30), (width/2 + 10, y2 + 30), (width/2, y2 + 40)], fill=(0, 0, 0))

        y += 100

    # Save
    img.save(filename)
    print(f"Flowchart saved to {filename}")

# 1. Overall Flow
overall_steps = [
    "User Input (Text or Voice)",
    "Main Process receives request via IPC",
    "Backend Manager routes to Ask or Act Backend",
    "Backend calls Gemini API (with Key Rotation if needed)",
    "Gemini processes request and returns response/actions",
    "Backend executes actions (nut-js) and verifies (screenshots)",
    "Main Process sends results back to Renderer",
    "Renderer displays response and Edge-TTS speaks it"
]

# 2. Ask Flow
ask_steps = [
    "User asks a question",
    "Ask Backend initializes Gemini with Search Tool",
    "Gemini analyzes request (may request screenshot/command)",
    "Backend executes requested commands/screenshots",
    "Gemini provides final answer based on info",
    "Tokens tracked and reported to Firebase"
]

# 3. Act Flow
act_steps = [
    "User describes a task",
    "Act Backend captures initial screenshot",
    "Gemini generates step-by-step action plan",
    "Backend executes each action (Click, Type, etc.)",
    "After each action, Gemini verifies success via new screenshot",
    "Completion status and tokens updated in Firebase"
]

# 4. Wake Word Flow
wakeword_steps = [
    "Microphone listens via PvRecorder",
    "Porcupine engine processes audio frames",
    "Wake word 'Hey Control' detected",
    "Main process triggers Chat Window show & transcription",
    "User speaks command",
    "Vosk Server transcribes audio in real-time"
]

if __name__ == "__main__":
    if not os.path.exists('docs'):
        os.makedirs('docs')
    if not os.path.exists('docs/flowcharts'):
        os.makedirs('docs/flowcharts')

    create_flowchart("Application Overall Flow", overall_steps, "docs/flowcharts/overall_flow.png")
    create_flowchart("Ask Mode Flow", ask_steps, "docs/flowcharts/ask_flow.png")
    create_flowchart("Act Mode Flow", act_steps, "docs/flowcharts/act_flow.png")
    create_flowchart("Wake Word Detection Flow", wakeword_steps, "docs/flowcharts/wakeword_flow.png")
