# Employee Attendance System

A modern, responsive employee attendance tracking system hosted on GitHub Pages with data logging to Google Sheets via Google Apps Script.

## Features

- ✅ Clean, modern dashboard with employee profile cards
- ✅ Real-time digital clock
- ✅ Click-to-check-in/out modal system
- ✅ Smooth confirmations and loading states
- ✅ Add/delete employees with Google Sheet sync
- ✅ Full Google Sheets integration
- ✅ GitHub Pages compatible (static hosting)

---

## Setup Instructions

### Part 1: Google Sheet Setup

1. **Create a new Google Sheet** for your attendance system
2. **Create two sheets** within the spreadsheet:
   - Sheet 1: Name it **"Employees"**
   - Sheet 2: Name it **"Attendance"**

3. **Set up the "Employees" sheet** with these columns:
   - Column A: `Employee ID` (e.g., 1, 2, 3)
   - Column B: `Name` (e.g., John Doe)
   - Column C: `Job Title` (e.g., Manager)

   Example data:
   ```
   Employee ID | Name                | Job Title
   1           | Abigail Peterson    | Manager
   2           | Michael Johnson     | Developer
   3           | Sarah Williams      | Designer
   ```

4. **Set up the "Attendance" sheet** with these columns:
   - Column A: `Timestamp` (e.g., 2026-07-02 09:40:15)
   - Column B: `Employee Name` (e.g., Abigail Peterson)
   - Column C: `Action` (IN or OUT)
   - Column D: `Time` (HH:MM:SS)

   *Note: Data will be automatically appended by the Apps Script*

---

### Part 2: Deploy Google Apps Script

1. **Open your Google Sheet** and go to **Extensions > Apps Script**

2. **Clear the existing code** and paste the following Google Apps Script code:

```javascript
// Configuration
const SHEET_ID = "YOUR_SHEET_ID_HERE"; // Replace with your Google Sheet ID
const EMPLOYEES_SHEET = "Employees";
const ATTENDANCE_SHEET = "Attendance";

// Handle POST requests from the frontend
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID);
    
    // Parse request parameters
    const params = JSON.parse(e.postData.contents);
    const action = params.action; // "clock-in", "clock-out", "add-employee", "delete-employee", "get-employees"
    
    if (action === "clock-in" || action === "clock-out") {
      return handleClocking(sheet, params);
    } else if (action === "add-employee") {
      return handleAddEmployee(sheet, params);
    } else if (action === "delete-employee") {
      return handleDeleteEmployee(sheet, params);
    } else if (action === "get-employees") {
      return handleGetEmployees(sheet);
    }
    
    return createResponse(false, "Unknown action");
  } catch (error) {
    Logger.log("Error: " + error);
    return createResponse(false, error.toString());
  }
}

// Handle clock in/out actions
function handleClocking(sheet, params) {
  try {
    const employeeName = params.employeeName;
    const action = params.action;
    
    const attendanceSheet = sheet.getSheetByName(ATTENDANCE_SHEET);
    const now = new Date();
    const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const time = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");
    
    // Append data to the Attendance sheet
    attendanceSheet.appendRow([timestamp, employeeName, action === "clock-in" ? "IN" : "OUT", time]);
    
    return createResponse(true, `${employeeName} - ${action === "clock-in" ? "Checked in" : "Checked out"} at ${timestamp}`);
  } catch (error) {
    return createResponse(false, error.toString());
  }
}

// Handle adding a new employee
function handleAddEmployee(sheet, params) {
  try {
    const employeeName = params.employeeName;
    const jobTitle = params.jobTitle;
    
    const employeesSheet = sheet.getSheetByName(EMPLOYEES_SHEET);
    const lastRow = employeesSheet.getLastRow();
    const lastId = employeesSheet.getRange(lastRow, 1).getValue();
    const newId = typeof lastId === "number" ? lastId + 1 : 1;
    
    employeesSheet.appendRow([newId, employeeName, jobTitle]);
    
    return createResponse(true, `Employee ${employeeName} added successfully`);
  } catch (error) {
    return createResponse(false, error.toString());
  }
}

// Handle deleting an employee
function handleDeleteEmployee(sheet, params) {
  try {
    const employeeName = params.employeeName;
    
    const employeesSheet = sheet.getSheetByName(EMPLOYEES_SHEET);
    const range = employeesSheet.getRange(1, 1, employeesSheet.getLastRow(), 3);
    const values = range.getValues();
    
    for (let i = values.length - 1; i > 0; i--) {
      if (values[i][1] === employeeName) {
        employeesSheet.deleteRow(i + 1);
        return createResponse(true, `Employee ${employeeName} deleted successfully`);
      }
    }
    
    return createResponse(false, "Employee not found");
  } catch (error) {
    return createResponse(false, error.toString());
  }
}

// Get all employees
function handleGetEmployees(sheet) {
  try {
    const employeesSheet = sheet.getSheetByName(EMPLOYEES_SHEET);
    const range = employeesSheet.getRange(2, 1, employeesSheet.getLastRow() - 1, 3); // Skip header
    const values = range.getValues();
    
    const employees = values.map(row => ({
      id: row[0],
      name: row[1],
      jobTitle: row[2]
    }));
    
    return createResponse(true, "Employees retrieved successfully", employees);
  } catch (error) {
    return createResponse(false, error.toString());
  }
}

// Create a CORS-enabled response
function createResponse(success, message, data = null) {
  const response = {
    success: success,
    message: message,
    data: data,
    timestamp: new Date().toISOString()
  };
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Update the `SHEET_ID`**:
   - Open your Google Sheet
   - Copy the ID from the URL (the long alphanumeric string between `/d/` and `/edit`)
   - Paste it in the Apps Script where it says `"YOUR_SHEET_ID_HERE"`

4. **Save the script** (Ctrl+S or Cmd+S)

5. **Deploy as Web App**:
   - Click **"Deploy"** button (top right)
   - Select **"New deployment"**
   - Choose **"Type > Web app"**
   - Set **"Execute as"** to your Google account
   - Set **"Who has access"** to **"Anyone"**
   - Click **"Deploy"**
   - Copy the deployment URL (you'll need this for the frontend)

6. **Note the Web App URL** - it looks like: `https://script.google.com/macros/d/[ID]/userwithlogin` or similar

https://script.google.com/macros/s/AKfycby1kBbiRONjMqNpeKTFNSJue4R6VhNtNs1KuOT3xz5HreoVujfaphe3bCe7dF6gOLIj/exec

---

### Part 3: Deploy Frontend to GitHub Pages

1. **Create a GitHub repository** named `attendance` (or your preferred name)

2. **Push the following files** to the repository:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `readme.md`

3. **Add your Google Apps Script Web App URL** to `script.js`:
   - Open `script.js`
   - Find line: `const GOOGLE_APPS_SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE";`
   - Replace with your actual Web App URL from Part 2, step 6

4. **Enable GitHub Pages**:
   - Go to repository **Settings > Pages**
   - Set **Source** to **"Deploy from a branch"**
   - Set **Branch** to **"main"** and **folder** to **"/ (root)"**
   - Click **Save**
   - Your site will be live at `https://<your-username>.github.io/attendance/`

---

## Configuration

### Frontend Configuration (`script.js`)

At the top of `script.js`, you'll find:

```javascript
const GOOGLE_APPS_SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE";
```

Replace `YOUR_GOOGLE_APPS_SCRIPT_URL_HERE` with the Web App URL from your Google Apps Script deployment.

---

## Usage

1. **Add Employees**: Click the "+ Add Employee" button in the top right
2. **Clock In/Out**: Click any employee card to open the modal, then click IN or OUT
3. **Delete Employee**: Click the trash icon on an employee card
4. **Real-time Clock**: The clock automatically updates every second

---

## Files Included

- **index.html** - Main HTML structure with semantic markup
- **styles.css** - Modern grid-based layout with animations
- **script.js** - Frontend logic, API calls, and UI state management
- **Google Apps Script Code** - Backend for handling clocking and employee management

---

## Troubleshooting

### "CORS Error" or data not saving?
- Ensure your Google Apps Script is deployed as a **Web App** with **"Anyone"** access
- Verify the Web App URL is correct in `script.js`
- Check the Apps Script logs for errors (Extensions > Apps Script > View > Logs)

### Employees not loading?
- Verify the "Employees" sheet exists and has data with headers in the first row
- Check that your `SHEET_ID` in the Apps Script is correct

### GitHub Pages not working?
- Ensure the repository is public
- Verify GitHub Pages is enabled in repository settings
- Files must be named exactly: `index.html`, `styles.css`, `script.js`

---

## Security Notes

- The Google Apps Script is deployed with **"Anyone"** access, allowing the public frontend to write data
- No authentication is required for this system
- This is suitable for internal/trusted use cases
- For production with sensitive data, consider adding authentication

---

## Customization

### Change Logo
- In `index.html`, find the `<!-- Logo -->` section
- Replace with your company logo (URL or local file)

### Change Colors & Fonts
- Edit the CSS variables at the top of `styles.css`:
  ```css
  :root {
    --primary-color: #007bff;
    --secondary-color: #6c757d;
    /* etc. */
  }
  ```

### Add More Employees
- Add rows to the "Employees" sheet manually, or use the "+ Add Employee" button in the UI

---

## License

Open source. Use and modify as needed for your organization.
