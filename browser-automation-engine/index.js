const AutomationEngine = require('./engine');

// Ambil nama template dari argumen command line
// Contoh penggunaan: node index.js template-flow
const templateName = process.argv[2];

if (!templateName) {
    console.error('⚠️  Harap tentukan nama template.');
    console.log('   Cara pakai: node index.js <nama-template>');
    console.log('   Contoh: node index.js template-flow');
    process.exit(1);
}

// Opsi engine (bisa dikonfigurasi via environment variables)
const options = {
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO || '0'),
    screenshot: process.env.SCREENSHOT !== 'false'
};

(async () => {
    const engine = new AutomationEngine(options);
    try {
        await engine.runTemplate(templateName);

        // Tunggu 5 detik sebelum menutup browser agar user bisa melihat hasilnya
        console.log('\n⏰ Browser akan tetap terbuka. Tekan Ctrl+C untuk menutup.');

        // Keep the process alive
        await new Promise(() => { });

    } catch (err) {
        console.error('\n💥 Error detail:', err);
        process.exit(1);
    }
})();
