# PayrollDataService - Layanan Agregasi dan Fetching Data Payroll

## Gambaran Umum

**PayrollDataService** adalah service yang bertanggung jawab untuk fetching dan agregasi data payroll dari berbagai sumber. Service ini bertindak sebagai layer antara data extraction (DataExtractorService) dan consumption layer (frontend/reporting).

**File Lokasi**: `backend/src/services/payrollDataService.ts`

## Tanggung Jawab Utama

1. **Fetch Payroll Data**: Mengambil data payroll aggregated per gang
2. **Fetch Employee Data**: Mengambil data detail per karyawan
3. **Handle Virtual Divisions**: Mendukung virtual division (WKS_PG, WKS_AR)
4. **Data Mapping**: Mapping raw data ke AggregationRecord structure
5. **HTTP Integration**: Fetch data via HTTP raw-tree endpoint

## Struktur Data

### Interface: AggregationRecord

```typescript
export interface AggregationRecord {
    // Gang Info
    gang_code: string;
    gang_description: string;
    
    // Employee Count
    total_employees: number;
    
    // Attendance
    total_hk: number;
    total_hari_kerja: number;
    total_cuti_tahunan: number;
    total_cuti_sakit: number;
    total_cuti_minggu: number;
    total_cuti_nasional: number;
    
    // Salary Components
    total_upah_dasar: number;
    total_upah_pokok: number;
    total_gaji_pokok: number;
    
    // Allowances (Tunjangan)
    total_beras: number;
    total_jabatan: number;
    total_masa_kerja: number;
    total_lembur: number;
    total_tunjangan: number;
    
    // Premi
    total_premi_brondol: number;
    total_premi_prunning: number;
    total_premi_insentif: number;    // From dynamic_premi "INSENTIF"
    total_premi_kinerja: number;     // From dynamic_premi "KINERJA"
    total_premi: number;
    
    // Deductions (Potongan)
    total_potongan: number;
    total_pph21: number;
    total_bpjs_pekerja: number;
    total_bpjs_majikan: number;
    total_spsi: number;
    total_koreksi: number;
    
    // Summary
    total_upah_kotor: number;
    total_upah_bersih: number;
    
    // Production
    total_ffb_weight: number;
    total_weight_tbs: number;        // TBS weight
    
    // Metadata
    dynamic_premi_data: string;      // JSON string of all dynamic premi
    informasi_tambahan: string;      // Additional information
}
```

## Metode Publik

### 1. fetchPayrollData() ⭐

Fetch payroll data untuk divisi dan periode tertentu.

```typescript
static async fetchPayrollData(
    division: string,
    month: number,
    year: number,
    authToken: string
): Promise<Record<string, AggregationRecord[]>>
```

**Parameter**:
- `division`: Division code (e.g., 'P1A', 'WKS_PG')
- `month`: Bulan periode (1-12)
- `year`: Tahun periode
- `authToken`: Authorization token untuk HTTP request

**Return**: `Record<string, AggregationRecord[]>` - Map division ke array of records

**Proses**:
```
┌─────────────────────────────────────────────────────────────┐
│        ALUR PayrollDataService.fetchPayrollData()           │
└─────────────────────────────────────────────────────────────┘

1. Check Virtual Division
   └─ divisionDefinition.isVirtualDivision(division)
      ├─ If true: Get source divisions
      └─ If false: Use division as-is

2. Fetch Raw Tree Data (HTTP)
   └─ fetchRawTreeData(division, month, year, authToken, includeVirtual=true)
      └─ GET /backend/upah/payroll/locked/report/raw-tree
         ?div={division}&month={month}&year={year}&include_virtual={true}

3. Parse Response
   ├─ Extract gangs array
   ├─ Extract premi_title_map
   └─ Extract potongan_title_map

4. Map to AggregationRecord
   └─ For each gang in gangs:
      ├─ Extract gang_code, gang_description
      ├─ Extract gang_totals
      └─ mapGangTotalsToAggregation()

5. Build Result
   └─ results[division] = records[]

6. Return Result
```

**Virtual Division Handling**:
```typescript
// Virtual divisions (WKS_PG, WKS_AR) automatically include
// source divisions' data through includeVirtual=true flag

// WKS_PG includes: P1A, P1B, P2A, P2B workshop gangs
// WKS_AR includes: AB1, AB2, ARC workshop gangs
```

**Contoh Penggunaan**:
```typescript
const authToken = 'Bearer eyJhbGc...';

// Fetch for single division
const p1aData = await PayrollDataService.fetchPayrollData(
    'P1A', 1, 2026, authToken
);
console.log(p1aData['P1A']); // Array of AggregationRecord

// Fetch for virtual division (auto-aggregates source divisions)
const wksPgData = await PayrollDataService.fetchPayrollData(
    'WKS_PG', 1, 2026, authToken
);
console.log(wksPgData['WKS_PG']); // Includes P1A, P1B, P2A, P2B workshop data
```

---

### 2. fetchEmployeeData()

Fetch detailed employee payroll data.

```typescript
static async fetchEmployeeData(
    division: string,
    month: number,
    year: number,
    authToken: string
): Promise<any[]>
```

**Parameter**: Same as fetchPayrollData

**Return**: `any[]` - Flat list of employee records

**Proses**:
```
┌─────────────────────────────────────────────────────────────┐
│        ALUR PayrollDataService.fetchEmployeeData()          │
└─────────────────────────────────────────────────────────────┘

1. Check Virtual Division
   └─ If virtual: Get source divisions list
      └─ e.g., WKS_PG → ['P1A', 'P1B', 'P2A', 'P2B']

2. For Each Division:
   ├─ Call DataExtractorService.extractPayrollData()
   │  └─ month, year, 'ALL', division, null, Config.DB_PROFILE
   │
   ├─ Extract data_rows
   ├─ Tag with _source_division
   └─ Push to results array

3. Return Combined Results
```

**Virtual Division Flow**:
```typescript
// For WKS_PG:
// 1. Fetch P1A employee data
// 2. Fetch P1B employee data
// 3. Fetch P2A employee data
// 4. Fetch P2B employee data
// 5. Combine all into single array
// 6. Each record tagged with _source_division
```

**Contoh Penggunaan**:
```typescript
const employees = await PayrollDataService.fetchEmployeeData(
    'P1A', 1, 2026, authToken
);

employees.forEach(emp => {
    console.log(`${emp.nik} - ${emp.nama}: ${emp.upah_bersih}`);
});

// For virtual division
const wksEmployees = await PayrollDataService.fetchEmployeeData(
    'WKS_PG', 1, 2026, authToken
);

// Employees from all source divisions
console.log(`Total employees: ${wksEmployees.length}`);
```

---

### 3. mapGangTotalsToAggregation()

Map raw gang_totals to AggregationRecord structure.

```typescript
private static mapGangTotalsToAggregation(
    gangCode: string,
    gangDescription: string,
    totals: any,
    premiTitleMap: Record<string, string>,
    potonganTitleMap: Record<string, string>
): AggregationRecord
```

**Proses**:
```
┌─────────────────────────────────────────────────────────────┐
│     ALUR mapGangTotalsToAggregation()                       │
└─────────────────────────────────────────────────────────────┘

1. Build Dynamic Premi Data
   ├─ Loop through totals object
   ├─ Filter keys starting with 'premi_'
   ├─ Exclude: premi_pph, premi_koreksi, total_premi
   ├─ For each valid premi:
   │  ├─ Get header from premi_title_map
   │  └─ Push to dynamicPremiList
   └─ JSON.stringify(dynamicPremiList)

2. Map All Fields
   ├─ Direct mapping: gang_code, gang_description
   ├─ Numeric mapping: total_employees, total_hk, dll
   └─ Default to 0 if undefined

3. Build AggregationRecord
   └─ Return mapped object
```

**Dynamic Premi Extraction**:
```typescript
// User requested: Total Premi must match sum of parts (breakdown)
// Exclude: pph, koreksi
// Include: tiket (as requested)

const excludePatterns = ['premi_pph', 'premi_koreksi', 'total_premi'];
const dynamicPremiList: any[] = [];

for (const [key, value] of Object.entries(totals)) {
    if (key.startsWith('premi_') && (value as number) > 0) {
        if (excludePatterns.includes(key)) continue;
        
        const header = premiTitleMap[key] || key.replace('premi_', '').toUpperCase();
        dynamicPremiList.push({
            header: header,
            total: value
        });
    }
}

// Result:
// [
//     { header: 'INSENTIF', total: 500000 },
//     { header: 'KINERJA', total: 750000 },
//     { header: 'BRONDOL', total: 300000 }
// ]
```

---

## Private Methods

### 1. fetchRawTreeData()

Fetch data via HTTP raw-tree endpoint.

```typescript
private static async fetchRawTreeData(
    division: string,
    month: number,
    year: number,
    authToken: string,
    includeVirtual: boolean = false
)
```

**URL Construction**:
```typescript
const url = `http://localhost:${Config.PORT}/backend/upah/payroll/locked/report/raw-tree?div=${division}&month=${month}&year=${year}&include_virtual=${includeVirtual}`;
```

**HTTP Request**:
```typescript
const response = await fetch(url, {
    method: "GET",
    headers: {
        "Authorization": authToken
    }
});

if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch raw-tree data: ${response.status} ${response.statusText} - ${errorText}`);
}

const result = await response.json();
```

**Response Structure**:
```json
{
    "success": true,
    "gangs": [
        {
            "gang_code": "A01",
            "gang_description": "Parit Gunung 1A - Gang 1",
            "gang_totals": {
                "total_employees": 25,
                "total_hk": 650,
                "total_gaji_pokok": 48750000,
                "total_tunjangan": 12500000,
                "total_premi": 7500000,
                "total_potongan": 5000000,
                "total_upah_bersih": 63750000
            }
        }
    ],
    "premi_title_map": {
        "premi_insentif": "INSENTIF",
        "premi_kinerja": "KINERJA"
    },
    "potongan_title_map": {
        "pot_spsi": "SPSI",
        "pot_pph21": "PPh21"
    }
}
```

---

## Virtual Division Support

### What are Virtual Divisions?

Virtual divisions are logical groupings of source divisions for reporting purposes.

| Virtual Division | Source Divisions | Description |
|-----------------|------------------|-------------|
| **WKS_PG** | P1A, P1B, P2A, P2B | Workshop Parit Gunung |
| **WKS_AR** | AB1, AB2, ARC | Workshop Air Ruak |

### How It Works

```typescript
// 1. Check if division is virtual
const isVirtual = divisionDefinition.isVirtualDivision(division);

if (isVirtual) {
    // 2. Get source divisions
    const sourceDivisions = await divisionDefinition.getSourceDivisionsForAggregation(division);
    // WKS_PG → ['P1A', 'P1B', 'P2A', 'P2B']
    
    // 3. Fetch with includeVirtual=true
    // This ensures ALL gangs are fetched, including virtual sub-division gangs
    const rawData = await fetchRawTreeData(division, month, year, authToken, true);
    
    // 4. Summary service handles virtual division grouping at READ time
    // Using HR_GANG LocCode + pattern matching
}
```

**Important Note**:
```typescript
// IMPORTANT: Always set includeVirtual=true so ALL gangs are fetched,
// even those belonging to virtual sub-divisions (e.g., AMC/INF/INT from P1A).
// The summary service handles virtual division grouping at READ time.
```

---

## Integration with Other Services

### 1. **DataExtractorService**

```typescript
// PayrollDataService uses DataExtractorService for employee data
const dataExtractor = DataExtractorService.getInstance();

const rawData = await dataExtractor.extractPayrollData(
    month, year, "ALL", div, null, Config.DB_PROFILE, false
);

const employees = rawData.data_rows;
```

### 2. **DivisionDefinition**

```typescript
// Check virtual division and get source divisions
const isVirtual = divisionDefinition.isVirtualDivision(division);

if (isVirtual) {
    const sourceDivisions = await divisionDefinition.getSourceDivisionsForAggregation(division);
}
```

### 3. **SummaryService**

```typescript
// SummaryService consumes AggregationRecord[]
const payrollData = await PayrollDataService.fetchPayrollData(division, month, year, authToken);

// Aggregate further for summary reporting
const summary = SummaryService.aggregate(payrollData[division]);
```

---

## Use Cases

### 1. **Dashboard Reporting**

```typescript
async function getDashboardData(division: string, month: number, year: number) {
    const authToken = await getAuthToken();
    const data = await PayrollDataService.fetchPayrollData(division, month, year, authToken);
    
    const records = data[division];
    
    return {
        total_employees: records.reduce((sum, r) => sum + r.total_employees, 0),
        total_upah_bersih: records.reduce((sum, r) => sum + r.total_upah_bersih, 0),
        total_premi: records.reduce((sum, r) => sum + r.total_premi, 0),
        gangs_count: records.length
    };
}
```

### 2. **Division Comparison**

```typescript
async function compareDivisions(month: number, year: number) {
    const divisions = ['P1A', 'P1B', 'P2A', 'P2B'];
    const authToken = await getAuthToken();
    
    const comparisons = [];
    
    for (const div of divisions) {
        const data = await PayrollDataService.fetchPayrollData(div, month, year, authToken);
        const records = data[div];
        
        comparisons.push({
            division: div,
            total_employees: records.reduce((sum, r) => sum + r.total_employees, 0),
            avg_upah_bersih: records.reduce((sum, r) => sum + r.total_upah_bersih, 0) / records.length,
            gangs_count: records.length
        });
    }
    
    return comparisons.sort((a, b) => b.avg_upah_bersih - a.avg_upah_bersih);
}
```

### 3. **Export to Excel**

```typescript
async function exportPayrollToExcel(division: string, month: number, year: number) {
    const authToken = await getAuthToken();
    const data = await PayrollDataService.fetchPayrollData(division, month, year, authToken);
    const records = data[division];
    
    const worksheet = [
        ['Gang', 'Employees', 'Total HK', 'Gaji Pokok', 'Tunjangan', 'Premi', 'Potongan', 'Upah Bersih']
    ];
    
    records.forEach(r => {
        worksheet.push([
            r.gang_code,
            r.total_employees,
            r.total_hk,
            r.total_gaji_pokok,
            r.total_tunjangan,
            r.total_premi,
            r.total_potongan,
            r.total_upah_bersih
        ]);
    });
    
    return worksheet;
}
```

---

## Best Practices

### 1. **Always Include Auth Token**

```typescript
// ✅ GOOD: Pass auth token
const data = await PayrollDataService.fetchPayrollData(div, month, year, authToken);

// ❌ BAD: Missing auth token
const data = await PayrollDataService.fetchPayrollData(div, month, year, '');
```

### 2. **Handle Virtual Divisions Properly**

```typescript
// ✅ GOOD: Let service handle virtual divisions
const data = await PayrollDataService.fetchPayrollData('WKS_PG', month, year, authToken);

// ❌ BAD: Manually fetch source divisions
const p1a = await PayrollDataService.fetchPayrollData('P1A', month, year, authToken);
const p1b = await PayrollDataService.fetchPayrollData('P1B', month, year, authToken);
// ... manual combine
```

### 3. **Cache Aggregated Data**

```typescript
// ✅ GOOD: Cache result
const cacheKey = `payroll_data:${division}:${month}:${year}`;
let cached = cacheService.get(cacheKey);

if (!cached) {
    cached = await PayrollDataService.fetchPayrollData(division, month, year, authToken);
    cacheService.set(cacheKey, cached, 300); // 5 minutes
}
```

### 4. **Error Handling**

```typescript
// ✅ GOOD: Handle errors
try {
    const data = await PayrollDataService.fetchPayrollData(division, month, year, authToken);
} catch (error) {
    console.error(`[PayrollDataService] Error fetching data for ${division}:`, error);
    // Return empty result or retry
}
```

---

## Troubleshooting

### Issue: No Data for Virtual Division

**Symptom**: Empty result for WKS_PG or WKS_AR.

**Solution**:
1. Verify `includeVirtual=true` in fetchRawTreeData call
2. Check source divisions exist: `divisionDefinition.getSourceDivisionsForAggregation()`
3. Verify data exists for source divisions

### Issue: HTTP 401 Unauthorized

**Symptom**: Error: "Failed to fetch raw-tree data: 401 Unauthorized"

**Solution**:
1. Verify authToken is valid (not expired)
2. Check token format: `Bearer {token}`
3. Refresh token if needed

### Issue: Dynamic Premi Not Showing

**Symptom**: `dynamic_premi_data` is empty or missing items.

**Solution**:
1. Check `premi_title_map` in raw-tree response
2. Verify premi keys start with `premi_`
3. Ensure not excluded by excludePatterns

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Payroll calculation
- 📄 [`divisionDefinition.md`](./divisionDefinition.md) - Division handling
- 📄 [`08_API_ROUTES_WAGES.md`](./08_API_ROUTES_WAGES.md) - API integration
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Database schema

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/services/payrollDataService.ts`
