import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    where,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// ========================================================
// FIREBASE CONFIGURATION
// ========================================================
const firebaseConfig = {
    apiKey: "AIzaSyAwxg4_ZFpSUhN2jR6m4OK906xIw0-G1Wk",
    authDomain: "attendance-38ca5.firebaseapp.com",
    projectId: "attendance-38ca5",
    storageBucket: "attendance-38ca5.firebasestorage.app",
    messagingSenderId: "30313950569",
    appId: "1:30313950569:web:5d4f1a970ef12ea381a1f8",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Work schedule (hours expected per day)
const WORK_START = "09:00"; // not used directly but informative
const WORK_END = "17:30"; // not used directly but informative
const EXPECTED_WORK_MINUTES = 8.5 * 60; // 8 hours 30 minutes

// ========================================================
// STATE MANAGEMENT
// ========================================================
let employees = [];
let selectedEmployee = null;
let isProcessing = false;

// ========================================================
// DOM ELEMENTS
// ========================================================
const clockDisplay = document.getElementById("clock");
const employeesGrid = document.getElementById("employeesGrid");
const addEmployeeBtn = document.getElementById("addEmployeeBtn");
const attendanceModal = document.getElementById("attendanceModal");
const modalOverlay = document.getElementById("modalOverlay");
const modalClose = document.getElementById("modalClose");
const btnClockIn = document.getElementById("btnClockIn");
const btnClockOut = document.getElementById("btnClockOut");
const btnAbsent = document.getElementById("btnAbsent");
const confirmationMessage = document.getElementById("confirmationMessage");
const confirmationText = document.getElementById("confirmationText");
const loadingState = document.getElementById("loadingState");
const modalEmployeeName = document.getElementById("modalEmployeeName");
const modalEmployeeRole = document.getElementById("modalEmployeeRole");

const addEmployeeModal = document.getElementById("addEmployeeModal");
const addEmployeeOverlay = document.getElementById("addEmployeeOverlay");
const addEmployeeForm = document.getElementById("addEmployeeForm");
const addEmployeeClose = document.getElementById("addEmployeeClose");
const cancelAddEmployee = document.getElementById("cancelAddEmployee");
const employeeIdInput = document.getElementById("employeeIdInput");
const jobTitleInput = document.getElementById("jobTitleInput");
const selectYear = document.getElementById("selectYear");
const selectMonth = document.getElementById("selectMonth");
const downloadAttendanceBtn = document.getElementById("downloadAttendanceBtn");
const addEmployeeMessage = document.getElementById("addEmployeeMessage");
const addEmployeeMessageText = document.getElementById("addEmployeeMessageText");
const timePickerSection = document.getElementById("timePickerSection");
const timePicker = document.getElementById("timePicker");
const btnTimeSubmit = document.getElementById("btnTimeSubmit");
const editPrompt = document.getElementById("editPrompt");
const editPromptText = document.getElementById("editPromptText");
const btnEditYes = document.getElementById("btnEditYes");
const btnEditNo = document.getElementById("btnEditNo");

const toastNotification = document.getElementById("toastNotification");
const toastMessage = document.getElementById("toastMessage");

let pendingClockAction = null; // Track which action (IN/OUT) is pending time selection
let editExistingTime = null;
let editExistingAction = null;

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
    setupApp();
});

function setupApp() {
    updateClock();
    setInterval(updateClock, 1000);
    populateMonthYearSelectors();
    loadEmployees();
    setupEventListeners();
}

function populateMonthYearSelectors() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startYear = currentYear - 2;
    const endYear = currentYear + 1;

    for (let year = startYear; year <= endYear; year++) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        if (year === currentYear) option.selected = true;
        selectYear.appendChild(option);
    }

    const monthNames = [
        "01", "02", "03", "04", "05", "06",
        "07", "08", "09", "10", "11", "12",
    ];

    monthNames.forEach((month, index) => {
        const option = document.createElement("option");
        option.value = month;
        option.textContent = `${month} (${new Date(0, index).toLocaleString("default", { month: "short" })})`;
        if (index === now.getMonth()) option.selected = true;
        selectMonth.appendChild(option);
    });
}

async function downloadAttendanceForMonth() {
    const selectedYear = selectYear.value;
    const selectedMonth = selectMonth.value;

    if (!selectedYear || !selectedMonth) {
        showToast("❌ Select both year and month");
        return;
    }

    const monthKey = `${selectedYear}-${selectedMonth}`;
    try {
        const employeesSnapshot = await getDocs(collection(db, "employees"));
        const employeesList = employeesSnapshot.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
        }));

        if (employeesList.length === 0) {
            showToast("❌ No employees found to export");
            return;
        }

        employeesList.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

        const attendanceQuery = query(
            collection(db, "attendanceCards"),
            where("month", "==", monthKey)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        const attendanceMap = {};

        attendanceSnapshot.forEach((docItem) => {
            attendanceMap[docItem.id] = docItem.data();
        });

        const daysInMonth = getDaysInMonth(Number(selectedYear), Number(selectedMonth));
        const rows = [];

        const header1 = ["Date"];
        const header2 = [""];
        employeesList.forEach((employee) => {
            header1.push(employee.name || employee.id, "", "");
            header2.push("IN", "OUT", "Hours Missed");
        });

        rows.push(header1);
        rows.push(header2);

        const totals = employeesList.map(() => ({ present: 0, absent: 0, missedMinutes: 0 }));

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(Number(selectedYear), Number(selectedMonth) - 1, day);
            const isSunday = date.getDay() === 0;
            const formattedDate = `${selectedYear}-${selectedMonth}-${String(day).padStart(2, "0")}`;
            const row = [formattedDate];

            employeesList.forEach((employee, idx) => {
                const card = attendanceMap[`${employee.id}_${monthKey}`];
                const dayRecord = card?.attendance?.[String(day)] || null;
                let inValue = "";
                let outValue = "";
                let missedValue = "";

                if (dayRecord) {
                    // Explicit Absent recorded in attendance
                    if (dayRecord.Status === "A") {
                        inValue = "Absent";
                        outValue = "Absent";
                        missedValue = "00:00"; // absent hours counted separately for salary
                        if (!isSunday) {
                            totals[idx].absent += 1;
                        }
                    } else {
                        inValue = dayRecord.in || "";
                        outValue = dayRecord.out || "";
                        if (dayRecord.Status === "P") {
                            totals[idx].present += 1;
                        }

                        const workedHours = Number(dayRecord.hours || 0);
                        const workedMinutes = Math.round(workedHours * 60);

                        if (!outValue) {
                            // OUT missing
                            if (isSunday) {
                                inValue = inValue || "Sunday";
                                outValue = outValue || "Sunday";
                                missedValue = "00:00";
                            } else {
                                // count missed minutes as remaining expected minutes
                                const missed = Math.max(0, Math.round(EXPECTED_WORK_MINUTES - workedMinutes));
                                if (missed > 0) {
                                    missedValue = formatMinutes(missed);
                                    totals[idx].missedMinutes += missed;
                                }
                            }
                        } else {
                            // Both IN and OUT present: compute shortfall from expected
                            if (isSunday) {
                                // If recorded on Sunday, treat as Sunday label
                                if (!inValue) inValue = "Sunday";
                                if (!outValue) outValue = "Sunday";
                                missedValue = "00:00";
                            } else {
                                const missed = Math.max(0, Math.round(EXPECTED_WORK_MINUTES - workedMinutes));
                                if (missed > 0) {
                                    missedValue = formatMinutes(missed);
                                    totals[idx].missedMinutes += missed;
                                }
                            }
                        }
                    }
                } else {
                    // No record for the day
                    if (isSunday) {
                        inValue = "Sunday";
                        outValue = "Sunday";
                        missedValue = "00:00";
                    } else {
                        inValue = "Absent";
                        outValue = "Absent";
                        missedValue = "00:00"; // absent missed hours set to 0 per request
                        totals[idx].absent += 1;
                    }
                }

                row.push(inValue, outValue, missedValue);
            });

            rows.push(row);
        }

        rows.push([]);
        const totalPresentRow = ["Total Presents"];
        const totalAbsentRow = ["Total Absents"];
        const totalMissedRow = ["Total Hours Missed"];

        totals.forEach((item) => {
            totalPresentRow.push(item.present, "", "");
            totalAbsentRow.push(item.absent, "", "");
            totalMissedRow.push("", "", formatMinutes(item.missedMinutes));
        });

        rows.push(totalPresentRow);
        rows.push(totalAbsentRow);
        rows.push(totalMissedRow);

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }];

        for (let i = 0; i < employeesList.length; i++) {
            const startCol = 1 + i * 3;
            worksheet["!merges"].push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + 2 } });
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Attendance_${monthKey}`);
        XLSX.writeFile(workbook, `attendance_${monthKey}.xlsx`);
    } catch (error) {
        console.error("Error exporting attendance:", error);
        showToast("❌ Failed to download attendance. Check Firebase and try again.");
    }
}

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function formatMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// ========================================================
// CLOCK FUNCTIONALITY
// ========================================================
function updateClock() {
    const now = new Date();
    const ampm = now.getHours() >= 12 ? "PM" : "AM";
    const displayHours = now.getHours() % 12 || 12;
    const displayTime = `${String(displayHours).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${ampm}`;
    clockDisplay.textContent = displayTime;
}

// ========================================================
// FIRESTORE OPERATIONS
// ========================================================
async function loadEmployees() {
    try {
        const querySnapshot = await getDocs(collection(db, "employees"));
        employees = querySnapshot.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
        }));
        employees.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

        if (employees.length === 0) {
            employees = [
                { id: "rushil", name: "Rushil Goomer", jobTitle: "Developer" },
                { id: "jane", name: "Jane Doe", jobTitle: "Designer" },
            ];
        }
    } catch (error) {
        console.error("Error loading employees from Firebase:", error);
        showToast("❌ Firebase load failed. Please check your configuration.");
        employees = [
            { id: "rushil", name: "Rushil Goomer", jobTitle: "Developer" },
            { id: "jane", name: "Jane Doe", jobTitle: "Designer" },
        ];
    }

    renderEmployees();
}

async function showTimePicker(action) {
    if (!selectedEmployee) return;

    // Check today's attendance to avoid duplicate check-ins/outs
    try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const day = String(now.getDate());
        const attendanceDocId = `${selectedEmployee.id}_${month}`;
        const attendanceRef = doc(db, "attendanceCards", attendanceDocId);
        const attendanceSnap = await getDoc(attendanceRef);
        const storedAttendance = attendanceSnap.exists() ? attendanceSnap.data().attendance || {} : {};
        const dayRecord = storedAttendance[day] || null;

        // If user already checked IN and clicked IN, show in-UI edit prompt
        if (action === "IN" && dayRecord?.in) {
            editExistingTime = dayRecord.in;
            editExistingAction = "IN";
            editPromptText.textContent = `Already checked IN at ${dayRecord.in}. Do you want to edit check-in time?`;
            editPrompt.classList.remove("hidden");
            return;
        }

        // If user already checked OUT and clicked OUT, show in-UI edit prompt
        if (action === "OUT" && dayRecord?.out) {
            editExistingTime = dayRecord.out;
            editExistingAction = "OUT";
            editPromptText.textContent = `Already checked OUT at ${dayRecord.out}. Do you want to edit check-out time?`;
            editPrompt.classList.remove("hidden");
            return;
        }

        // Proceed to show picker (either new entry or editing)
        pendingClockAction = action;
        populateTimePicker();

        // If editing, default to existing recorded time when present in options
        if (action === "IN" && dayRecord?.in) {
            if (Array.from(timePicker.options).some((o) => o.value === dayRecord.in)) {
                timePicker.value = dayRecord.in;
            }
        }
        if (action === "OUT" && dayRecord?.out) {
            if (Array.from(timePicker.options).some((o) => o.value === dayRecord.out)) {
                timePicker.value = dayRecord.out;
            }
        }

        timePickerSection.classList.remove("hidden");

        // Grey out other buttons based on action
        if (action === "IN") {
            btnClockOut.classList.add("disabled-btn");
            btnAbsent.classList.add("disabled-btn");
            btnClockOut.disabled = true;
            btnAbsent.disabled = true;
        } else if (action === "OUT") {
            btnClockIn.classList.add("disabled-btn");
            btnAbsent.classList.add("disabled-btn");
            btnClockIn.disabled = true;
            btnAbsent.disabled = true;
        }
    } catch (err) {
        console.error("Error checking attendance for edit prompt:", err);
        // fallback: open picker as before
        pendingClockAction = action;
        populateTimePicker();
        timePickerSection.classList.remove("hidden");
    }
}

function handleEditYes() {
    // User chose to edit existing time — open picker and default to existing time
    editPrompt.classList.add("hidden");
    if (!editExistingAction) return;
    pendingClockAction = editExistingAction;
    populateTimePicker();
    if (editExistingTime && Array.from(timePicker.options).some((o) => o.value === editExistingTime)) {
        timePicker.value = editExistingTime;
    }
    timePickerSection.classList.remove("hidden");

    // Grey out other buttons
    if (pendingClockAction === "IN") {
        btnClockOut.classList.add("disabled-btn");
        btnAbsent.classList.add("disabled-btn");
        btnClockOut.disabled = true;
        btnAbsent.disabled = true;
    } else if (pendingClockAction === "OUT") {
        btnClockIn.classList.add("disabled-btn");
        btnAbsent.classList.add("disabled-btn");
        btnClockIn.disabled = true;
        btnAbsent.disabled = true;
    }

    // clear temporary store
    editExistingTime = null;
    editExistingAction = null;
}

function handleEditNo() {
    editPrompt.classList.add("hidden");
    editExistingTime = null;
    editExistingAction = null;
    pendingClockAction = null;
}

function populateTimePicker() {
    timePicker.innerHTML = "";
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Calculate floor (for IN) and ceiling (for OUT) times
    const flooredMinute = Math.floor(currentMinute / 15) * 15;
    const ceiledMinute = Math.ceil(currentMinute / 15) * 15;
    
    // Select the appropriate default based on action
    let defaultMinute = flooredMinute;
    let defaultHour = currentHour;
    
    if (pendingClockAction === "OUT") {
        defaultMinute = ceiledMinute;
        // Handle hour overflow if ceiling pushed minute to 60
        if (defaultMinute === 60) {
            defaultMinute = 0;
            defaultHour = currentHour + 1;
        }
    }
    
    const defaultTimeString = `${String(defaultHour).padStart(2, "0")}:${String(defaultMinute).padStart(2, "0")}`;

    // Generate times from 9 AM to 8 PM (09:00 to 20:00)
    for (let hour = 9; hour <= 20; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
            const option = document.createElement("option");
            option.value = timeStr;
            option.textContent = timeStr;
            if (timeStr === defaultTimeString) {
                option.selected = true;
            }
            timePicker.appendChild(option);
        }
    }
}

async function submitTimeSelection() {
    if (!pendingClockAction || !selectedEmployee || isProcessing) return;

    const selectedTime = timePicker.value;
    isProcessing = true;
    btnClockIn.disabled = true;
    btnClockOut.disabled = true;
    btnAbsent.disabled = true;
    loadingState.classList.remove("hidden");
    confirmationMessage.classList.add("hidden");
    timePickerSection.classList.add("hidden");

    try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const day = String(now.getDate());
        const timeString = selectedTime; // Use selected time instead of current time
        const attendanceDocId = `${selectedEmployee.id}_${month}`;
        const action = pendingClockAction;

        const attendanceRef = doc(db, "attendanceCards", attendanceDocId);
        const attendanceSnap = await getDoc(attendanceRef);
        const storedAttendance = attendanceSnap.exists() ? attendanceSnap.data().attendance || {} : {};
        const dayRecord = { ...(storedAttendance[day] || {}) };

        if (action === "OUT" && !dayRecord.in) {
            showToast("❌ Cannot clock OUT before IN. Please clock IN first.");
            isProcessing = false;
            btnClockIn.classList.remove("disabled-btn");
            btnClockOut.classList.remove("disabled-btn");
            btnAbsent.classList.remove("disabled-btn");
            btnClockIn.disabled = false;
            btnClockOut.disabled = false;
            btnAbsent.disabled = false;
            timePickerSection.classList.remove("hidden");
            pendingClockAction = null;
            return;
        }

        dayRecord.Status = "P";
        if (action === "IN") {
            dayRecord.in = timeString;
        } else {
            dayRecord.out = timeString;
            dayRecord.hours = computeHours(dayRecord.in, dayRecord.out);
        }

        storedAttendance[day] = dayRecord;

        await setDoc(
            attendanceRef,
            {
                employeeId: selectedEmployee.id,
                month,
                attendance: storedAttendance,
            },
            { merge: true }
        );

        const actionText = action === "IN" ? "Checked in" : "Checked out";
        confirmationText.textContent = `${selectedEmployee.name} - ${actionText} at ${timeString}`;
        confirmationMessage.classList.remove("hidden");
        loadingState.classList.add("hidden");

        setTimeout(() => {
            closeAttendanceModal();
            isProcessing = false;
        }, 3000);

        showToast(`✓ ${actionText} successfully`);
        pendingClockAction = null;
    } catch (error) {
        console.error("Error during clock action:", error);
        loadingState.classList.add("hidden");
        showToast("❌ Error: Could not record attendance. Check Firebase setup.");
        isProcessing = false;
        btnClockIn.classList.remove("disabled-btn");
        btnClockOut.classList.remove("disabled-btn");
        btnAbsent.classList.remove("disabled-btn");
        btnClockIn.disabled = false;
        btnClockOut.disabled = false;
        btnAbsent.disabled = false;
        timePickerSection.classList.remove("hidden");
        pendingClockAction = null;
    }
}

async function handleAddEmployee(event) {
    event.preventDefault();

    const employeeId = employeeIdInput.value.trim();
    const name = employeeId;
    const jobTitle = jobTitleInput.value.trim();

    if (!employeeId || !jobTitle) {
        showToast("❌ Please fill in all fields");
        return;
    }

    addEmployeeForm.style.display = "none";
    const spinner = document.createElement("div");
    spinner.className = "loading-state";
    spinner.innerHTML = '<div class="spinner-small"></div><p>Adding employee...</p>';
    addEmployeeForm.parentElement.appendChild(spinner);

    try {
        const employeeRef = doc(db, "employees", employeeId);
        const existing = await getDoc(employeeRef);
        if (existing.exists()) {
            spinner.remove();
            addEmployeeForm.style.display = "flex";
            showToast("❌ Employee ID already exists. Choose a unique ID.");
            return;
        }

        await setDoc(employeeRef, { name, jobTitle });
        employees.push({ id: employeeId, name, jobTitle });
        renderEmployees();

        addEmployeeMessageText.textContent = `${name} added successfully!`;
        addEmployeeMessage.classList.remove("hidden");
        spinner.remove();

        setTimeout(() => {
            closeAddEmployeeModal();
            showToast(`✓ Employee ${name} added`);
        }, 2000);
    } catch (error) {
        console.error("Error adding employee:", error);
        spinner.remove();
        addEmployeeForm.style.display = "flex";
        showToast("❌ Error: Could not add employee. Check Firebase setup.");
    }
}

async function deleteEmployee(employee) {
    if (!confirm(`Delete ${employee.name}? This action cannot be undone.`)) {
        return;
    }

    try {
        await deleteDoc(doc(db, "employees", employee.id));
        employees = employees.filter((current) => current.id !== employee.id);
        renderEmployees();
        showToast(`✓ Employee ${employee.name} deleted`);
    } catch (error) {
        console.error("Error deleting employee:", error);
        showToast("❌ Error: Could not delete employee. Check Firebase setup.");
    }
}

// ========================================================
// RENDER FUNCTIONS
// ========================================================
function renderEmployees() {
    employeesGrid.innerHTML = "";

    if (employees.length === 0) {
        employeesGrid.innerHTML = `
            <div class="loading-placeholder">
                <p>No employees found. Add one to get started.</p>
            </div>
        `;
        return;
    }

    employees.forEach((employee) => {
        const card = createEmployeeCard(employee);
        employeesGrid.appendChild(card);
    });
}

function createEmployeeCard(employee) {
    const card = document.createElement("div");
    card.className = "employee-card";

    card.innerHTML = `
        <div class="card-header">
            <div></div>
            <button class="card-delete-btn" data-employee-id="${escapeHtml(employee.id)}" title="Delete employee">
                🗑️
            </button>
        </div>
        <div class="card-clickable-area">
            <div class="card-info">
                <div class="employee-name">${escapeHtml(employee.name)} <span class="employee-id">(${escapeHtml(employee.id)})</span></div>
                <div class="employee-role">${escapeHtml(employee.jobTitle)}</div>
                <div class="card-badge">
                    <span>●</span> Available
                </div>
            </div>
            <div class="card-action-hint">Click to clock in/out</div>
        </div>
    `;

    card.addEventListener("click", (event) => {
        if (!event.target.closest(".card-delete-btn")) {
            openAttendanceModal(employee);
        }
    });

    const deleteBtn = card.querySelector(".card-delete-btn");
    deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteEmployee(employee);
    });

    return card;
}

// ========================================================
// MODAL FUNCTIONS
// ========================================================
function openAttendanceModal(employee) {
    selectedEmployee = employee;
    modalEmployeeName.textContent = employee.name;
    modalEmployeeRole.textContent = employee.jobTitle;
    confirmationMessage.classList.add("hidden");
    loadingState.classList.add("hidden");
    btnClockIn.disabled = false;
    btnClockOut.disabled = false;
    btnAbsent.disabled = false;
    attendanceModal.classList.remove("hidden");
}

function closeAttendanceModal() {
    attendanceModal.classList.add("hidden");
    selectedEmployee = null;
    confirmationMessage.classList.add("hidden");
    loadingState.classList.add("hidden");
    timePickerSection.classList.add("hidden");
    editPrompt.classList.add("hidden");
    // Remove greying and re-enable all buttons
    btnClockIn.classList.remove("disabled-btn");
    btnClockOut.classList.remove("disabled-btn");
    btnAbsent.classList.remove("disabled-btn");
    btnClockIn.disabled = false;
    btnClockOut.disabled = false;
    btnAbsent.disabled = false;
    pendingClockAction = null;
    editExistingTime = null;
    editExistingAction = null;
}

function openAddEmployeeModal() {
    employeeIdInput.value = "";
    jobTitleInput.value = "";
    addEmployeeMessage.classList.add("hidden");
    addEmployeeForm.style.display = "flex";
    addEmployeeModal.classList.remove("hidden");
}

function closeAddEmployeeModal() {
    addEmployeeModal.classList.add("hidden");
    employeeIdInput.value = "";
    jobTitleInput.value = "";
}

// ========================================================
// EVENT LISTENERS
// ========================================================
function setupEventListeners() {
    btnClockIn.addEventListener("click", () => showTimePicker("IN"));
    btnClockOut.addEventListener("click", () => showTimePicker("OUT"));
    btnAbsent.addEventListener("click", handleAbsentAction);
    modalClose.addEventListener("click", closeAttendanceModal);
    modalOverlay.addEventListener("click", closeAttendanceModal);
    btnTimeSubmit.addEventListener("click", submitTimeSelection);
    btnEditYes.addEventListener("click", handleEditYes);
    btnEditNo.addEventListener("click", handleEditNo);

    addEmployeeBtn.addEventListener("click", openAddEmployeeModal);
    addEmployeeClose.addEventListener("click", closeAddEmployeeModal);
    addEmployeeOverlay.addEventListener("click", closeAddEmployeeModal);
    cancelAddEmployee.addEventListener("click", closeAddEmployeeModal);
    addEmployeeForm.addEventListener("submit", handleAddEmployee);
    downloadAttendanceBtn.addEventListener("click", downloadAttendanceForMonth);

    document.querySelectorAll(".modal-content").forEach((content) => {
        content.addEventListener("click", (event) => event.stopPropagation());
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAttendanceModal();
            closeAddEmployeeModal();
        }
    });
}

// ========================================================
// UTILITY FUNCTIONS
// ========================================================
function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTimestamp(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
}

function computeHours(inTime, outTime) {
    const [inHour, inMinute] = inTime.split(":").map(Number);
    const [outHour, outMinute] = outTime.split(":").map(Number);
    const inDate = new Date();
    inDate.setHours(inHour, inMinute, 0, 0);
    const outDate = new Date();
    outDate.setHours(outHour, outMinute, 0, 0);

    // compute precise difference in hours (floating) without coarse rounding
    let diffHours = (outDate - inDate) / (1000 * 60 * 60);
    if (diffHours < 0) diffHours += 24;
    return diffHours;
}

async function handleAbsentAction() {
    if (!selectedEmployee || isProcessing) return;

    isProcessing = true;
    pendingClockAction = "ABSENT";
    // Grey out IN and OUT buttons
    btnClockIn.classList.add("disabled-btn");
    btnClockOut.classList.add("disabled-btn");
    btnClockIn.disabled = true;
    btnClockOut.disabled = true;
    loadingState.classList.remove("hidden");
    confirmationMessage.classList.add("hidden");

    try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const day = String(now.getDate());
        const attendanceDocId = `${selectedEmployee.id}_${month}`;

        const attendanceRef = doc(db, "attendanceCards", attendanceDocId);
        const attendanceSnap = await getDoc(attendanceRef);
        const storedAttendance = attendanceSnap.exists() ? attendanceSnap.data().attendance || {} : {};

        storedAttendance[day] = { Status: "A" };

        await setDoc(
            attendanceRef,
            {
                employeeId: selectedEmployee.id,
                month,
                attendance: storedAttendance,
            },
            { merge: true }
        );

        confirmationText.textContent = `${selectedEmployee.name} - Marked absent for today`;
        confirmationMessage.classList.remove("hidden");
        loadingState.classList.add("hidden");

        setTimeout(() => {
            closeAttendanceModal();
            isProcessing = false;
        }, 3000);

        showToast("✓ Absent recorded successfully");
    } catch (error) {
        console.error("Error marking absent:", error);
        loadingState.classList.add("hidden");
        showToast("❌ Error: Could not mark absent. Check Firebase setup.");
        isProcessing = false;
        btnClockIn.classList.remove("disabled-btn");
        btnClockOut.classList.remove("disabled-btn");
        btnClockIn.disabled = false;
        btnClockOut.disabled = false;
        btnAbsent.disabled = false;
        pendingClockAction = null;
    }
}

function showToast(message) {
    toastMessage.textContent = message;
    toastNotification.classList.remove("hidden");

    setTimeout(() => {
        toastNotification.classList.add("hidden");
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
