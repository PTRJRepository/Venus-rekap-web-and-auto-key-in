const assert = require('assert/strict');

const {
    getLoopJitterDelay,
    getTimingConfig,
    scaleDelay
} = require('./utils/timing');

{
    const config = getTimingConfig({});
    assert.equal(config.waitMultiplier, 0.6);
    assert.equal(config.minWaitMs, 75);
    assert.equal(config.loopJitterMinMs, 0);
    assert.equal(config.loopJitterMaxMs, 250);
}

{
    const env = { AUTOMATION_WAIT_MULTIPLIER: '0.5', AUTOMATION_MIN_WAIT_MS: '100' };
    assert.equal(scaleDelay(2000, env), 1000);
    assert.equal(scaleDelay(100, env), 100);
    assert.equal(scaleDelay(0, env), 0);
}

{
    const env = { AUTOMATION_LOOP_JITTER_MIN_MS: '0', AUTOMATION_LOOP_JITTER_MAX_MS: '0' };
    assert.equal(getLoopJitterDelay(env), 0);
}

{
    const env = { AUTOMATION_LOOP_JITTER_MIN_MS: '100', AUTOMATION_LOOP_JITTER_MAX_MS: '200' };
    assert.equal(getLoopJitterDelay(env, () => 0), 100);
    assert.equal(getLoopJitterDelay(env, () => 1), 200);
}
