const AutomationEngine = require('./engine');
const fs = require('fs');
const path = require('path');

// Worker for running a single automation engine instance
(async () => {
    try {
        const configPath = process.argv[2];
        if (!configPath) {
            throw new Error('No config file path provided');
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const { engineId, templateName, options, dataFile } = config;

        console.log(`[Worker ${engineId}] Starting...`);

        const engine = new AutomationEngine(options);

        // Load data if provided in config (Factory Pattern)
        let initialContext = {};
        if (dataFile) {
            const dataPath = path.isAbsolute(dataFile) ? dataFile : path.join(__dirname, dataFile);
            if (fs.existsSync(dataPath)) {
                // Read data file
                initialContext.data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                console.log(`[Worker ${engineId}] Loaded injected data from ${dataFile}`);
            } else {
                console.warn(`[Worker ${engineId}] Warning: Data file not found at ${dataPath}`);
            }
        }

        await engine.runTemplate(templateName, initialContext);

        console.log(`[Worker ${engineId}] Completed successfully.`);
        process.exit(0);

    } catch (error) {
        console.error(`[Worker Error] ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
})();
