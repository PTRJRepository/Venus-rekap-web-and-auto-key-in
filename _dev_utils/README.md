# Venus Attendance Recap - Dev Utils

This folder contains development utilities, testing scripts, and exploration tools.

## Folder Structure

```
_dev_utils/
├── tests/              # Testing scripts
│   ├── test_api_endpoints.js       # Test all backend API endpoints
│   ├── test_frontend_ui.js         # Test frontend UI and data flow
│   ├── test_attendance_sync.js    # Test attendance data sync
│   ├── test_payroll_service.js    # Test payroll service
│   └── test_upsert_emp.js        # Test employee upsert
├── explorations/        # Exploration scripts
│   ├── check_payroll_tables.js    # Check payroll database tables
│   └── test_millware_payroll.js  # Test Millware payroll integration
└── planning/           # Planning documents
    └── AutoKeyIn_MappingReference.md
```

## Running Tests

### Prerequisites
1. Start backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. Start frontend (for UI tests):
   ```bash
   cd frontend
   npm run dev
   ```

### Run All Tests

```bash
# Test API endpoints
node _dev_utils/tests/test_api_endpoints.js

# Test frontend UI
node _dev_utils/tests/test_frontend_ui.js

# Test attendance sync
node _dev_utils/tests/test_attendance_sync.js
```

## API Endpoints Tested

- `GET /api/months` - Available months
- `GET /api/attendance` - Attendance data
- `GET /api/monthly-grid` - Grid format attendance
- `GET /api/employees` - Employee list
- `GET /api/employee-mill` - Employee mapping
- `GET /api/export-options/employees` - Export options
- `POST /api/export` - Export data
- `POST /api/comparison/compare` - Comparison
- `GET /api/staging/data` - Staging data
- `GET /api/payroll` - Payroll data
