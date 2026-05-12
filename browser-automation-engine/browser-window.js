const DEFAULT_WINDOW_WIDTH = 1920;
const DEFAULT_WINDOW_HEIGHT = 1080;

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseWindowSize = () => {
    const size = String(process.env.BROWSER_WINDOW_SIZE || '').trim();
    const match = size.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (match) {
        return {
            width: parsePositiveInt(match[1], DEFAULT_WINDOW_WIDTH),
            height: parsePositiveInt(match[2], DEFAULT_WINDOW_HEIGHT)
        };
    }

    return {
        width: parsePositiveInt(process.env.BROWSER_WINDOW_WIDTH, DEFAULT_WINDOW_WIDTH),
        height: parsePositiveInt(process.env.BROWSER_WINDOW_HEIGHT, DEFAULT_WINDOW_HEIGHT)
    };
};

const getBrowserWindowMode = () => {
    const mode = String(process.env.BROWSER_WINDOW_MODE || 'maximized').trim().toLowerCase();
    return ['maximized', 'windowed', 'fullscreen'].includes(mode) ? mode : 'maximized';
};

const getChromeWindowArgs = () => {
    const { width, height } = parseWindowSize();
    const mode = getBrowserWindowMode();
    const args = [
        `--window-size=${width},${height}`,
        '--window-position=0,0',
        '--force-device-scale-factor=1',
        '--high-dpi-support=1'
    ];

    if (mode === 'fullscreen') args.unshift('--start-fullscreen');
    else if (mode === 'maximized') args.unshift('--start-maximized');

    return args;
};

const getDefaultViewport = (headless = false) => {
    if (!headless) return null;
    const { width, height } = parseWindowSize();
    return { width, height, deviceScaleFactor: 1 };
};

const applyBrowserWindow = async (page, options = {}) => {
    if (!page) return;

    const headless = options.headless === true;
    const mode = getBrowserWindowMode();
    const { width, height } = parseWindowSize();

    if (headless) {
        await page.setViewport({ width, height, deviceScaleFactor: 1 }).catch(() => {});
        return;
    }

    let client = null;
    try {
        client = await page.target().createCDPSession();
        const { windowId } = await client.send('Browser.getWindowForTarget');

        if (mode === 'fullscreen') {
            await client.send('Browser.setWindowBounds', {
                windowId,
                bounds: { windowState: 'fullscreen' }
            });
            return;
        }

        await client.send('Browser.setWindowBounds', {
            windowId,
            bounds: {
                windowState: 'normal',
                left: 0,
                top: 0,
                width,
                height
            }
        });

        if (mode === 'maximized') {
            await client.send('Browser.setWindowBounds', {
                windowId,
                bounds: { windowState: 'maximized' }
            });
        }
    } catch (_) {
        // Window sizing is best effort; Chrome may reject it in some environments.
    } finally {
        if (client) await client.detach().catch(() => {});
    }
};

module.exports = {
    applyBrowserWindow,
    getBrowserWindowMode,
    getChromeWindowArgs,
    getDefaultViewport,
    parseWindowSize
};
