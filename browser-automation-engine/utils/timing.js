const DEFAULT_WAIT_MULTIPLIER = 0.6;
const DEFAULT_MIN_WAIT_MS = 75;
const DEFAULT_LOOP_JITTER_MIN_MS = 0;
const DEFAULT_LOOP_JITTER_MAX_MS = 250;

const parseNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getTimingConfig = (env = process.env) => {
    const waitMultiplier = clamp(
        parseNumber(env.AUTOMATION_WAIT_MULTIPLIER, DEFAULT_WAIT_MULTIPLIER),
        0,
        3
    );
    const minWaitMs = Math.max(0, Math.round(parseNumber(env.AUTOMATION_MIN_WAIT_MS, DEFAULT_MIN_WAIT_MS)));
    const loopJitterMinMs = Math.max(0, Math.round(parseNumber(env.AUTOMATION_LOOP_JITTER_MIN_MS, DEFAULT_LOOP_JITTER_MIN_MS)));
    const loopJitterMaxMs = Math.max(
        loopJitterMinMs,
        Math.round(parseNumber(env.AUTOMATION_LOOP_JITTER_MAX_MS, DEFAULT_LOOP_JITTER_MAX_MS))
    );

    return {
        waitMultiplier,
        minWaitMs,
        loopJitterMinMs,
        loopJitterMaxMs
    };
};

const scaleDelay = (durationMs, env = process.env) => {
    const duration = Number(durationMs);
    if (!Number.isFinite(duration) || duration <= 0) return 0;

    const config = getTimingConfig(env);
    const scaled = Math.round(duration * config.waitMultiplier);

    return Math.max(config.minWaitMs, scaled);
};

const sleep = (durationMs, options = {}) => {
    const actualDuration = options.scale === false
        ? Math.max(0, Math.round(Number(durationMs) || 0))
        : scaleDelay(durationMs, options.env || process.env);

    if (actualDuration <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, actualDuration));
};

const getLoopJitterDelay = (env = process.env, random = Math.random) => {
    const { loopJitterMinMs, loopJitterMaxMs } = getTimingConfig(env);
    if (loopJitterMaxMs <= loopJitterMinMs) return loopJitterMinMs;

    return Math.round(loopJitterMinMs + (loopJitterMaxMs - loopJitterMinMs) * random());
};

module.exports = {
    getLoopJitterDelay,
    getTimingConfig,
    scaleDelay,
    sleep
};
