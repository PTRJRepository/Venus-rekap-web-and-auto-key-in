const assert = require('assert/strict');

const {
    buildMultiTabRunPlan,
    isSamePageUrl,
    openTabPages,
    splitTemplateForMultiTab,
    shouldBringTabToFrontOnTrigger,
    shouldSkipRedundantTabNavigation,
    useIsolatedTabSessions
} = require('./multi-tab-runner');

function employee(ptrjId) {
    return {
        EmployeeID: `VENUS-${ptrjId}`,
        EmployeeName: `Employee ${ptrjId}`,
        PTRJEmployeeID: ptrjId,
        Attendance: {
            '2026-02-24': {
                date: '2026-02-24',
                status: 'Hadir',
                regularHours: 7,
                overtimeHours: 0
            }
        }
    };
}

{
    const data = {
        metadata: { period_start: '2026-02-01', period_end: '2026-02-28' },
        data: [employee('P001'), employee('P002'), employee('P003')]
    };

    const plan = buildMultiTabRunPlan({
        data,
        requestedTabs: 5,
        maxTabs: 8,
        rowLimit: 1
    });

    assert.equal(plan.actualTabs, 1);
    assert.equal(plan.employees.length, 1);
    assert.deepEqual(plan.assignedTabs.map((tab) => tab.map((item) => item.PTRJEmployeeID)), [['P001']]);
    assert.deepEqual(plan.splitKeys, []);
}

{
    const template = {
        name: 'Test Template',
        steps: [
            { action: 'navigate', params: { url: 'http://example.test/login' } },
            {
                action: 'forEach',
                params: {
                    items: 'data.data',
                    itemName: 'employee',
                    steps: [{ action: 'log', params: { message: '${employee.EmployeeName}' } }]
                }
            },
            { action: 'log', params: { message: 'done' } }
        ]
    };

    const split = splitTemplateForMultiTab(template);

    assert.equal(split.setupSteps.length, 1);
    assert.equal(split.loopStep.params.itemName, 'employee');
    assert.equal(split.loopSteps.length, 1);
    assert.equal(split.cleanupSteps.length, 1);
    assert.equal(split.lastSetupNavigateUrl, 'http://example.test/login');
}

{
    assert.throws(
        () => splitTemplateForMultiTab({ name: 'Invalid', steps: [{ action: 'log', params: {} }] }),
        /forEach.*data\.data/
    );
}

{
    const previous = process.env.MULTI_TAB_ISOLATED_SESSIONS;

    delete process.env.MULTI_TAB_ISOLATED_SESSIONS;
    assert.equal(useIsolatedTabSessions(), false);

    process.env.MULTI_TAB_ISOLATED_SESSIONS = 'true';
    assert.equal(useIsolatedTabSessions(), true);

    if (previous === undefined) {
        delete process.env.MULTI_TAB_ISOLATED_SESSIONS;
    } else {
        process.env.MULTI_TAB_ISOLATED_SESSIONS = previous;
    }
}

{
    const previous = process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION;

    delete process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION;
    assert.equal(shouldSkipRedundantTabNavigation(), true);

    process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION = 'false';
    assert.equal(shouldSkipRedundantTabNavigation(), false);

    if (previous === undefined) {
        delete process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION;
    } else {
        process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION = previous;
    }
}

{
    assert.equal(
        isSamePageUrl(
            'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterDet.aspx?x=1',
            'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterDet.aspx'
        ),
        true
    );
    assert.equal(isSamePageUrl('http://example.test/a', 'http://example.test/b'), false);
}

{
    const previous = process.env.MULTI_TAB_BRING_TO_FRONT_ON_TRIGGER;

    delete process.env.MULTI_TAB_BRING_TO_FRONT_ON_TRIGGER;
    assert.equal(shouldBringTabToFrontOnTrigger(), false);

    process.env.MULTI_TAB_BRING_TO_FRONT_ON_TRIGGER = 'true';
    assert.equal(shouldBringTabToFrontOnTrigger(), true);

    if (previous === undefined) {
        delete process.env.MULTI_TAB_BRING_TO_FRONT_ON_TRIGGER;
    } else {
        process.env.MULTI_TAB_BRING_TO_FRONT_ON_TRIGGER = previous;
    }
}

async function testOpenTabPagesCreatesAndNavigatesAllTabs() {
    const navigated = [];
    let created = 0;
    const makePage = (name) => ({
        name,
        closed: false,
        isClosed() { return this.closed; },
        async goto(url) {
            navigated.push({ name, url });
        }
    });

    const session = {
        page: null,
        async newPage() {
            created += 1;
            return makePage(`created-${created}`);
        }
    };

    const pages = await openTabPages(session, 3, 'http://example.test/detail');

    assert.equal(pages.length, 3);
    assert.equal(created, 3);
    assert.equal(session.page, pages[0]);
    assert.deepEqual(navigated.map((item) => item.url), [
        'http://example.test/detail',
        'http://example.test/detail',
        'http://example.test/detail'
    ]);
}

async function testOpenTabPagesSkipsRedundantFirstNavigation() {
    const previous = process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION;
    delete process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION;

    const navigated = [];
    let created = 0;
    const targetUrl = 'http://example.test/detail';
    const makePage = (name, url = 'about:blank') => ({
        name,
        closed: false,
        isClosed() { return this.closed; },
        url() { return url; },
        async goto(nextUrl) {
            navigated.push({ name, url: nextUrl });
        }
    });

    const firstPage = makePage('existing', targetUrl);
    const session = {
        page: firstPage,
        async newPage() {
            created += 1;
            return makePage(`created-${created}`);
        }
    };

    const pages = await openTabPages(session, 2, targetUrl);

    assert.equal(pages[0], firstPage);
    assert.equal(created, 1);
    assert.deepEqual(navigated.map((item) => item.name), ['created-1']);

    if (previous === undefined) {
        delete process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION;
    } else {
        process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION = previous;
    }
}

testOpenTabPagesCreatesAndNavigatesAllTabs().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

testOpenTabPagesSkipsRedundantFirstNavigation().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
