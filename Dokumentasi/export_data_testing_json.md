# Documentation: Export Data to Testing-Data JSON for Browser Automation Agent

## Overview
This document describes the implementation of the data export functionality that generates JSON files used by the browser automation agent to populate attendance data in the Millware system.

## Architecture Flow

### 1. Data Export Process
The export process involves the following components:
- **Backend Service**: `backend/export-cli.js` - Main export entry point
- **Data Service**: `backend/services/attendanceService.js` - Fetches and processes attendance data
- **Output Directory**: `ekstrak absen/` - Where exported JSON files are saved
- **Testing Data Directory**: `browser-automation-engine/testing_data/` - Where browser agent reads data from

### 2. Export CLI Tool
The export tool is a command-line interface located at `backend/export-cli.js`.

#### Usage:
```bash
node export-cli.js --month 1 --year 2026
node export-cli.js --month 1 --year 2026 --no-attendance
```

#### Parameters:
- `--month <number>`: Month to export (1-12)
- `--year <number>`: Year to export
- `--no-attendance`: Use overtime-only mode (skip T_Machine table)
- `--output <path>`: Output file path (optional)

#### Modes:
- **Full Mode**: Includes both T_Machine attendance and overtime data
- **Overtime-Only Mode**: Uses only overtime data when attendance records are not yet available

## Data Structure

### Exported JSON Format
The exported JSON follows this structure:

```json
{
  "metadata": {
    "export_date": "2026-01-23T07:31:25.445Z",
    "period_start": "2026-01-01",
    "period_end": "2026-01-20",
    "mode": "full",
    "total_employees": 2
  },
  "data": [
    {
      "EmployeeID": "PTRJ.241000001",
      "EmployeeName": "Ade Prasety",
      "PTRJEmployeeID": "POM00181",
      "ChargeJob": "(OC7190) BOILER OPERATION / STN-BLR (STATION BOILER) / BLR00000 (LABOUR COST) / L (LABOUR)",
      "Attendance": {
        "2026-01-03": {
          "date": "2026-01-03",
          "dayName": "Sab",
          "status": "Hadir",
          "display": "✓",
          "class": "hours-normal",
          "checkIn": null,
          "checkOut": null,
          "regularHours": 0,
          "overtimeHours": 0,
          "isHoliday": false,
          "holidayName": null,
          "isSunday": false,
          "isAnnualLeave": false,
          "leaveTaskCode": null,
          "leaveDescription": null
        }
      }
    }
  ]
}
```

### Key Data Fields

#### Metadata Properties:
- `export_date`: Timestamp when the export was performed
- `period_start/end`: Date range of the exported data
- `mode`: Either "full" or "overtime-only"
- `total_employees`: Number of employees in the export

#### Employee Properties:
- `EmployeeID`: Unique identifier from Venus HR system
- `EmployeeName`: Full name of the employee
- `PTRJEmployeeID`: Employee ID in the PTRJ system
- `ChargeJob`: Job assignment code in format `(TASK_CODE) DESCRIPTION / STATION / MACHINE / EXPENSE`

#### Attendance Properties:
- `date`: ISO date string (YYYY-MM-DD)
- `dayName`: Day of week abbreviation
- `status`: Attendance status (Hadir, ALFA, CT, MELAHIRKAN, etc.)
- `display`: Human-readable display value
- `regularHours`: Regular working hours (0-7)
- `overtimeHours`: Overtime hours
- `isHoliday/isSunday`: Boolean flags for special days
- `isAnnualLeave`: True if this is an annual leave
- `leaveTaskCode`: Special task code for annual leave entries

## Browser Automation Integration

### Template Integration
The exported JSON files are consumed by the browser automation engine through template files:

- **Template Location**: `browser-automation-engine/templates/attendance-input-loop.json`
- **Data File Reference**: Specified in the template's `dataFile` property

### Template Processing
The automation engine processes the exported data as follows:

1. **Load Template**: Reads the template file with `dataFile` reference
2. **Load Data**: Loads the JSON data from the specified path
3. **Iterate Employees**: Loops through each employee in the data array
4. **Iterate Attendance**: For each employee, loops through daily attendance records
5. **Conditional Processing**: Applies different logic based on attendance type:
   - **Annual Leave**: Uses special task code `(GA9130) PERSONNEL ANNUAL LEAVE`
   - **Regular Attendance**: Uses employee's ChargeJob code
   - **Overtime**: Processes separately with overtime-specific workflow

### Variable Substitution
The engine uses variable substitution to inject data into form fields:
- `${employee.PTRJEmployeeID}` - Employee ID
- `${attendance.date}` - Date in YYYY-MM-DD format
- `${attendance.overtimeHours}` - Overtime hours
- `${employee.ChargeJob}` - Full job assignment code

## Data Processing Logic

### Priority System
The attendance service implements a priority system for determining status:

1. **Attendance Record**: Highest priority - actual check-in/check-out data
2. **Absence Record**: Unpaid leave, sick leave, etc.
3. **Leave Record**: Annual leave, maternity leave, etc.
4. **Auto-Detection**: 
   - Sundays = OFF
   - Holidays = LBR (Libur)
   - Working days without records = ALFA

### Overtime-Only Mode
When using `--no-attendance` flag:
- Skips the T_Machine table lookup
- Considers employees with overtime records as "Hadir"
- Assigns regular hours based on day type (Sat=5, Hol=7, others=0)

## File Locations

### Export Output
- **Default Location**: `ekstrak absen/`
- **Filename Pattern**: `export_[mode]_[year-month]_[timestamp].json`

### Testing Data
- **Location**: `browser-automation-engine/testing_data/`
- **Current Data File**: `current_data.json` (copied from exports)

### Templates
- **Location**: `browser-automation-engine/templates/`
- **Main Template**: `attendance-input-loop.json`

## Usage Examples

### 1. Export Current Month Data
```bash
cd backend
node export-cli.js --month 1 --year 2026
```

### 2. Export with Overtime-Only Mode
```bash
cd backend
node export-cli.js --month 1 --year 2026 --no-attendance
```

### 3. Export to Specific Location
```bash
cd backend
node export-cli.js --month 1 --year 2026 --output ../browser-automation-engine/testing_data/my_export.json
```

## Automation Workflow

### Step-by-Step Process
1. **Export Data**: Run export CLI to generate JSON file
2. **Copy to Testing Data**: Move/copy export to `testing_data/` directory
3. **Update Template**: Modify template to reference the new data file
4. **Run Automation**: Execute browser automation to process the data

### Error Handling
- **Unavailable Data**: Shows "N/A" for dates beyond latest available data
- **Validation**: Template includes retry mechanisms for form validation
- **Recovery**: Engine saves state to allow recovery from interruptions

## Maintenance Notes

### Updating Data Files
1. Export fresh data using the CLI tool
2. Copy the export to the testing_data directory
3. Update the template's `dataFile` property to reference the new file
4. Test the automation with a small subset first

### Troubleshooting
- Check that employee IDs match between systems
- Verify ChargeJob codes are correctly formatted
- Ensure date ranges align with available data
- Monitor automation logs for processing errors