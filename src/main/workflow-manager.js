const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class WorkflowManager {
    constructor() {
        this.initialized = false;
    }

    _init() {
        if (this.initialized) return;
        const { app } = require('electron');
        this.userDataDir = app.getPath('userData');
        this.workflowsFile = path.join(this.userDataDir, 'keywords.json');

        this._initFiles();
        this.initialized = true;
    }

    _initFiles() {
        if (!fs.existsSync(this.workflowsFile)) {
            const defaultData = {
                workflows: []
            };
            fs.writeJsonSync(this.workflowsFile, defaultData, { spaces: 2 });
        }
    }

    getAllWorkflows() {
        this._init();
        try {
            const data = fs.readJsonSync(this.workflowsFile);
            return data.workflows || [];
        } catch (err) {
            console.error('Error reading workflows:', err);
            return [];
        }
    }

    getWorkflowById(id) {
        const workflows = this.getAllWorkflows();
        return workflows.find(w => w.id === id);
    }

    saveWorkflow(workflow) {
        this._init();
        try {
            const data = fs.readJsonSync(this.workflowsFile);
            if (!workflow.id) {
                workflow.id = uuidv4();
                data.workflows.push(workflow);
            } else {
                const index = data.workflows.findIndex(w => w.id === workflow.id);
                if (index !== -1) {
                    data.workflows[index] = workflow;
                } else {
                    data.workflows.push(workflow);
                }
            }
            fs.writeJsonSync(this.workflowsFile, data, { spaces: 2 });
            return { success: true, workflow };
        } catch (err) {
            console.error('Error saving workflow:', err);
            return { success: false, error: err.message };
        }
    }

    deleteWorkflow(id) {
        this._init();
        try {
            const data = fs.readJsonSync(this.workflowsFile);
            data.workflows = data.workflows.filter(w => w.id !== id);
            fs.writeJsonSync(this.workflowsFile, data, { spaces: 2 });
            return { success: true };
        } catch (err) {
            console.error('Error deleting workflow:', err);
            return { success: false, error: err.message };
        }
    }

    toggleWorkflow(id, enabled) {
        const workflow = this.getWorkflowById(id);
        if (workflow) {
            workflow.enabled = enabled;
            return this.saveWorkflow(workflow);
        }
        return { success: false, error: 'Workflow not found' };
    }

    importWorkflows(importedWorkflows) {
        this._init();
        try {
            const data = fs.readJsonSync(this.workflowsFile);

            // Ensure importedWorkflows is an array
            const toImport = Array.isArray(importedWorkflows) ? importedWorkflows : [importedWorkflows];

            let count = 0;
            toImport.forEach(wf => {
                // Generate new IDs to avoid collisions, but keep name and structure
                const newWf = { ...wf, id: uuidv4() };
                data.workflows.push(newWf);
                count++;
            });

            fs.writeJsonSync(this.workflowsFile, data, { spaces: 2 });
            return { success: true, count };
        } catch (err) {
            console.error('Error importing workflows:', err);
            return { success: false, error: err.message };
        }
    }

    deleteAllWorkflows() {
        this._init();
        try {
            const data = { workflows: [] };
            fs.writeJsonSync(this.workflowsFile, data, { spaces: 2 });
            return { success: true };
        } catch (err) {
            console.error('Error deleting all workflows:', err);
            return { success: false, error: err.message };
        }
    }
}

module.exports = new WorkflowManager();
