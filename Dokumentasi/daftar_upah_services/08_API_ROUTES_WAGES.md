# API Routes - Wages Comparison Endpoints

## Gambaran Umum

Dokumentasi ini menjelaskan semua endpoint API yang terkait dengan **Wages Comparison** (perbandingan payroll dengan wages). Endpoint-endpoint ini menyediakan data untuk verifikasi dan audit pembayaran payroll.

**File Lokasi**: `backend/src/api/wagesRoutes.ts`

## Base URL

```
http://localhost:{PORT}/payroll/wages
```

**Authentication**: Semua endpoint memerlukan Bearer token di header `Authorization`.

## Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/periods/available` | Get available wages periods |
| GET | `/period/:month/:year` | Get wages data for period |
| GET | `/recap-all/:month/:year` | Get all divisions recap (THR mode) |
| GET | `/employee/:empCode/history` | Get employee wages history |
| GET | `/comparison/:month/:year` | Get wages comparison data |
| GET | `/comparison/employee/:empCode` | Get single employee comparison |
| GET | `/verification/summary/:month/:year` | Get verification summary |

---

## Endpoint Details

### 1. GET /periods/available

Get available periods from wages tables.

**URL**:
```
GET /payroll/wages/periods/available
```

**Authentication**: Required (Bearer token)

**Query Parameters**: None

**Response**:
```json
{
    "success": true,
    "count": 3,
    "data": [
        {
            "month": 1,
            "year": 2026,
            "label": "Januari 2026",
            "employee_count": 250
        },
        {
            "month": 12,
            "year": 2025,
            "label": "Desember 2025",
            "employee_count": 248
        },
        {
            "month": 11,
            "year": 2025,
            "label": "November 2025",
            "employee_count": 245
        }
    ]
}
```

**Use Case**: Populate period dropdown in UI.

**Example Request**:
```typescript
const response = await fetch('http://localhost:3000/payroll/wages/periods/available', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer eyJhbGc...'
    }
});

const result = await response.json();
console.log(result.data);
```

---

### 2. GET /period/:month/:year

Get wages data for a specific period.

**URL**:
```
GET /payroll/wages/period/:month/:year
```

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `month`: Month (1-12)
- `year`: Year (e.g., 2026)

**Query Parameters**:
- `division` (optional): Division code filter (e.g., 'P1A', 'ALL')

**Response**:
```json
{
    "success": true,
    "period": {
        "month": 1,
        "year": 2026,
        "label": "Januari 2026"
    },
    "count": 250,
    "data": [
        {
            "id": 12345,
            "wages_no": "12345",
            "emp_code": "E0001",
            "emp_name": "John Doe",
            "nik": "E0001",
            "gang_code": "A01",
            "division_code": "P1A",
            "jumlah_hk": 0,
            "upah_dasar": 0,
            "gaji_pokok": 0,
            "total_tunjangan": 0,
            "total_premi": 0,
            "total_potongan": 0,
            "upah_bersih": 3500000,
            "payment_status": "Paid",
            "payment_date": "2026-01-31T00:00:00.000Z",
            "period_month": 1,
            "period_year": 2026
        }
    ]
}
```

**Note**: PR_EMPWAGES only has `Amount` (upah_bersih), other fields default to 0.

**Use Case**: Display wages data for a period.

**Example Request**:
```typescript
const response = await fetch('http://localhost:3000/payroll/wages/period/1/2026?division=P1A', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer eyJhbGc...'
    }
});

const result = await response.json();
console.log(result.data);
```

---

### 3. GET /recap-all/:month/:year

Get all divisions recap (THR mode) - No thumbprint, just totals.

**URL**:
```
GET /payroll/wages/recap-all/:month/:year
```

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `month`: Month (1-12)
- `year`: Year (e.g., 2026)

**Query Parameters**:
- `include_thumbprint` (optional): 'true' or 'false'

**Response**:
```json
{
    "success": true,
    "period": {
        "month": 1,
        "year": 2026,
        "label": "Januari 2026"
    },
    "mode": "recap_all",
    "include_thumbprint": false,
    "divisions": [
        {
            "division": "P1A",
            "karyawan_count": 150,
            "total_hk": 3900,
            "total_upah_pokok": 292500000,
            "total_tunjangan": 75000000,
            "total_premi": 45000000,
            "total_lembur": 15000000,
            "total_potongan": 30000000,
            "total_upah_bersih": 397500000
        },
        {
            "division": "P1B",
            "karyawan_count": 120,
            "total_hk": 3120,
            "total_upah_pokok": 234000000,
            "total_tunjangan": 60000000,
            "total_premi": 36000000,
            "total_lembur": 12000000,
            "total_potongan": 24000000,
            "total_upah_bersih": 318000000
        }
    ],
    "grand_total": {
        "total_karyawan": 270,
        "total_hk": 7020,
        "total_upah_pokok": 526500000,
        "total_tunjangan": 135000000,
        "total_premi": 81000000,
        "total_lembur": 27000000,
        "total_potongan": 54000000,
        "total_upah_bersih": 715500000
    }
}
```

**Use Case**: THR report, all divisions summary.

**Example Request**:
```typescript
const response = await fetch('http://localhost:3000/payroll/wages/recap-all/1/2026', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer eyJhbGc...'
    }
});

const result = await response.json();
console.log(result.grand_total);
```

---

### 4. GET /employee/:empCode/history

Get employee wages history (multiple periods).

**URL**:
```
GET /payroll/wages/employee/:empCode/history
```

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `empCode`: Employee code (e.g., 'E0001')

**Query Parameters**:
- `months` (optional): Number of months to fetch (default: 12)

**Response**:
```json
{
    "success": true,
    "emp_code": "E0001",
    "count": 12,
    "data": [
        {
            "id": 12345,
            "wages_no": "12345",
            "emp_code": "E0001",
            "emp_name": "John Doe",
            "nik": "E0001",
            "gang_code": "A01",
            "division_code": "P1A",
            "upah_bersih": 3500000,
            "payment_status": "Paid",
            "payment_date": "2026-01-31T00:00:00.000Z",
            "period_month": 1,
            "period_year": 2026
        },
        {
            "id": 12344,
            "wages_no": "12344",
            "emp_code": "E0001",
            "emp_name": "John Doe",
            "nik": "E0001",
            "gang_code": "A01",
            "division_code": "P1A",
            "upah_bersih": 3400000,
            "payment_status": "Paid",
            "payment_date": "2025-12-31T00:00:00.000Z",
            "period_month": 12,
            "period_year": 2025
        }
    ]
}
```

**Use Case**: Employee wages history view, trend analysis.

**Example Request**:
```typescript
const response = await fetch('http://localhost:3000/payroll/wages/employee/E0001/history?months=6', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer eyJhbGc...'
    }
});

const result = await response.json();
console.log(result.data);
```

---

### 5. GET /comparison/:month/:year ⭐

Get wages comparison data (Main Endpoint).

**URL**:
```
GET /payroll/wages/comparison/:month/:year
```

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `month`: Month (1-12)
- `year`: Year (e.g., 2026)

**Query Parameters**:
- `division` (optional): Division code filter
- `gang_code` (optional): Gang code filter

**Response**:
```json
{
    "success": true,
    "period": {
        "month": 1,
        "year": 2026,
        "label": "Januari 2026"
    },
    "summary": {
        "period_month": 1,
        "period_year": 2026,
        "period_label": "Januari 2026",
        "total_employees": 250,
        "matched": 240,
        "minor_differences": 5,
        "major_differences": 3,
        "no_wages_data": 2,
        "total_variance": 45000,
        "tolerance": 1000
    },
    "data": [
        {
            "emp_code": "E0001",
            "nik": "E0001",
            "nama": "John Doe",
            "gang_code": "A01",
            "division_code": "P1A",
            "daftar_upah": {
                "jumlah_hk": 26,
                "upah_dasar": 75000,
                "gaji_pokok": 1950000,
                "beras_jumlah": 78000,
                "jabatan_jumlah": 50000,
                "masa_kerja_jumlah": 100000,
                "total_tunjangan": 478000,
                "lembur_jam": 5,
                "lembur_jumlah": 75000,
                "premi_brondol": 150000,
                "premi_pph": 25000,
                "total_premi": 275000,
                "pot_spsi": 5000,
                "pot_pph21": 25000,
                "pot_bpjs_kesehatan_pekerja": 23500,
                "pot_bpjs_pensiun_pekerja": 23500,
                "pot_koreksi": 0,
                "total_potongan": 77000,
                "jumlah_upah_kotor": 2703000,
                "upah_bersih": 2626000,
                "status_ptkp": "TK/0",
                "kategori_ter": "TER A",
                "tarif_pajak_ter": 0.05,
                "pph21_ter": 25000
            },
            "wages": {
                "wages_no": "12345",
                "wages_date": "2026-01-31T00:00:00.000Z",
                "jumlah_hk": 0,
                "upah_dasar": 0,
                "gaji_pokok": 0,
                "total_tunjangan": 0,
                "total_premi": 0,
                "total_potongan": 0,
                "upah_bersih": 2626000,
                "payment_status": "Paid"
            },
            "comparison": {
                "hk_match": true,
                "amount_match": true,
                "hk_difference": 0,
                "amount_difference": 0,
                "status": "MATCH"
            }
        }
    ]
}
```

**Comparison Status**:
- `MATCH`: `amountDiff <= 1000`
- `MINOR_DIFF`: `1000 < amountDiff <= 10000`
- `MAJOR_DIFF`: `amountDiff > 10000`
- `NO_WAGES`: No wages data found

**Use Case**: Main wages comparison report, payroll verification.

**Example Request**:
```typescript
const response = await fetch('http://localhost:3000/payroll/wages/comparison/1/2026?division=P1A', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer eyJhbGc...'
    }
});

const result = await response.json();
console.log(`Matched: ${result.summary.matched}`);
console.log(`Major differences: ${result.summary.major_differences}`);
```

---

### 6. GET /comparison/employee/:empCode

Get single employee comparison.

**URL**:
```
GET /payroll/wages/comparison/employee/:empCode
```

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `empCode`: Employee code (e.g., 'E0001')

**Query Parameters**:
- `month`: Month (required)
- `year`: Year (required)

**Response**:
```json
{
    "success": true,
    "emp_code": "E0001",
    "period": {
        "month": 1,
        "year": 2026,
        "label": "Januari 2026"
    },
    "employee": {
        "emp_code": "E0001",
        "nik": "E0001",
        "nama": "John Doe",
        "gang_code": "A01",
        "division_code": "P1A"
    },
    "daftar_upah": {
        "jumlah_hk": 26,
        "gaji_pokok": 1950000,
        "total_tunjangan": 478000,
        "total_premi": 275000,
        "total_potongan": 77000,
        "upah_bersih": 2626000
    },
    "wages": {
        "wages_no": "12345",
        "wages_date": "2026-01-31T00:00:00.000Z",
        "jumlah_hk": 0,
        "upah_bersih": 2626000,
        "payment_status": "Paid"
    },
    "comparison": {
        "hk_match": true,
        "amount_match": true,
        "hk_difference": 0,
        "amount_difference": 0,
        "status": "MATCH"
    }
}
```

**Use Case**: Employee-specific verification, dispute resolution.

**Example Request**:
```typescript
const response = await fetch('http://localhost:3000/payroll/wages/comparison/employee/E0001?month=1&year=2026', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer eyJhbGc...'
    }
});

const result = await response.json();
console.log(`Status: ${result.comparison.status}`);
```

---

### 7. GET /verification/summary/:month/:year

Get wages verification summary.

**URL**:
```
GET /payroll/wages/verification/summary/:month/:year
```

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `month`: Month (1-12)
- `year`: Year (e.g., 2026)

**Query Parameters**:
- `division` (optional): Division code filter

**Response**:
```json
{
    "success": true,
    "period": {
        "month": 1,
        "year": 2026,
        "label": "Januari 2026"
    },
    "summary": {
        "period_month": 1,
        "period_year": 2026,
        "period_label": "Januari 2026",
        "total_employees": 250,
        "matched": 240,
        "minor_differences": 5,
        "major_differences": 3,
        "no_wages_data": 2,
        "total_variance": 45000,
        "tolerance": 1000,
        "total_upah_bersih_calculated": 657500000,
        "total_wages_paid": 657455000,
        "verification_rate": "96.00%",
        "data_completeness": "99.20%"
    },
    "breakdown": {
        "by_status": {
            "match": [
                // Array of MATCH comparisons
            ],
            "minor_diff": [
                // Array of MINOR_DIFF comparisons
            ],
            "major_diff": [
                // Array of MAJOR_DIFF comparisons
            ],
            "no_wages": [
                // Array of NO_WAGES comparisons
            ]
        }
    }
}
```

**Metrics**:
- `verification_rate`: `(matched / total_employees) × 100%`
- `data_completeness`: `((total - no_wages) / total) × 100%`

**Use Case**: Management dashboard, audit summary.

**Example Request**:
```typescript
const response = await fetch('http://localhost:3000/payroll/wages/verification/summary/1/2026?division=P1A', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer eyJhbGc...'
    }
});

const result = await response.json();
console.log(`Verification Rate: ${result.summary.verification_rate}`);
console.log(`Data Completeness: ${result.summary.data_completeness}`);
```

---

## Error Responses

### 400 Bad Request

```json
{
    "error": "Invalid month or year"
}
```

**Cause**: Invalid month (not 1-12) or year format.

### 401 Unauthorized

```json
{
    "message": "Unauthorized"
}
```

**Cause**: Missing or invalid Bearer token.

### 404 Not Found

```json
{
    "error": "No payroll data found for this period",
    "period": {
        "month": 1,
        "year": 2026,
        "label": "Januari 2026"
    }
}
```

**Cause**: No data available for the specified period.

### 500 Internal Server Error

```json
{
    "error": "Error message details"
}
```

**Cause**: Server-side error during processing.

---

## Authentication

All endpoints require Bearer token authentication.

**Header Format**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Getting Token**:
```typescript
// Login first to get token
const loginResponse = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        username: 'admin',
        password: 'password'
    })
});

const { token } = await loginResponse.json();

// Use token in subsequent requests
const wagesResponse = await fetch('http://localhost:3000/payroll/wages/comparison/1/2026', {
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${token}`
    }
});
```

---

## Rate Limiting

**Current Limits**:
- No rate limiting implemented yet
- Recommended: Implement rate limiting for production

**Best Practice**:
```typescript
// Add delay between requests
await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
```

---

## Best Practices

### 1. **Always Handle Errors**

```typescript
try {
    const response = await fetch('/payroll/wages/comparison/1/2026', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(result);
} catch (error) {
    console.error('Error fetching wages comparison:', error);
}
```

### 2. **Cache Results**

```typescript
const cacheKey = `wages_comparison:${month}:${year}:${division}`;
let cached = cacheService.get(cacheKey);

if (!cached) {
    const response = await fetch(url, { headers });
    cached = await response.json();
    cacheService.set(cacheKey, cached, 300); // 5 minutes
}
```

### 3. **Use Query Parameters for Filtering**

```typescript
// ✅ GOOD: Filter on server side
const response = await fetch('/payroll/wages/comparison/1/2026?division=P1A');

// ❌ BAD: Fetch all then filter client side
const response = await fetch('/payroll/wages/comparison/1/2026');
const data = await response.json();
const filtered = data.data.filter(d => d.division_code === 'P1A');
```

### 4. **Check Comparison Status**

```typescript
const result = await fetch(url).then(r => r.json());

// Log discrepancies
result.data
    .filter(d => d.comparison.status !== 'MATCH')
    .forEach(d => {
        console.warn(`${d.emp_code}: ${d.comparison.status} - Diff: ${d.comparison.amount_difference}`);
    });
```

---

## Referensi Terkait

- 📄 [`03_WAGES_SERVICE.md`](./03_WAGES_SERVICE.md) - WagesService logic
- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Payroll calculation
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Database schema
- 📄 [`00_README_MAIN.md`](./00_README_MAIN.md) - Gambaran umum

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/api/wagesRoutes.ts`  
**Base Path**: `/payroll/wages`
