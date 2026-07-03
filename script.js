import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
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
const addEmployeeMessage = document.getElementById("addEmployeeMessage");
const addEmployeeMessageText = document.getElementById("addEmployeeMessageText");

const toastNotification = document.getElementById("toastNotification");
const toastMessage = document.getElementById("toastMessage");

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
    setupApp();
});

function setupApp() {
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
                { id: "rushil", name: "Rushil Kumar", jobTitle: "Developer" },
                { id: "jane", name: "Jane Doe", jobTitle: "Designer" },
            ];
        }
    } catch (error) {
        console.error("Error loading employees from Firebase:", error);
        showToast("❌ Firebase load failed. Please check your configuration.");
        employees = [
            { id: "rushil", name: "Rushil Kumar", jobTitle: "Developer" },
            { id: "jane", name: "Jane Doe", jobTitle: "Designer" },
        ];
    }

    renderEmployees();
}

async function handleClockAction(action) {
    if (!selectedEmployee || isProcessing) return;

    isProcessing = true;
    btnClockIn.disabled = true;
    btnClockOut.disabled = true;
    btnAbsent.disabled = true;
    loadingState.classList.remove("hidden");
    confirmationMessage.classList.add("hidden");

    try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const day = String(now.getDate());
        const timeString = formatTime(now);
        const attendanceDocId = `${selectedEmployee.id}_${month}`;

        const attendanceRef = doc(db, "attendanceCards", attendanceDocId);
        const attendanceSnap = await getDoc(attendanceRef);
        const storedAttendance = attendanceSnap.exists() ? attendanceSnap.data().attendance || {} : {};
        const dayRecord = { ...(storedAttendance[day] || {}) };

        if (action === "OUT" && !dayRecord.in) {
            showToast("❌ Cannot clock OUT before IN. Please clock IN first.");
            isProcessing = false;
            btnClockIn.disabled = false;
            btnClockOut.disabled = false;
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
        confirmationText.textContent = `${selectedEmployee.name} - ${actionText} at ${formatTimestamp(now)}`;
        confirmationMessage.classList.remove("hidden");
        loadingState.classList.add("hidden");

        setTimeout(() => {
            closeAttendanceModal();
            isProcessing = false;
        }, 3000);

        showToast(`✓ ${actionText} successfully`);
    } catch (error) {
        console.error("Error during clock action:", error);
        loadingState.classList.add("hidden");
        showToast("❌ Error: Could not record attendance. Check Firebase setup.");
        isProcessing = false;
        btnClockIn.disabled = false;
        btnClockOut.disabled = false;
        btnAbsent.disabled = false;
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
    btnClockIn.disabled = false;
    btnClockOut.disabled = false;
    btnAbsent.disabled = false;
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
    btnClockIn.addEventListener("click", () => handleClockAction("IN"));
    btnClockOut.addEventListener("click", () => handleClockAction("OUT"));
    btnAbsent.addEventListener("click", handleAbsentAction);
    modalClose.addEventListener("click", closeAttendanceModal);
    modalOverlay.addEventListener("click", closeAttendanceModal);

    addEmployeeBtn.addEventListener("click", openAddEmployeeModal);
    addEmployeeClose.addEventListener("click", closeAddEmployeeModal);
    addEmployeeOverlay.addEventListener("click", closeAddEmployeeModal);
    cancelAddEmployee.addEventListener("click", closeAddEmployeeModal);
    addEmployeeForm.addEventListener("submit", handleAddEmployee);

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

    let diff = (outDate - inDate) / (1000 * 60 * 60);
    if (diff < 0) diff += 24;
    return Math.round(diff * 10) / 10;
}

async function handleAbsentAction() {
    if (!selectedEmployee || isProcessing) return;

    isProcessing = true;
    btnClockIn.disabled = true;
    btnClockOut.disabled = true;
    btnAbsent.disabled = true;
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
        btnClockIn.disabled = false;
        btnClockOut.disabled = false;
        btnAbsent.disabled = false;
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
