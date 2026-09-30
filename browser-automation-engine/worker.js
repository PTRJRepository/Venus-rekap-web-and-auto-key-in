// EPIPE + unhandledRejection/uncaughtException guards — worker ini di-fork oleh
// parallel-runner; kalau runner induk mati, pipe putus dan tanpa guard ini
// worker ikut mati sebelum menyelesaikan employee yang sedang diproses.
require('./_process_guards');

const AutomationEngine = require('./engine');
const fs = require('fs');

// Worker for running a single automation engine instance
(async () => {
    let engine = null;
    let exitCode = 0;
    try {
        const configPath = process.argv[2];
        if (!configPath) {
            throw new Error('No config file path provided');
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const { engineId, templateName, options } = config;

        console.log(`[Worker ${engineId}] Starting...`);
        
        engine = new AutomationEngine(options);
        
        // Pass a resume flag context if needed? 
        // Currently AutomationEngine handles resume via RecoveryManager reading from disk.
        // But we might need to tell it we are in "Resume Mode"?
        // For now, let's assume it always tries to be smart if state exists.
        
        await engine.runTemplate(templateName);

        console.log(`[Worker ${engineId}] Completed successfully.`);

    } catch (error) {
        console.error(`[Worker Error] ${error.message}`);
        console.error(error.stack);
        exitCode = 1;
    } finally {
        if (engine) {
            await engine.closeBrowser().catch((error) => {
                console.error(`[Worker Cleanup Error] ${error.message}`);
            });
        }
        process.exit(exitCode);
    }
})();
