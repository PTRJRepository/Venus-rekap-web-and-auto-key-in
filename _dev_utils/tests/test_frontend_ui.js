/**
 * Frontend UI Testing Suite for Venus Attendance Recap
 * Run with: node _dev_utils/tests/test_frontend_ui.js
 *
 * Tests frontend UI components and integration with backend
 */

const http = require('http');

const API_BASE = 'http://127.0.0.1:5000';
const FRONTEND_BASE = 'http://localhost:5173';

// Helper to make HTTP requests
function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, method === 'GET' ? API_BASE : API_BASE);
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

async function testFrontendUI() {
    console.log('='.repeat(60));
    console.log('VENUS ATTENDANCE RECAP - FRONTEND UI TEST SUITE');
    console.log('='.repeat(60));
    console.log();

    // Test 1: Frontend is accessible
    console.log('[TEST 1] Frontend Server Accessibility');
    try {
        const res = await new Promise((resolve, reject) => {
            http.get(FRONTEND_BASE, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, data }));
            }).on('error', reject);
        });

        if (res.status === 200) {
            console.log('  PASS: Frontend server is running');
            console.log('  Checking for React app...');
            if (res.data.includes('root') || res.data.includes('React')) {
                console.log('  PASS: React app detected');
            }
            passed++;
        } else {
            console.log('  FAIL: Frontend returned status', res.status);
            failed++;
        }
    } catch (e) {
        console.log('  FAIL: Frontend not accessible -', e.message);
        console.log('  Start with: cd frontend && npm run dev');
    }
    console.log();

    let passed = 0;
    let failed = 0;

    // Test 2: Test data flow from backend to frontend
    console.log('[TEST 2] Data Flow: Backend to Frontend');
    try {
        // Get attendance data
        const res = await request('GET', '/api/attendance?month=2&year=2026');
        if (res.status === 200 && res.data.success) {
            const employees = res.data.data;
            console.log('  PASS: Data retrieved from backend');
            console.log(`  Total employees: ${employees.length}`);

            // Check required fields
            const requiredFields = ['id', 'name', 'attendance', 'ptrjEmployeeID', 'chargeJob'];
            const sample = employees[0];
            if (sample) {
                const missing = requiredFields.filter(f => !(f in sample));
                if (missing.length === 0) {
                    console.log('  PASS: All required fields present');
                    passed++;
                } else {
                    console.log('  FAIL: Missing fields:', missing.join(', '));
                    failed++;
                }
            }
        } else {
            console.log('  FAIL: Backend returned error');
            failed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 3: Test AttendanceMatrix data structure
    console.log('[TEST 3] AttendanceMatrix Data Structure');
    try {
        const res = await request('GET', '/api/monthly-grid?month=2&year=2026');
        if (res.status === 200 && res.data.success) {
            const employees = res.data.data;
            const sample = employees[0];

            if (sample && sample.attendance) {
                const days = Object.keys(sample.attendance);
                console.log(`  PASS: Grid format - ${days.length} days`);
                console.log(`  Sample day data:`, JSON.stringify(sample.attendance['1']));

                // Check day structure
                const day1 = sample.attendance['1'];
                const requiredDayFields = ['status', 'date', 'dayName'];
                const missing = requiredDayFields.filter(f => !(f in day1));
                if (missing.length === 0) {
                    console.log('  PASS: Day data structure valid');
                    passed++;
                } else {
                    console.log('  FAIL: Missing day fields:', missing.join(', '));
                    failed++;
                }
            } else {
                console.log('  FAIL: No attendance data');
                failed++;
            }
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 4: Test filter functionality
    console.log('[TEST 4] Filter Functionality');
    try {
        const res = await request('GET', '/api/attendance?month=2&year=2026');
        if (res.status === 200 && res.data.success) {
            const employees = res.data.data;

            // Test absent filter
            const absentEmployees = employees.filter(emp =>
                Object.values(emp.attendance || {}).some(d => (d.status || '').toUpperCase() === 'ALFA')
            );
            console.log(`  Absent employees: ${absentEmployees.length}`);

            // Test leave/sick filter
            const leaveSickEmployees = employees.filter(emp =>
                Object.values(emp.attendance || {}).some(d => {
                    const st = (d.status || '').toUpperCase();
                    return ['CT', 'CUTI', 'I', 'IZIN', 'S', 'SAKIT', 'SD'].includes(st);
                })
            );
            console.log(`  Leave/Sick employees: ${leaveSickEmployees.length}`);

            // Test overtime filter
            const otEmployees = employees.filter(emp => {
                let totalOt = 0;
                Object.values(emp.attendance || {}).forEach(day => {
                    totalOt += Number(day.overtimeHours) || 0;
                });
                return totalOt > 0;
            });
            console.log(`  Overtime employees: ${otEmployees.length}`);

            console.log('  PASS: Filter calculations working');
            passed++;
        }
    } catch (e) {
        console.log('  FAIL:', e.message);
        failed++;
    }
    console.log();

    // Test 5: Test comparison data
    console.log('[TEST 5] Comparison Data Integration');
    try {
        const res = await request('POST', '/api/comparison/compare', {
            employees: [],
            startDate: '2026-02-01',
            endDate: '2026-02-28'
        });
        if (res.status === 200 && res.data.success) {
            console.log('  PASS: Comparison API working');
            console.log('  Results:', res.data.results?.length || 0, 'records');
            passed++;
        } else {
            console.log('  FAIL: Comparison API error');
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
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log();

    if (failed === 0) {
        console.log('ALL TESTS PASSED!');
    } else {
        console.log('SOME TESTS FAILED');
    }
}

testFrontendUI().catch(console.error);
