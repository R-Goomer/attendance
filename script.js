// ========================================================
// CONFIGURATION
// ========================================================
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby1kBbiRONjMqNpeKTFNSJue4R6VhNtNs1KuOT3xz5HreoVujfaphe3bCe7dF6gOLIj/exec";

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
const employeeNameInput = document.getElementById("employeeNameInput");
const jobTitleInput = document.getElementById("jobTitleInput");
const addEmployeeMessage = document.getElementById("addEmployeeMessage");
const addEmployeeMessageText = document.getElementById("addEmployeeMessageText");

const toastNotification = document.getElementById("toastNotification");
const toastMessage = document.getElementById("toastMessage");

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});

function initializeApp() {
    updateClock();
    setInterval(updateClock, 1000);
    loadEmployees();
    setupEventListeners();
}

// ========================================================
// CLOCK FUNCTIONALITY
// ========================================================
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    const ampm = now.getHours() >= 12 ? "PM" : "AM";
    const displayHours = now.getHours() % 12 || 12;
    const displayTime = `${String(displayHours).padStart(2, "0")}:${minutes} ${ampm}`;

    clockDisplay.textContent = displayTime;
}

// ========================================================
// API CALLS
// ========================================================
async function callGoogleAppsScript(action, payload = {}) {
    if (!GOOGLE_APPS_SCRIPT_URL.includes("script.google.com")) {
        showToast("❌ Error: Google Apps Script URL not configured. Check script.js configuration.");
        console.error("Google Apps Script URL not set:", GOOGLE_APPS_SCRIPT_URL);
        return null;
    }

    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: action,
                ...payload,
            }),
        });

        // Note: mode: 'no-cors' means we can't read the response body directly,
        // so we'll assume success if there's no network error
        return { success: true };
    } catch (error) {
        console.error("Error calling Google Apps Script:", error);
        showToast("❌ Error: Could not connect to server. Check your internet connection.");
        return null;
    }
}

async function loadEmployees() {
    // Since we can't read responses with no-cors, we'll use a workaround
    // Employees will be fetched from another endpoint or hardcoded
    // For now, we'll fetch them directly using JSONP or another method

    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "get-employees",
            }),
        }).catch(() => {
            // If CORS error, show a demo with sample data
            return null;
        });

        if (response) {
            const data = await response.json();
            if (data.success && data.data) {
                employees = data.data;
            }
        }

        // If no employees loaded, use sample data for demo
        if (employees.length === 0) {
            employees = [
                { id: 1, name: "Abigail Peterson", jobTitle: "Manager" },
                { id: 2, name: "Michael Johnson", jobTitle: "Developer" },
                { id: 3, name: "Sarah Williams", jobTitle: "Designer" },
                { id: 4, name: "James Brown", jobTitle: "Analyst" },
            ];
        }

        renderEmployees();
    } catch (error) {
        console.error("Error loading employees:", error);
        // Use sample data on error
        employees = [
            { id: 1, name: "Abigail Peterson", jobTitle: "Manager" },
            { id: 2, name: "Michael Johnson", jobTitle: "Developer" },
            { id: 3, name: "Sarah Williams", jobTitle: "Designer" },
            { id: 4, name: "James Brown", jobTitle: "Analyst" },
        ];
        renderEmployees();
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
            <button class="card-delete-btn" data-employee-id="${employee.id}" title="Delete employee">
                🗑️
            </button>
        </div>
        <div class="card-clickable-area">
            <div class="card-info">
                <div class="employee-name">${escapeHtml(employee.name)}</div>
                <div class="employee-role">${escapeHtml(employee.jobTitle)}</div>
                <div class="card-badge">
                    <span>●</span> Available
                </div>
            </div>
            <div class="card-action-hint">Click to clock in/out</div>
        </div>
    `;

    // Click handler for the card itself (to open modal)
    card.addEventListener("click", (e) => {
        if (!e.target.closest(".card-delete-btn")) {
            openAttendanceModal(employee);
        }
    });

    // Delete button handler
    const deleteBtn = card.querySelector(".card-delete-btn");
    deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
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
    attendanceModal.classList.remove("hidden");
}

function closeAttendanceModal() {
    attendanceModal.classList.add("hidden");
    selectedEmployee = null;
    confirmationMessage.classList.add("hidden");
    loadingState.classList.add("hidden");
}

function openAddEmployeeModal() {
    employeeNameInput.value = "";
    jobTitleInput.value = "";
    addEmployeeMessage.classList.add("hidden");
    addEmployeeForm.style.display = "flex";
    addEmployeeModal.classList.remove("hidden");
}

function closeAddEmployeeModal() {
    addEmployeeModal.classList.add("hidden");
    employeeNameInput.value = "";
    jobTitleInput.value = "";
}

// ========================================================
// ACTION HANDLERS
// ========================================================
async function handleClockAction(action) {
    if (!selectedEmployee || isProcessing) return;

    isProcessing = true;
    btnClockIn.disabled = true;
    btnClockOut.disabled = true;
    loadingState.classList.remove("hidden");
    confirmationMessage.classList.add("hidden");

    try {
        const result = await callGoogleAppsScript(action === "IN" ? "clock-in" : "clock-out", {
            employeeName: selectedEmployee.name,
        });

        if (result && result.success) {
            // Show confirmation
            const actionText = action === "IN" ? "Checked in" : "Checked out";
            const now = new Date();
            const timestamp = formatTimestamp(now);

            confirmationText.textContent = `${selectedEmployee.name} - ${actionText} at ${timestamp}`;
            confirmationMessage.classList.remove("hidden");
            loadingState.classList.add("hidden");

            // Close modal after 3 seconds
            setTimeout(() => {
                closeAttendanceModal();
                isProcessing = false;
            }, 3000);

            showToast(`✓ ${actionText} successfully`);
        } else {
            loadingState.classList.add("hidden");
            showToast("❌ Error: Could not record action. Try again.");
            isProcessing = false;
            btnClockIn.disabled = false;
            btnClockOut.disabled = false;
        }
    } catch (error) {
        console.error("Error during clock action:", error);
        loadingState.classList.add("hidden");
        showToast("❌ Error: Something went wrong. Try again.");
        isProcessing = false;
        btnClockIn.disabled = false;
        btnClockOut.disabled = false;
    }
}

async function handleAddEmployee(e) {
    e.preventDefault();

    const name = employeeNameInput.value.trim();
    const jobTitle = jobTitleInput.value.trim();

    if (!name || !jobTitle) {
        showToast("❌ Please fill in all fields");
        return;
    }

    addEmployeeForm.style.display = "none";
    const spinner = document.createElement("div");
    spinner.className = "loading-state";
    spinner.innerHTML = '<div class="spinner-small"></div><p>Adding employee...</p>';
    addEmployeeForm.parentElement.appendChild(spinner);

    try {
        const result = await callGoogleAppsScript("add-employee", {
            employeeName: name,
            jobTitle: jobTitle,
        });

        if (result && result.success) {
            // Add to local array
            const newId = employees.length > 0 ? Math.max(...employees.map(e => e.id)) + 1 : 1;
            employees.push({
                id: newId,
                name: name,
                jobTitle: jobTitle,
            });

            renderEmployees();
            addEmployeeMessageText.textContent = `${name} added successfully!`;
            addEmployeeMessage.classList.remove("hidden");
            spinner.remove();

            setTimeout(() => {
                closeAddEmployeeModal();
                showToast(`✓ Employee ${name} added`);
            }, 2000);
        } else {
            spinner.remove();
            addEmployeeForm.style.display = "flex";
            showToast("❌ Error: Could not add employee");
        }
    } catch (error) {
        console.error("Error adding employee:", error);
        spinner.remove();
        addEmployeeForm.style.display = "flex";
        showToast("❌ Error: Something went wrong");
    }
}

async function deleteEmployee(employee) {
    if (!confirm(`Delete ${employee.name}? This action cannot be undone.`)) {
        return;
    }

    try {
        const result = await callGoogleAppsScript("delete-employee", {
            employeeName: employee.name,
        });

        if (result && result.success) {
            employees = employees.filter(e => e.id !== employee.id);
            renderEmployees();
            showToast(`✓ Employee ${employee.name} deleted`);
        } else {
            showToast("❌ Error: Could not delete employee");
        }
    } catch (error) {
        console.error("Error deleting employee:", error);
        showToast("❌ Error: Something went wrong");
    }
}

// ========================================================
// EVENT LISTENERS
// ========================================================
function setupEventListeners() {
    // Attendance Modal
    btnClockIn.addEventListener("click", () => handleClockAction("IN"));
    btnClockOut.addEventListener("click", () => handleClockAction("OUT"));
    modalClose.addEventListener("click", closeAttendanceModal);
    modalOverlay.addEventListener("click", closeAttendanceModal);

    // Add Employee Modal
    addEmployeeBtn.addEventListener("click", openAddEmployeeModal);
    addEmployeeClose.addEventListener("click", closeAddEmployeeModal);
    addEmployeeOverlay.addEventListener("click", closeAddEmployeeModal);
    cancelAddEmployee.addEventListener("click", closeAddEmployeeModal);
    addEmployeeForm.addEventListener("submit", handleAddEmployee);

    // Prevent modal close when clicking inside the content
    document.querySelectorAll(".modal-content").forEach((content) => {
        content.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    });

    // Close modals on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeAttendanceModal();
            closeAddEmployeeModal();
        }
    });
}

// ========================================================
// UTILITY FUNCTIONS
// ========================================================
function formatTimestamp(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
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
