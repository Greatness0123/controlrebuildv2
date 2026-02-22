const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class AppUtils {
    async getInstalledApps() {
        if (process.platform === 'win32') {
            return this.getWindowsApps();
        } else if (process.platform === 'darwin') {
            return this.getMacApps();
        } else {
            return []; // Linux support could be added via /usr/share/applications
        }
    }

    getWindowsApps() {
        return new Promise((resolve) => {
            const command = 'powershell "Get-StartApps | ConvertTo-Json"';
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error fetching Windows apps:', error);
                    return resolve([]);
                }
                try {
                    const apps = JSON.parse(stdout);
                    // Standardize output: { name, path/id }
                    const result = apps.map(app => ({
                        name: app.Name,
                        id: app.AppID
                    }));
                    resolve(result);
                } catch (e) {
                    console.error('Error parsing Windows apps JSON:', e);
                    resolve([]);
                }
            });
        });
    }

    getMacApps() {
        return new Promise((resolve) => {
            const dirs = ['/Applications', '/System/Applications', path.join(process.env.HOME, 'Applications')];
            let results = [];

            dirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    files.forEach(file => {
                        if (file.endsWith('.app')) {
                            results.push({
                                name: file.replace('.app', ''),
                                path: path.join(dir, file)
                            });
                        }
                    });
                }
            });
            resolve(results);
        });
    }
}

module.exports = new AppUtils();
