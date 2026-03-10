/**
 * API Testing Suite for Venus Attendance Recap
 * Run with: node _dev_utils/tests/test_api_endpoints.js
 *
 * Tests all backend API endpoints to verify they work correctly
 */

const http = require('http');

const API_BASE = 'http://127.0.0.1:5000';

// Helper to make HTTP requests
function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Test functions
async function testApiEndpoints() {
    console.log('='.repeat(60));
    console.log('VENUS ATTENDANCE RECAP - API TEST SUITE');
    console.log('='.repeat(60));
    console.log();

    const results = [];
    let passed = 0;
    let failed = 0;

    // Test 1: Get available months
    console.log('[TEST 1] GET /api/months');
    try {
        const res = await request('GET', '/api/months');
        if (res.status === 200 && res.data.success) {
            console.log('  PASS: Months endpoint working');
            console.log('  Data:', res.data.data?.slice(0, 3));
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 2: Get attendance data
    console.log('[TEST 2] GET /api/attendance?month=2&year=2026');
    try {
        const res = await request('GET', '/api/attendance?month=2&year=2026');
        if (res.status === 200 && res.data.success) {
            console.log('  PASS: Attendance endpoint working');
            console.log('  Employees:', res.data.data?.length);
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 3: Get monthly grid
    console.log('[TEST 3] GET /api/monthly-grid?month=2&year=2026');
    try {
        const res = await request('GET', '/api/monthly-grid?month=2&year=2026');
        if (res.status === 200 && res.data.success) {
            console.log('  PASS: Monthly grid endpoint working');
            console.log('  Employees:', res.data.data?.length);
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 4: Get employees
    console.log('[TEST 4] GET /api/employees');
    try {
        const res = await request('GET', '/api/employees');
        if (res.status === 200 && res.data.success) {
            console.log('  PASS: Employees endpoint working');
            console.log('  Employees:', res.data.data?.length);
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 5: Get employee-mill mapping
    console.log('[TEST 5] GET /api/employee-mill');
    try {
        const res = await request('GET', '/api/employee-mill');
        if (res.status === 200 && res.data.success) {
            console.log('  PASS: Employee-mill endpoint working');
            console.log('  Mappings:', res.data.data?.length);
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 6: Get export options employees
    console.log('[TEST 6] GET /api/export-options/employees?start_date=2026-02-01&end_date=2026-02-28');
    try {
        const res = await request('GET', '/api/export-options/employees?start_date=2026-02-01&end_date=2026-02-28');
        if (res.status === 200 && res.data.success) {
            console.log('  PASS: Export options employees endpoint working');
            console.log('  Employees:', res.data.data?.length);
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 7: Export data
    console.log('[TEST 7] POST /api/export');
    try {
        const res = await request('POST', '/api/export', {
            start_date: '2026-02-01',
            end_date: '2026-02-28',
            employee_ids: []
        });
        if (res.status === 200 && res.data.success) {
            console.log('  PASS: Export endpoint working');
            console.log('  Result:', res.data.data?.filename || 'OK');
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 8: Comparison - Compare endpoint
    console.log('[TEST 8] POST /api/comparison/compare');
    try {
        const res = await request('POST', '/api/comparison/compare', {
            employees: [],
            startDate: '2026-02-01',
            endDate: '2026-02-28'
        });
        if (res.status === 200 && res.data.success !== undefined) {
            console.log('  PASS: Comparison endpoint working');
            console.log('  Success:', res.data.success);
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 9: Get staging data
    console.log('[TEST 9] GET /api/staging/data');
    try {
        const res = await request('GET', '/api/staging/data?limit=10');
        if (res.status === 200 && res.data.success !== undefined) {
            console.log('  PASS: Staging data endpoint working');
            console.log('  Records:', res.data.data?.length);
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 10: Payroll endpoint
    console.log('[TEST 10] GET /api/payroll?month=2&year=2026');
    try {
        const res = await request('GET', '/api/payroll?month=2&year=2026');
        if (res.status === 200 && res.data.success !== undefined) {
            console.log('  PASS: Payroll endpoint working');
            console.log('  Success:', res.data.success);
            passed++;
        } else {
            console.log('  FAIL: Expected 200, got', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log();

    if (failed === 0) {
        console.log('ALL TESTS PASSED!');
    } else {
        console.log('SOME TESTS FAILED - Please check the backend server');
    }
}

// Run tests
testApiEndpoints().catch(console.error);
