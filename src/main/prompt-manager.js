const fs = require('fs');
const path = require('path');

class PromptManager {
    constructor() {
        this.promptsDir = path.join(__dirname, 'prompts');
        this.prompts = {};
    }

    getPrompt(name) {
        if (this.prompts[name]) {
            return this.prompts[name];
        }

        const filePath = path.join(this.promptsDir, `${name}.md`);
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                this.prompts[name] = content;
                return content;
            } else {
                console.error(`Prompt file not found: ${filePath}`);
                return '';
            }
        } catch (err) {
            console.error(`Error reading prompt file ${filePath}:`, err);
            return '';
        }
    }

    reloadPrompts() {
        this.prompts = {};
    }
}

module.exports = new PromptManager();
