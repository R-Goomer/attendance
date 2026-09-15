import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    deleteField,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    deleteUser,
    reauthenticateWithCredential,
    EmailAuthProvider,
    sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
    initializeAppCheck,
    ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app-check.js";

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

// ========================================================
// EMAILJS CONFIGURATION
// Replace these with your actual EmailJS credentials
// Get them from: https://www.emailjs.com → Account → API Keys
// ========================================================
const EMAILJS_SERVICE_ID = "service_kg2ddvv";   // e.g. "service_abc123"
const EMAILJS_TEMPLATE_ID = "template_6lsrzk6";  // e.g. "template_xyz789"
const EMAILJS_PUBLIC_KEY = "71UcJjRQiT9Ln2a76";   // e.g. "user_ABCDE12345"

// ========================================================
// RECAPTCHA / APP CHECK CONFIGURATION
// Replace with your reCAPTCHA v3 Site Key from:
// https://www.google.com/recaptcha/admin
// ========================================================
const RECAPTCHA_SITE_KEY = "6Lea_0UtAAAAAGB0kZV8n770Zh7xyKkoPAOTJQs4";

const firebaseApp = initializeApp(firebaseConfig);

// Initialize App Check with reCAPTCHA v3
// Remove the self.FIREBASE_APPCHECK_DEBUG_TOKEN line before going to production
if (typeof RECAPTCHA_SITE_KEY === "string" && !RECAPTCHA_SITE_KEY.startsWith("YOUR_")) {
    // self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // Uncomment locally if needed
    initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
    });
} else {
    console.warn("⚠️ App Check not initialized: Set your RECAPTCHA_SITE_KEY in script.js");
}

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

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
let currentUser = null;       // Firebase Auth user
let companyData = null;       // { companyName, logoUrl, email, ... }

// OTP State
let pendingOtpCode = null;          // The generated OTP
let pendingOtpEmail = null;         // The email waiting for OTP
let pendingOtpPassword = null;      // The password for re-sign-in after OTP
let pendingOtpIsSignup = false;     // Was this a sign-up flow?
let otpExpiresAt = null;            // Timestamp when OTP expires
let otpTimerInterval = null;        // setInterval handle
let otpResendTimeout = null;        // setTimeout for resend enable
let otpVerified = false;            // True after OTP is confirmed, prevents re-trigger on re-sign-in

// ========================================================
// DOM ELEMENTS — AUTH
// ========================================================
const authScreen = document.getElementById("authScreen");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const authLoading = document.getElementById("authLoading");
const authError = document.getElementById("authError");
const authErrorText = document.getElementById("authErrorText");

// Email/Password auth elements
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const emailAuthForm = document.getElementById("emailAuthForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const emailAuthBtnText = document.getElementById("emailAuthBtnText");
const togglePassword = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");
let emailAuthMode = "login"; // 'login' | 'signup'

// OTP Screen elements
const otpScreen = document.getElementById("otpScreen");
const otpSubtitle = document.getElementById("otpSubtitle");
const otpInputs = document.getElementById("otpInputs");
const otpDigits = Array.from({ length: 6 }, (_, i) => document.getElementById(`otp${i}`));
const otpTimer = document.getElementById("otpTimer");
const otpVerifyBtn = document.getElementById("otpVerifyBtn");
const otpVerifyBtnText = document.getElementById("otpVerifyBtnText");
const otpResendBtn = document.getElementById("otpResendBtn");
const otpError = document.getElementById("otpError");
const otpErrorText = document.getElementById("otpErrorText");
const otpLoading = document.getElementById("otpLoading");
const otpBackBtn = document.getElementById("otpBackBtn");

const companySetupScreen = document.getElementById("companySetupScreen");
const companySetupForm = document.getElementById("companySetupForm");
const companyNameInput = document.getElementById("companyNameInput");
const companyLogoInput = document.getElementById("companyLogoInput");
const logoPreviewContainer = document.getElementById("logoPreviewContainer");
const logoPreview = document.getElementById("logoPreview");
const setupLoading = document.getElementById("setupLoading");

const appContainer = document.getElementById("appContainer");
const companyLogoDisplay = document.getElementById("companyLogoDisplay");
const companyNameDisplay = document.getElementById("companyNameDisplay");
const signOutBtn = document.getElementById("signOutBtn");

// ========================================================
// DOM ELEMENTS — APP
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
const timePickerSection = document.getElementById("timePickerSection");
const timePicker = document.getElementById("timePicker");
const btnTimeSubmit = document.getElementById("btnTimeSubmit");
const editPrompt = document.getElementById("editPrompt");
const editPromptText = document.getElementById("editPromptText");
const btnEditYes = document.getElementById("btnEditYes");
const btnEditNo = document.getElementById("btnEditNo");

const absentWarningPrompt = document.getElementById("absentWarningPrompt");
const absentWarningText = document.getElementById("absentWarningText");
const btnAbsentWarningYes = document.getElementById("btnAbsentWarningYes");
const btnAbsentWarningNo = document.getElementById("btnAbsentWarningNo");

const toastNotification = document.getElementById("toastNotification");
const toastMessage = document.getElementById("toastMessage");

// Attendance date picker & note elements
const attendanceDatePicker = document.getElementById("attendanceDatePicker");
const editNoteSection = document.getElementById("editNoteSection");
const editNoteInput = document.getElementById("editNoteInput");
const editNoteHint = document.getElementById("editNoteHint");

// Delete Account Modal elements
const deleteAccountModal = document.getElementById("deleteAccountModal");
const deleteAccountOverlay = document.getElementById("deleteAccountOverlay");
const confirmDeleteAccountBtn = document.getElementById("confirmDeleteAccount");
const cancelDeleteAccountBtn = document.getElementById("cancelDeleteAccount");
const deleteAccountPassword = document.getElementById("deleteAccountPassword");
const deleteReauthSection = document.getElementById("deleteReauthSection");
const deleteAccountError = document.getElementById("deleteAccountError");
const deleteAccountErrorText = document.getElementById("deleteAccountErrorText");
const deleteAccountLoading = document.getElementById("deleteAccountLoading");

// Master Mode Elements & State
const MASTER_PASSWORD = "qwertyuiop";
let isMasterUnlocked = false;

const masterBtn = document.getElementById("masterBtn");
const masterAuthModal = document.getElementById("masterAuthModal");
const masterAuthOverlay = document.getElementById("masterAuthOverlay");
const masterAuthClose = document.getElementById("masterAuthClose");
const cancelMasterAuth = document.getElementById("cancelMasterAuth");
const masterAuthForm = document.getElementById("masterAuthForm");
const masterPasswordInput = document.getElementById("masterPasswordInput");
const toggleMasterPassword = document.getElementById("toggleMasterPassword");
const masterEyeIcon = document.getElementById("masterEyeIcon");
const masterAuthError = document.getElementById("masterAuthError");
const masterAuthErrorText = document.getElementById("masterAuthErrorText");

const masterSettingsModal = document.getElementById("masterSettingsModal");
const masterSettingsOverlay = document.getElementById("masterSettingsOverlay");
const masterSettingsClose = document.getElementById("masterSettingsClose");
const lockMasterBtn = document.getElementById("lockMasterBtn");

// Master Navigation Tabs & Sections
const tabMasterSalary = document.getElementById("tabMasterSalary");
const tabMasterEmployees = document.getElementById("tabMasterEmployees");
const tabMasterDownload = document.getElementById("tabMasterDownload");
const masterSectionSalary = document.getElementById("masterSectionSalary");
const masterSectionEmployees = document.getElementById("masterSectionEmployees");
const masterSectionDownload = document.getElementById("masterSectionDownload");

// Master Salary & Payroll Controls
const masterSalaryYear = document.getElementById("masterSalaryYear");
const masterSalaryMonth = document.getElementById("masterSalaryMonth");
const masterRefreshSalaryBtn = document.getElementById("masterRefreshSalaryBtn");
const masterDownloadAllSlipsBtn = document.getElementById("masterDownloadAllSlipsBtn");
const masterPrintAllSlipsBtn = document.getElementById("masterPrintAllSlipsBtn");
const statTotalBaseSalary = document.getElementById("statTotalBaseSalary");
const statTotalAttendanceCuts = document.getElementById("statTotalAttendanceCuts");
const statTotalLoanAdvDeductions = document.getElementById("statTotalLoanAdvDeductions");
const statTotalNetPayout = document.getElementById("statTotalNetPayout");
const masterSalaryTableBody = document.getElementById("masterSalaryTableBody");

// Master Employees & Download Controls
const masterEmployeeSearch = document.getElementById("masterEmployeeSearch");
const masterEmployeesTableBody = document.getElementById("masterEmployeesTableBody");
const masterDownloadYear = document.getElementById("masterDownloadYear");
const masterDownloadMonth = document.getElementById("masterDownloadMonth");
const masterDownloadActionBtn = document.getElementById("masterDownloadActionBtn");

// Edit Base Salary & Deduction Rules Modal Elements
const editSalaryModal = document.getElementById("editSalaryModal");
const editSalaryOverlay = document.getElementById("editSalaryOverlay");
const editSalaryClose = document.getElementById("editSalaryClose");
const cancelEditSalary = document.getElementById("cancelEditSalary");
const editSalaryForm = document.getElementById("editSalaryForm");
const editSalaryEmpName = document.getElementById("editSalaryEmpName");
const editSalaryEmpId = document.getElementById("editSalaryEmpId");
const editSalaryEmpIdHidden = document.getElementById("editSalaryEmpIdHidden");
const baseSalaryInput = document.getElementById("baseSalaryInput");
const hoursDivisorInput = document.getElementById("hoursDivisorInput");
const penaltyMultiplierInput = document.getElementById("penaltyMultiplierInput");

// Loan & Advance Modal Elements
const loanAdvanceModal = document.getElementById("loanAdvanceModal");
const loanAdvanceOverlay = document.getElementById("loanAdvanceOverlay");
const loanAdvanceClose = document.getElementById("loanAdvanceClose");
const loanEmpName = document.getElementById("loanEmpName");
const loanEmpId = document.getElementById("loanEmpId");
const loanStatTotalLoans = document.getElementById("loanStatTotalLoans");
const loanStatTotalRepaid = document.getElementById("loanStatTotalRepaid");
const loanStatRemainingLoan = document.getElementById("loanStatRemainingLoan");
const loanStatActiveAdvance = document.getElementById("loanStatActiveAdvance");
const addFinancialForm = document.getElementById("addFinancialForm");
const financialEmpIdHidden = document.getElementById("financialEmpIdHidden");
const financialType = document.getElementById("financialType");
const financialAmount = document.getElementById("financialAmount");
const financialDate = document.getElementById("financialDate");
const financialNote = document.getElementById("financialNote");
const loanDeductionMonthLabel = document.getElementById("loanDeductionMonthLabel");
const monthLoanDeductionInput = document.getElementById("monthLoanDeductionInput");
const saveMonthlyDeductionBtn = document.getElementById("saveMonthlyDeductionBtn");
const financialHistoryTableBody = document.getElementById("financialHistoryTableBody");

// Salary Slip Modal Elements
const salarySlipModal = document.getElementById("salarySlipModal");
const salarySlipOverlay = document.getElementById("salarySlipOverlay");
const salarySlipClose = document.getElementById("salarySlipClose");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const printSlipBtn = document.getElementById("printSlipBtn");
const salarySlipPrintArea = document.getElementById("salarySlipPrintArea");
const slipModalTitle = document.getElementById("slipModalTitle");

let pendingClockAction = null; // Track which action (IN/OUT) is pending time selection
let editExistingTime = null;
let editExistingAction = null;
let selectedAttendanceDate = null; // The date string YYYY-MM-DD currently selected in the modal

// ========================================================
// HELPER — Firestore paths scoped to current user
// ========================================================
function companyDocRef() {
    return doc(db, "companies", currentUser.uid);
}

function employeesCollectionRef() {
    return collection(db, "companies", currentUser.uid, "employees");
}

function employeeDocRef(employeeId) {
    return doc(db, "companies", currentUser.uid, "employees", employeeId);
}

function attendanceCardsCollectionRef() {
    return collection(db, "companies", currentUser.uid, "attendanceCards");
}

function attendanceCardDocRef(cardId) {
    return doc(db, "companies", currentUser.uid, "attendanceCards", cardId);
}

// ========================================================
// AUTH FLOW
// ========================================================
function setupAuthListeners() {
    // Google Sign In button
    googleSignInBtn.addEventListener("click", handleGoogleSignIn);

    // Email/Password tabs
    tabLogin.addEventListener("click", () => switchAuthTab("login"));
    tabSignup.addEventListener("click", () => switchAuthTab("signup"));

    // Email/Password form submit
    emailAuthForm.addEventListener("submit", handleEmailAuth);

    // Password visibility toggle
    togglePassword.addEventListener("click", () => {
        const isHidden = passwordInput.type === "password";
        passwordInput.type = isHidden ? "text" : "password";
        eyeIcon.innerHTML = isHidden
            ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
            : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    });

    // Company setup form
    companySetupForm.addEventListener("submit", handleCompanySetup);

    // Logo URL preview
    companyLogoInput.addEventListener("input", handleLogoPreview);

    // Sign out
    signOutBtn.addEventListener("click", handleSignOut);

    // OTP screen listeners
    otpVerifyBtn.addEventListener("click", handleOtpVerify);
    otpResendBtn.addEventListener("click", handleOtpResend);
    otpBackBtn.addEventListener("click", () => {
        clearInterval(otpTimerInterval);
        clearTimeout(otpResendTimeout);
        pendingOtpEmail = null;
        pendingOtpCode = null;
        pendingOtpPassword = null;
        showAuthScreen();
    });
    setupOtpDigitNavigation();

    // Delete Account listeners
    cancelDeleteAccountBtn.addEventListener("click", () => hideDeleteAccountModal());
    deleteAccountOverlay.addEventListener("click", () => hideDeleteAccountModal());
    confirmDeleteAccountBtn.addEventListener("click", handleDeleteAccount);

    // Forgot password
    document.getElementById("forgotPasswordBtn").addEventListener("click", handleForgotPassword);

    // Listen for auth state changes
    onAuthStateChanged(auth, handleAuthStateChanged);
}

function switchAuthTab(mode) {
    emailAuthMode = mode;
    tabLogin.classList.toggle("active", mode === "login");
    tabSignup.classList.toggle("active", mode === "signup");
    emailAuthBtnText.textContent = mode === "login" ? "Login" : "Create Account";
    passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";
    // Show forgot password link only in login mode
    const forgotBtn = document.getElementById("forgotPasswordBtn");
    if (forgotBtn) forgotBtn.style.display = mode === "login" ? "block" : "none";
    // Clear fields & errors when switching
    emailInput.value = "";
    passwordInput.value = "";
    authError.classList.add("hidden");
}

async function handleEmailAuth(event) {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        authErrorText.textContent = "Please enter your email and password.";
        authError.classList.remove("hidden");
        return;
    }

    // ── Gmail-only restriction ──────────────────────────────
    if (!email.toLowerCase().endsWith("@gmail.com")) {
        authErrorText.textContent = "Only @gmail.com addresses are allowed to sign up or log in.";
        authError.classList.remove("hidden");
        return;
    }
    // ───────────────────────────────────────────────────────

    // Show loading
    emailAuthForm.style.display = "none";
    googleSignInBtn.style.display = "none";
    authLoading.classList.remove("hidden");
    authError.classList.add("hidden");

    try {
        // Cache password so OTP flow can re-sign-in after verification
        pendingOtpPassword = password;

        if (emailAuthMode === "login") {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
        // onAuthStateChanged intercepts and triggers OTP flow (see handleAuthStateChanged)
    } catch (error) {
        console.error("Email auth error:", error);
        emailAuthForm.style.display = "flex";
        googleSignInBtn.style.display = "flex";
        authLoading.classList.add("hidden");

        const errorMessages = {
            "auth/user-not-found": "No account found with this email.",
            "auth/wrong-password": "Incorrect password. Please try again.",
            "auth/invalid-credential": "Invalid email or password. Please try again.",
            "auth/email-already-in-use": "An account with this email already exists.",
            "auth/weak-password": "Password should be at least 6 characters.",
            "auth/invalid-email": "Please enter a valid email address.",
            "auth/too-many-requests": "Too many failed attempts. Please try again later.",
        };

        authErrorText.textContent = errorMessages[error.code] || "Authentication failed. Please try again.";
        authError.classList.remove("hidden");
    }
}

async function handleGoogleSignIn() {
    googleSignInBtn.style.display = "none";
    authLoading.classList.remove("hidden");
    authError.classList.add("hidden");

    try {
        await signInWithPopup(auth, googleProvider);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        console.error("Google Sign-In error:", error);
        googleSignInBtn.style.display = "flex";
        authLoading.classList.add("hidden");

        let errorMsg = "Sign-in failed. Please try again.";
        if (error.code === "auth/popup-closed-by-user") {
            errorMsg = "Sign-in popup was closed. Please try again.";
        } else if (error.code === "auth/unauthorized-domain") {
            errorMsg = "This domain is not authorized. Please add it to Firebase Console.";
        }

        authErrorText.textContent = errorMsg;
        authError.classList.remove("hidden");
    }
}

async function handleAuthStateChanged(user) {
    if (user) {
        const isGoogleUser = user.providerData.some(p => p.providerId === "google.com");
        const isNewSignup = !isGoogleUser && emailAuthMode === "signup" && !otpVerified;

        if (isNewSignup) {
            // Write a Firestore flag BEFORE signing out — while user is still authenticated
            // This prevents login bypass: even if user goes to login tab, the flag blocks them
            try {
                await setDoc(doc(db, "companies", user.uid),
                    { needsOtpVerification: true }, { merge: true });
            } catch (e) {
                console.warn("Could not write OTP verification flag:", e);
            }
            pendingOtpEmail = user.email;
            await signOut(auth); // triggers this handler again (user=null), guarded by pendingOtpEmail
            await startOtpFlow(pendingOtpEmail);
            return;
        }

        // For email/password logins, enforce that OTP was completed during signup
        if (!isGoogleUser && !otpVerified) {
            try {
                const verifySnap = await getDoc(doc(db, "companies", user.uid));
                if (verifySnap.exists() && verifySnap.data().needsOtpVerification === true) {
                    // Account exists but OTP was never completed — block access
                    await signOut(auth);
                    showAuthScreen();
                    authErrorText.textContent = "⚠️ This account has not completed email verification. Please sign up again.";
                    authError.classList.remove("hidden");
                    return;
                }
            } catch (e) {
                // No doc yet = brand new verified user, proceed normally
            }
        }

        // OTP was just verified — clear the Firestore flag
        if (otpVerified) {
            try {
                await setDoc(doc(db, "companies", user.uid),
                    { needsOtpVerification: false }, { merge: true });
            } catch (e) { /* non-critical */ }
        }

        // Reset for the next signup session
        otpVerified = false;

        currentUser = user;
        // Check if company profile exists (check companyName field to distinguish from bare flag doc)
        try {
            const companyDoc = await getDoc(companyDocRef());
            if (companyDoc.exists() && companyDoc.data().companyName) {
                // Returning user — load company data and go to app
                companyData = companyDoc.data();
                showApp();
            } else {
                // First time or only flag doc present — show company setup
                showCompanySetup();
            }
        } catch (error) {
            console.error("Error checking company profile:", error);
            showToast("❌ Error loading profile. Please try again.");
            showAuthScreen();
        }
    } else {
        // Signed out — only reset if we're NOT in the middle of OTP flow
        if (!pendingOtpEmail) {
            currentUser = null;
            companyData = null;
            showAuthScreen();
        }
    }
}

// ========================================================
// OTP FLOW
// ========================================================

function generateOtp() {
    // Cryptographically stronger random 6-digit OTP
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return String(arr[0] % 1000000).padStart(6, "0");
}

async function sendOtpEmail(email, otp) {
    // Validate EmailJS is configured
    if (EMAILJS_SERVICE_ID.startsWith("YOUR_")) {
        // Dev fallback: log OTP to console (REMOVE IN PRODUCTION)
        console.warn("📧 [DEV MODE] OTP for", email, "is:", otp);
        return;
    }

    emailjs.init(EMAILJS_PUBLIC_KEY);
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: email,
        passcode: otp,
        app_name: "Attendance System",
    });
}

async function startOtpFlow(email) {
    pendingOtpCode = generateOtp();
    otpExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now

    try {
        await sendOtpEmail(email, pendingOtpCode);
    } catch (err) {
        console.error("Failed to send OTP email:", err);
        // Still show OTP screen — dev fallback shows it in console
    }

    showOtpScreen(email);
}

function showOtpScreen(email) {
    authScreen.classList.add("hidden");
    companySetupScreen.classList.add("hidden");
    appContainer.classList.add("hidden");
    otpScreen.classList.remove("hidden");

    // Update subtitle
    const maskedEmail = email.replace(/(.{2}).+(@.+)/, "$1****$2");
    otpSubtitle.textContent = `We sent a 6-digit code to ${maskedEmail}`;

    // Clear digit boxes
    otpDigits.forEach(d => { d.value = ""; d.classList.remove("otp-digit-filled", "otp-digit-error"); });
    otpError.classList.add("hidden");
    otpLoading.classList.add("hidden");
    otpVerifyBtn.disabled = false;
    otpVerifyBtnText.textContent = "Verify Code";

    // Focus first digit
    otpDigits[0].focus();

    // Start countdown timer
    startOtpTimer();

    // Enable resend after 60 seconds
    otpResendBtn.disabled = true;
    clearTimeout(otpResendTimeout);
    otpResendTimeout = setTimeout(() => { otpResendBtn.disabled = false; }, 60_000);
}

function startOtpTimer() {
    clearInterval(otpTimerInterval);
    otpTimerInterval = setInterval(() => {
        const remaining = otpExpiresAt - Date.now();
        if (remaining <= 0) {
            clearInterval(otpTimerInterval);
            otpTimer.textContent = "0:00";
            otpTimer.classList.add("otp-timer-expired");
            otpVerifyBtn.disabled = true;
            otpErrorText.textContent = "Code expired. Please request a new one.";
            otpError.classList.remove("hidden");
            return;
        }
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        otpTimer.textContent = `${m}:${String(s).padStart(2, "0")}`;
        otpTimer.classList.toggle("otp-timer-warning", remaining < 60_000);
    }, 500);
}

async function handleOtpVerify() {
    const entered = otpDigits.map(d => d.value).join("");

    if (entered.length < 6) {
        otpErrorText.textContent = "Please enter all 6 digits.";
        otpError.classList.remove("hidden");
        otpDigits.forEach(d => d.classList.add("otp-digit-error"));
        return;
    }

    if (Date.now() > otpExpiresAt) {
        otpErrorText.textContent = "Code has expired. Please request a new one.";
        otpError.classList.remove("hidden");
        return;
    }

    if (entered !== pendingOtpCode) {
        otpErrorText.textContent = "Incorrect code. Please try again.";
        otpError.classList.remove("hidden");
        otpDigits.forEach(d => {
            d.classList.add("otp-digit-error");
            d.value = "";
        });
        otpDigits[0].focus();
        return;
    }

    // OTP correct — show loading and re-sign-in the user
    otpError.classList.add("hidden");
    otpDigits.forEach(d => d.classList.remove("otp-digit-error"));
    otpVerifyBtn.style.display = "none";
    otpLoading.classList.remove("hidden");
    clearInterval(otpTimerInterval);

    // Clear OTP state so onAuthStateChanged allows app access
    const emailToSignIn = pendingOtpEmail;
    const passwordToSignIn = pendingOtpPassword;
    otpVerified = true;      // prevents re-trigger when re-sign-in fires handleAuthStateChanged
    pendingOtpEmail = null;
    pendingOtpCode = null;
    pendingOtpPassword = null;

    // Re-sign the user in — triggers onAuthStateChanged which now proceeds normally
    try {
        await signInWithEmailAndPassword(auth, emailToSignIn, passwordToSignIn);
    } catch (err) {
        // Token sign-in fallback: if re-sign-in fails (e.g. password not cached)
        console.error("Re-sign-in after OTP failed:", err);
        otpLoading.classList.add("hidden");
        otpVerifyBtn.style.display = "";
        otpErrorText.textContent = "Verification succeeded but re-login failed. Please log in again.";
        otpError.classList.remove("hidden");
        pendingOtpEmail = null; // ensure we go back to auth on next sign-out
        showAuthScreen();
    }
}

async function handleOtpResend() {
    otpResendBtn.disabled = true;
    otpError.classList.add("hidden");
    otpTimer.classList.remove("otp-timer-expired", "otp-timer-warning");
    otpVerifyBtn.disabled = false;
    otpDigits.forEach(d => { d.value = ""; d.classList.remove("otp-digit-error"); });
    otpDigits[0].focus();

    pendingOtpCode = generateOtp();
    otpExpiresAt = Date.now() + 5 * 60 * 1000;

    try {
        await sendOtpEmail(pendingOtpEmail, pendingOtpCode);
        showToast("📧 New code sent to your Gmail!");
    } catch (err) {
        console.error("Resend OTP failed:", err);
        showToast("⚠️ Could not send email. Check console for OTP (dev mode).");
    }

    startOtpTimer();
    setTimeout(() => { otpResendBtn.disabled = false; }, 60_000);
}

function setupOtpDigitNavigation() {
    otpDigits.forEach((input, idx) => {
        input.addEventListener("input", (e) => {
            const val = e.target.value.replace(/\D/g, "");
            input.value = val;
            input.classList.toggle("otp-digit-filled", val.length > 0);
            input.classList.remove("otp-digit-error");
            if (val && idx < 5) otpDigits[idx + 1].focus();
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" && !input.value && idx > 0) {
                otpDigits[idx - 1].focus();
                otpDigits[idx - 1].value = "";
                otpDigits[idx - 1].classList.remove("otp-digit-filled");
            }
            if (e.key === "Enter") handleOtpVerify();
        });

        input.addEventListener("paste", (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
            pasted.split("").forEach((ch, i) => {
                if (otpDigits[i]) {
                    otpDigits[i].value = ch;
                    otpDigits[i].classList.add("otp-digit-filled");
                }
            });
            const nextEmpty = otpDigits.findIndex(d => !d.value);
            if (nextEmpty !== -1) otpDigits[nextEmpty].focus();
            else otpDigits[5].focus();
        });
    });
}

async function handleCompanySetup(event) {
    event.preventDefault();

    const companyName = companyNameInput.value.trim();
    const logoUrl = companyLogoInput.value.trim();

    if (!companyName) {
        showToast("❌ Company name is required.");
        return;
    }

    companySetupForm.style.display = "none";
    setupLoading.classList.remove("hidden");

    try {
        // Create company document
        const data = {
            companyName,
            logoUrl: logoUrl || "",
            email: currentUser.email || "",
            displayName: currentUser.displayName || "",
            createdAt: new Date().toISOString(),
        };

        await setDoc(companyDocRef(), data);

        // Create default employees
        const defaultEmployees = [
            { id: "employee1", name: "Employee 1", jobTitle: "Team Member" },
            { id: "employee2", name: "Employee 2", jobTitle: "Team Member" },
        ];

        for (const emp of defaultEmployees) {
            await setDoc(employeeDocRef(emp.id), {
                name: emp.name,
                jobTitle: emp.jobTitle,
            });
        }

        companyData = data;
        showApp();
    } catch (error) {
        console.error("Error setting up company:", error);
        companySetupForm.style.display = "flex";
        setupLoading.classList.add("hidden");
        showToast("❌ Error creating company profile. Please try again.");
    }
}

function handleLogoPreview() {
    const url = companyLogoInput.value.trim();
    if (url) {
        logoPreview.src = url;
        logoPreviewContainer.classList.remove("hidden");

        logoPreview.onerror = () => {
            logoPreviewContainer.classList.add("hidden");
        };
    } else {
        logoPreviewContainer.classList.add("hidden");
    }
}

async function handleSignOut() {
    try {
        await signOut(auth);
        // onAuthStateChanged will handle showing the auth screen
    } catch (error) {
        console.error("Sign out error:", error);
        showToast("❌ Error signing out. Please try again.");
    }
}

async function handleForgotPassword() {
    const email = emailInput.value.trim();

    if (!email) {
        authErrorText.textContent = "Enter your email address above, then click Forgot Password.";
        authError.classList.remove("hidden");
        emailInput.focus();
        return;
    }

    if (!email.toLowerCase().endsWith("@gmail.com")) {
        authErrorText.textContent = "Only @gmail.com accounts are supported.";
        authError.classList.remove("hidden");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        authError.classList.add("hidden");
        showToast("📧 Password reset email sent! Check your Gmail inbox.");
    } catch (error) {
        const msgs = {
            "auth/user-not-found": "No account found with this email.",
            "auth/invalid-email": "Please enter a valid email address.",
            "auth/too-many-requests": "Too many requests. Please wait a moment.",
        };
        authErrorText.textContent = msgs[error.code] || "Could not send reset email. Please try again.";
        authError.classList.remove("hidden");
    }
}

// ========================================================
// DELETE ACCOUNT
// ========================================================
function showDeleteAccountModal() {
    deleteAccountModal.classList.remove("hidden");
    deleteAccountError.classList.add("hidden");
    deleteAccountLoading.classList.add("hidden");
    deleteAccountPassword.value = "";

    // Show password field only for email/password users
    const isEmailUser = currentUser?.providerData.some(p => p.providerId === "password");
    if (isEmailUser) {
        deleteReauthSection.classList.remove("hidden");
    } else {
        deleteReauthSection.classList.add("hidden");
    }
}

function hideDeleteAccountModal() {
    deleteAccountModal.classList.add("hidden");
    deleteAccountPassword.value = "";
    deleteAccountError.classList.add("hidden");
    deleteAccountLoading.classList.add("hidden");
}

async function handleDeleteAccount() {
    if (!currentUser) return;

    const isEmailUser = currentUser.providerData.some(p => p.providerId === "password");

    // Re-authenticate email/password users before deletion
    if (isEmailUser) {
        const password = deleteAccountPassword.value.trim();
        if (!password) {
            deleteAccountErrorText.textContent = "Please enter your password to confirm deletion.";
            deleteAccountError.classList.remove("hidden");
            return;
        }

        try {
            const credential = EmailAuthProvider.credential(currentUser.email, password);
            await reauthenticateWithCredential(currentUser, credential);
        } catch (err) {
            deleteAccountErrorText.textContent = "Incorrect password. Please try again.";
            deleteAccountError.classList.remove("hidden");
            return;
        }
    }

    // Show loading state
    deleteAccountError.classList.add("hidden");
    deleteAccountLoading.classList.remove("hidden");
    confirmDeleteAccountBtn.disabled = true;
    cancelDeleteAccountBtn.disabled = true;

    try {
        const uid = currentUser.uid;

        // 1. Delete all attendance card documents
        const cards = await getDocs(collection(db, "companies", uid, "attendanceCards"));
        for (const cardDoc of cards.docs) {
            await deleteDoc(cardDoc.ref);
        }

        // 2. Delete all employee documents
        const emps = await getDocs(collection(db, "companies", uid, "employees"));
        for (const empDoc of emps.docs) {
            await deleteDoc(empDoc.ref);
        }

        // 3. Delete the company root document
        await deleteDoc(doc(db, "companies", uid));

        // 4. Delete the Firebase Auth account (only the user can do this to themselves)
        await deleteUser(currentUser);

        // Auth state change will redirect to login screen
        showToast("✅ Account deleted successfully.");
    } catch (err) {
        console.error("Delete account error:", err);
        deleteAccountLoading.classList.add("hidden");
        confirmDeleteAccountBtn.disabled = false;
        cancelDeleteAccountBtn.disabled = false;

        if (err.code === "auth/requires-recent-login") {
            deleteAccountErrorText.textContent = "Session expired. Please sign out and sign back in, then try again.";
        } else {
            deleteAccountErrorText.textContent = "Failed to delete account. Please try again.";
        }
        deleteAccountError.classList.remove("hidden");
    }
}

// ========================================================
// SCREEN MANAGEMENT
// ========================================================
function showAuthScreen() {
    authScreen.classList.remove("hidden");
    companySetupScreen.classList.add("hidden");
    appContainer.classList.add("hidden");
    otpScreen.classList.add("hidden");

    // Clear OTP state fully
    pendingOtpEmail = null;
    pendingOtpCode = null;
    pendingOtpPassword = null;
    clearInterval(otpTimerInterval);
    clearTimeout(otpResendTimeout);

    // Reset auth UI
    emailAuthForm.style.display = "flex";
    googleSignInBtn.style.display = "flex";
    authLoading.classList.add("hidden");
    authError.classList.add("hidden");
    emailInput.value = "";
    passwordInput.value = "";
    switchAuthTab("login");
}

function showCompanySetup() {
    authScreen.classList.add("hidden");
    companySetupScreen.classList.remove("hidden");
    appContainer.classList.add("hidden");
    otpScreen.classList.add("hidden");   // clear OTP screen if coming from verification

    // Reset setup form
    companyNameInput.value = "";
    companyLogoInput.value = "";
    logoPreviewContainer.classList.add("hidden");
    companySetupForm.style.display = "flex";
    setupLoading.classList.add("hidden");
}

function showApp() {
    authScreen.classList.add("hidden");
    companySetupScreen.classList.add("hidden");
    appContainer.classList.remove("hidden");
    otpScreen.classList.add("hidden");   // clear OTP screen if coming from verification

    // Update header branding
    if (companyData) {
        companyNameDisplay.textContent = companyData.companyName || "My Company";
        if (companyData.logoUrl) {
            companyLogoDisplay.src = companyData.logoUrl;
            companyLogoDisplay.alt = companyData.companyName || "Company Logo";
            companyLogoDisplay.style.display = "block";
        } else {
            companyLogoDisplay.style.display = "none";
        }
    }

    // Initialize the main app
    setupApp();
}

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
    setupAuthListeners();
});

function setupApp() {
    updateClock();
    setInterval(updateClock, 1000);
    loadEmployees();
    setupEventListeners();
}


async function downloadAttendanceForMonth() {
    const selectedYear = document.getElementById("masterDownloadYear")?.value || document.getElementById("viewYear")?.value;
    const selectedMonth = document.getElementById("masterDownloadMonth")?.value || document.getElementById("viewMonth")?.value;

    if (!selectedYear || !selectedMonth) {
        showToast("❌ Select both year and month");
        return;
    }

    const monthKey = `${selectedYear}-${selectedMonth}`;
    try {
        const employeesSnapshot = await getDocs(employeesCollectionRef());
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
            attendanceCardsCollectionRef(),
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
                        // auto = no out in DB; manual = out exists in DB
                        let isAuto = !dayRecord.out;
                        let actualOut = dayRecord.out || "17:30";
                        outValue = isAuto
                            ? `${actualOut} (auto)`
                            : actualOut;
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
// FIRESTORE OPERATIONS (namespaced under companies/{uid})
// ========================================================
async function loadEmployees() {
    try {
        const querySnapshot = await getDocs(employeesCollectionRef());
        employees = querySnapshot.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
        }));
        employees.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

        if (employees.length === 0) {
            employees = [
                { id: "employee1", name: "Employee 1", jobTitle: "Team Member" },
                { id: "employee2", name: "Employee 2", jobTitle: "Team Member" },
            ];
        }
    } catch (error) {
        console.error("Error loading employees from Firebase:", error);
        showToast("❌ Firebase load failed. Please check your configuration.");
        employees = [
            { id: "employee1", name: "Employee 1", jobTitle: "Team Member" },
            { id: "employee2", name: "Employee 2", jobTitle: "Team Member" },
        ];
    }

    renderEmployees();
}

async function showTimePicker(action) {
    if (!selectedEmployee) return;

    // Validate note for past dates
    const dateStr = selectedAttendanceDate || getTodayString();
    if (isDateInPast(dateStr)) {
        const note = editNoteInput.value.trim();
        if (!note) {
            editNoteSection.classList.remove("hidden");
            editNoteInput.focus();
            editNoteInput.classList.add("note-required-shake");
            setTimeout(() => editNoteInput.classList.remove("note-required-shake"), 600);
            showToast("⚠️ A reason/note is required for past-date entries.");
            return;
        }
    }

    // Check the selected date's attendance
    try {
        const { month, day } = getMonthAndDayFromDateStr(dateStr);
        const attendanceDocId = `${selectedEmployee.id}_${month}`;
        const attendanceRef = attendanceCardDocRef(attendanceDocId);
        const attendanceSnap = await getDoc(attendanceRef);
        const storedAttendance = attendanceSnap.exists() ? attendanceSnap.data().attendance || {} : {};
        const dayRecord = storedAttendance[day] || null;

        // If user already checked IN and clicked IN, show in-UI edit prompt
        if (action === "IN" && dayRecord?.in) {
            editExistingTime = dayRecord.in;
            editExistingAction = "IN";
            editPromptText.textContent = `Already checked IN at ${dayRecord.in}. Do you want to edit check-in time?`;
            editPrompt.classList.remove("hidden");
            // Also ensure note section is visible for editing
            editNoteSection.classList.remove("hidden");
            editNoteHint.textContent = "Required — provide a reason for this edit.";
            return;
        }

        // If user already checked OUT and clicked OUT, show in-UI edit prompt
        // But if the existing OUT is only a default (auto-set), skip the prompt and go straight to picker
        // auto = no out in DB; manual = out exists in DB
        let isAutoOut = !dayRecord?.out;
        if (action === "OUT" && dayRecord?.out && !isAutoOut) {
            editExistingTime = dayRecord.out;
            editExistingAction = "OUT";
            editPromptText.textContent = `Already checked OUT at ${dayRecord.out}. Do you want to edit check-out time?`;
            editPrompt.classList.remove("hidden");
            editNoteSection.classList.remove("hidden");
            editNoteHint.textContent = "Required — provide a reason for this edit.";
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
    // But first check note is filled
    const note = editNoteInput.value.trim();
    if (!note) {
        editNoteSection.classList.remove("hidden");
        editNoteInput.focus();
        editNoteInput.classList.add("note-required-shake");
        setTimeout(() => editNoteInput.classList.remove("note-required-shake"), 600);
        showToast("⚠️ Please provide a reason for editing.");
        return;
    }

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
    const dateStr = selectedAttendanceDate || getTodayString();
    const editNote = editNoteInput.value.trim();

    // Require note for past dates or edits
    if (isDateInPast(dateStr) && !editNote) {
        editNoteSection.classList.remove("hidden");
        editNoteInput.focus();
        editNoteInput.classList.add("note-required-shake");
        setTimeout(() => editNoteInput.classList.remove("note-required-shake"), 600);
        showToast("⚠️ A reason/note is required for past-date entries.");
        return;
    }

    isProcessing = true;
    btnClockIn.disabled = true;
    btnClockOut.disabled = true;
    btnAbsent.disabled = true;
    loadingState.classList.remove("hidden");
    confirmationMessage.classList.add("hidden");
    timePickerSection.classList.add("hidden");

    try {
        const { month, day } = getMonthAndDayFromDateStr(dateStr);
        const timeString = selectedTime;
        const attendanceDocId = `${selectedEmployee.id}_${month}`;
        const action = pendingClockAction;

        const attendanceRef = attendanceCardDocRef(attendanceDocId);
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
            // Mark as auto and do NOT save 17:30 to DB
            delete dayRecord.out;
            dayRecord.outType = "auto";
            dayRecord.defaultOut = true;
            dayRecord.hours = computeHours(timeString, "17:30");
        } else {
            dayRecord.out = timeString;
            dayRecord.outType = "manual";
            dayRecord.hours = computeHours(dayRecord.in, dayRecord.out);
            // Clear the default flag — user has now manually set OUT
            delete dayRecord.defaultOut;
        }

        // Save edit note + timestamp if provided
        if (editNote) {
            dayRecord.editNote = editNote;
            dayRecord.editedAt = new Date().toISOString();
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
        const dateDisplay = dateStr === getTodayString() ? "today" : dateStr;
        const confirmMsg = action === "IN"
            ? `${selectedEmployee.name} — Checked in at ${timeString} on ${dateDisplay}. Default OUT set to 5:30 PM.`
            : `${selectedEmployee.name} — ${actionText} at ${timeString} on ${dateDisplay}`;
        confirmationText.textContent = confirmMsg;
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
        const employeeRef = employeeDocRef(employeeId);
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
    const empDisplayName = employee.name || employee.id;
    if (!confirm(`Delete employee "${empDisplayName}" (${employee.id})? This action cannot be undone.`)) {
        return;
    }

    try {
        await deleteDoc(employeeDocRef(employee.id));
        employees = employees.filter((current) => current.id !== employee.id);
        renderEmployees();
        renderMasterEmployeesList(masterEmployeeSearch?.value || "");
        showToast(`✓ Employee ${empDisplayName} deleted`);
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

    card.addEventListener("click", () => {
        openAttendanceModal(employee);
    });

    return card;
}

// ========================================================
// DATE HELPERS
// ========================================================
function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isDateInPast(dateStr) {
    // Returns true if dateStr (YYYY-MM-DD) is strictly before today
    return dateStr < getTodayString();
}

function getMonthAndDayFromDateStr(dateStr) {
    // dateStr: "YYYY-MM-DD"
    const parts = dateStr.split("-");
    const month = `${parts[0]}-${parts[1]}`;
    const day = String(Number(parts[2])); // remove leading zero for Firestore key
    return { month, day };
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
    absentWarningPrompt.classList.add("hidden");
    editPrompt.classList.add("hidden");
    timePickerSection.classList.add("hidden");
    btnClockIn.disabled = false;
    btnClockOut.disabled = false;
    btnAbsent.disabled = false;
    btnClockIn.classList.remove("disabled-btn");
    btnClockOut.classList.remove("disabled-btn");
    btnAbsent.classList.remove("disabled-btn");

    // Init date picker to today and block future dates
    const today = getTodayString();
    attendanceDatePicker.value = today;
    attendanceDatePicker.max = today;
    selectedAttendanceDate = today;

    // Note section: hide for today by default
    editNoteSection.classList.add("hidden");
    editNoteInput.value = "";

    attendanceModal.classList.remove("hidden");
}

function closeAttendanceModal() {
    attendanceModal.classList.add("hidden");
    selectedEmployee = null;
    confirmationMessage.classList.add("hidden");
    loadingState.classList.add("hidden");
    timePickerSection.classList.add("hidden");
    editPrompt.classList.add("hidden");
    absentWarningPrompt.classList.add("hidden");
    editNoteSection.classList.add("hidden");
    editNoteInput.value = "";
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
    selectedAttendanceDate = null;
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
    btnAbsentWarningYes.addEventListener("click", handleAbsentWarningYes);
    btnAbsentWarningNo.addEventListener("click", handleAbsentWarningNo);

    // Date picker change handler — show/hide note field
    attendanceDatePicker.addEventListener("change", () => {
        const dateStr = attendanceDatePicker.value;
        selectedAttendanceDate = dateStr;
        if (isDateInPast(dateStr)) {
            editNoteSection.classList.remove("hidden");
            editNoteHint.textContent = "Required — provide a reason for this past-date entry.";
        } else {
            editNoteSection.classList.add("hidden");
            editNoteInput.value = "";
        }
        // Reset action UI when date changes
        editPrompt.classList.add("hidden");
        timePickerSection.classList.add("hidden");
        absentWarningPrompt.classList.add("hidden");
        btnClockIn.classList.remove("disabled-btn");
        btnClockOut.classList.remove("disabled-btn");
        btnAbsent.classList.remove("disabled-btn");
        btnClockIn.disabled = false;
        btnClockOut.disabled = false;
        btnAbsent.disabled = false;
        pendingClockAction = null;
        editExistingTime = null;
        editExistingAction = null;
    });

    addEmployeeBtn.addEventListener("click", openAddEmployeeModal);
    addEmployeeClose.addEventListener("click", closeAddEmployeeModal);
    addEmployeeOverlay.addEventListener("click", closeAddEmployeeModal);
    cancelAddEmployee.addEventListener("click", closeAddEmployeeModal);
    addEmployeeForm.addEventListener("submit", handleAddEmployee);

    // View Attendance modal listeners
    document.getElementById("viewAttendanceBtn").addEventListener("click", openViewAttendanceModal);
    document.getElementById("viewAttendanceClose").addEventListener("click", closeViewAttendanceModal);
    document.getElementById("viewAttendanceOverlay").addEventListener("click", closeViewAttendanceModal);
    document.getElementById("viewYear").addEventListener("change", loadViewAttendance);
    document.getElementById("viewMonth").addEventListener("change", loadViewAttendance);

    // Master Mode Listeners
    masterBtn.addEventListener("click", handleMasterButtonClick);
    masterAuthClose.addEventListener("click", closeMasterAuthModal);
    masterAuthOverlay.addEventListener("click", closeMasterAuthModal);
    cancelMasterAuth.addEventListener("click", closeMasterAuthModal);
    masterAuthForm.addEventListener("submit", handleMasterAuthSubmit);
    toggleMasterPassword.addEventListener("click", toggleMasterPasswordVisibility);

    masterSettingsClose.addEventListener("click", closeMasterSettingsModal);
    masterSettingsOverlay.addEventListener("click", closeMasterSettingsModal);
    lockMasterBtn.addEventListener("click", lockMasterMode);

    tabMasterSalary.addEventListener("click", () => switchMasterTab("salary"));
    tabMasterEmployees.addEventListener("click", () => switchMasterTab("employees"));
    tabMasterDownload.addEventListener("click", () => switchMasterTab("download"));

    masterSalaryYear.addEventListener("change", loadMasterSalaryData);
    masterSalaryMonth.addEventListener("change", loadMasterSalaryData);
    masterRefreshSalaryBtn.addEventListener("click", loadMasterSalaryData);

    masterDownloadActionBtn.addEventListener("click", downloadAttendanceForMonth);
    masterEmployeeSearch.addEventListener("input", (e) => renderMasterEmployeesList(e.target.value));

    // Edit Salary modal listeners
    editSalaryClose.addEventListener("click", closeEditSalaryModal);
    editSalaryOverlay.addEventListener("click", closeEditSalaryModal);
    cancelEditSalary.addEventListener("click", closeEditSalaryModal);
    editSalaryForm.addEventListener("submit", handleSaveBaseSalary);

    // Loan & Advance modal listeners
    loanAdvanceClose.addEventListener("click", closeLoanAdvanceModal);
    loanAdvanceOverlay.addEventListener("click", closeLoanAdvanceModal);
    addFinancialForm.addEventListener("submit", handleAddFinancialRecord);
    saveMonthlyDeductionBtn.addEventListener("click", handleSaveMonthlyLoanDeduction);

    // Salary Slip modal listeners
    salarySlipClose.addEventListener("click", closeSalarySlipModal);
    salarySlipOverlay.addEventListener("click", closeSalarySlipModal);
    downloadPdfBtn.addEventListener("click", () => {
        const mode = salarySlipModal.dataset.mode || "single";
        const empName = salarySlipModal.dataset.empName || "Employee";
        const monthKey = salarySlipModal.dataset.monthKey || getTodayString().slice(0, 7);
        if (mode === "all") {
            downloadAllSalarySlipsPDF(monthKey.slice(0, 4), monthKey.slice(5, 7));
        } else {
            downloadSingleSalarySlipPDF(empName, monthKey);
        }
    });
    printSlipBtn.addEventListener("click", () => window.print());

    masterDownloadAllSlipsBtn.addEventListener("click", handleDownloadAllPayslips);
    masterPrintAllSlipsBtn.addEventListener("click", handlePrintAllPayslips);

    // Note detail popup
    document.getElementById("noteDetailClose").addEventListener("click", closeNoteDetailPopup);
    document.getElementById("noteDetailOverlay").addEventListener("click", closeNoteDetailPopup);

    document.querySelectorAll(".modal-content").forEach((content) => {
        content.addEventListener("click", (event) => event.stopPropagation());
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAttendanceModal();
            closeAddEmployeeModal();
            closeViewAttendanceModal();
            closeNoteDetailPopup();
            closeMasterAuthModal();
            closeMasterSettingsModal();
            closeEditSalaryModal();
            closeLoanAdvanceModal();
            closeSalarySlipModal();
        }
    });
}

// ========================================================
// MASTER SETTINGS & AUTH LOGIC
// ========================================================
function openMasterAuthModal() {
    masterAuthError.classList.add("hidden");
    masterPasswordInput.value = "";
    masterPasswordInput.type = "password";
    masterEyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    masterAuthModal.classList.remove("hidden");
    setTimeout(() => masterPasswordInput.focus(), 150);
}

function closeMasterAuthModal() {
    masterAuthModal.classList.add("hidden");
    masterPasswordInput.value = "";
    masterAuthError.classList.add("hidden");
}

function openMasterSettingsModal() {
    populateMasterDateSelectors();
    switchMasterTab("salary");
    masterSettingsModal.classList.remove("hidden");
}

function closeMasterSettingsModal() {
    masterSettingsModal.classList.add("hidden");
}

function lockMasterMode() {
    isMasterUnlocked = false;
    closeMasterSettingsModal();
    showToast("🔒 Master mode locked");
}

function handleMasterButtonClick() {
    if (isMasterUnlocked) {
        openMasterSettingsModal();
    } else {
        openMasterAuthModal();
    }
}

function handleMasterAuthSubmit(event) {
    event.preventDefault();
    const enteredPassword = masterPasswordInput.value.trim();
    if (enteredPassword === MASTER_PASSWORD) {
        isMasterUnlocked = true;
        closeMasterAuthModal();
        openMasterSettingsModal();
        showToast("🔓 Master access granted");
    } else {
        masterAuthErrorText.textContent = "Incorrect master password. Please try again.";
        masterAuthError.classList.remove("hidden");
        const formCard = masterAuthModal.querySelector(".master-auth-modal-content");
        if (formCard) {
            formCard.classList.remove("shake-input");
            void formCard.offsetWidth; // trigger reflow
            formCard.classList.add("shake-input");
        }
        masterPasswordInput.value = "";
        masterPasswordInput.focus();
    }
}

function toggleMasterPasswordVisibility() {
    if (masterPasswordInput.type === "password") {
        masterPasswordInput.type = "text";
        masterEyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
        masterPasswordInput.type = "password";
        masterEyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    }
}

function switchMasterTab(tabName) {
    tabMasterSalary.classList.toggle("active", tabName === "salary");
    tabMasterEmployees.classList.toggle("active", tabName === "employees");
    tabMasterDownload.classList.toggle("active", tabName === "download");

    masterSectionSalary.classList.toggle("hidden", tabName !== "salary");
    masterSectionEmployees.classList.toggle("hidden", tabName !== "employees");
    masterSectionDownload.classList.toggle("hidden", tabName !== "download");

    if (tabName === "salary") {
        loadMasterSalaryData();
    } else if (tabName === "employees") {
        renderMasterEmployeesList(masterEmployeeSearch?.value || "");
    }
}

function populateMasterDateSelectors() {
    const yearSelectors = [masterSalaryYear, masterDownloadYear];
    const monthSelectors = [masterSalaryMonth, masterDownloadMonth];

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = String(currentDate.getMonth() + 1).padStart(2, "0");

    yearSelectors.forEach((sel) => {
        if (!sel) return;
        const prevVal = sel.value;
        sel.innerHTML = "";
        for (let y = currentYear + 1; y >= currentYear - 3; y--) {
            const opt = document.createElement("option");
            opt.value = String(y);
            opt.textContent = String(y);
            if (prevVal ? opt.value === prevVal : y === currentYear) opt.selected = true;
            sel.appendChild(opt);
        }
    });

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    monthSelectors.forEach((sel) => {
        if (!sel) return;
        const prevVal = sel.value;
        sel.innerHTML = "";
        monthNames.forEach((name, i) => {
            const val = String(i + 1).padStart(2, "0");
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = `${val} - ${name}`;
            if (prevVal ? opt.value === prevVal : val === currentMonth) opt.selected = true;
            sel.appendChild(opt);
        });
    });
}

// ========================================================
// SALARY & PAYROLL CALCULATION ENGINE (Updated Formulas)
// ========================================================
function calculateMissedMinutes(inStr, outStr, dayRecord = null) {
    if (!inStr) return 0;
    try {
        const actualOut = outStr || (dayRecord && dayRecord.out) || "17:30";
        const workedHours = dayRecord && dayRecord.hours !== undefined && !isNaN(Number(dayRecord.hours))
            ? Number(dayRecord.hours)
            : computeHours(inStr, actualOut);
        const workedMinutes = Math.round(workedHours * 60);
        return Math.max(0, Math.round(EXPECTED_WORK_MINUTES - workedMinutes));
    } catch (e) {
        console.warn("Error calculating missed minutes for", inStr, outStr, e);
        return 0;
    }
}

function calculateEmployeeSalary(emp, year, month, attendanceCard) {
    const daysInMonth = getDaysInMonth(Number(year), Number(month));
    const baseSalary = Number(emp.salary || 0);

    // Multipliers (default 208h divisor and 1.25x penalty, customizable per employee)
    const hoursDivisor = emp.hoursDivider !== undefined && emp.hoursDivider !== "" && !isNaN(Number(emp.hoursDivider)) && Number(emp.hoursDivider) > 0
        ? Number(emp.hoursDivider)
        : 208;
    const penaltyMultiplier = emp.penaltyMultiplier !== undefined && emp.penaltyMultiplier !== "" && !isNaN(Number(emp.penaltyMultiplier))
        ? Number(emp.penaltyMultiplier)
        : 1.25;

    // Daily wage = Salary / number of days in the month = 30
    const dailyWage = baseSalary > 0 ? (baseSalary / 30) : 0;

    // Hourly base rate = Salary / 208 default (editable)
    const hourlyBaseRate = baseSalary > 0 ? (baseSalary / hoursDivisor) : 0;

    const attendance = attendanceCard?.attendance || {};
    let presentDays = 0;
    let actualAbsentDays = 0;
    let totalMissedMinutes = 0;
    let totalSundays = 0;
    let sundayPenalties = 0;

    // Track week-by-week absences (group days Mon-Sun)
    const weekMap = {};

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(Number(year), Number(month) - 1, d);
        const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ...
        const dayKey = String(d);
        const dayRecord = attendance[dayKey];
        const dateStr = `${year}-${month}-${String(d).padStart(2, "0")}`;
        const isPastOrToday = dateStr <= getTodayString();

        const weekNum = Math.ceil((d + (new Date(Number(year), Number(month) - 1, 1).getDay() || 7) - 1) / 7);
        if (!weekMap[weekNum]) {
            weekMap[weekNum] = { weekdayAbsences: 0, sundayDay: null };
        }

        if (dayOfWeek === 0) {
            totalSundays++;
            weekMap[weekNum].sundayDay = d;
        } else {
            // Weekday (Mon - Sat)
            if (dayRecord) {
                if (dayRecord.Status === "A") {
                    actualAbsentDays++;
                    weekMap[weekNum].weekdayAbsences++;
                } else if (dayRecord.in) {
                    presentDays++;
                    const inStr = dayRecord.in;
                    const outStr = dayRecord.out || dayRecord.defaultOut || "17:30";
                    const dayMissed = calculateMissedMinutes(inStr, outStr);
                    totalMissedMinutes += dayMissed;
                }
            } else if (isPastOrToday) {
                actualAbsentDays++;
                weekMap[weekNum].weekdayAbsences++;
            }
        }
    }

    // Sunday salary cut penalty rule (if 2 or more weekday absences in a week)
    Object.values(weekMap).forEach((w) => {
        if (w.weekdayAbsences >= 2 && w.sundayDay !== null) {
            sundayPenalties++;
        }
    });

    const totalAbsentDays = actualAbsentDays + sundayPenalties;

    // absent_salary_cut = daily wage x absent_days
    const absentSalaryCut = Math.round(totalAbsentDays * dailyWage);

    // hours salary cut = [salary / 208 (multiplier)] * late_hours * penalty (1.25)
    const totalMissedHours = (totalMissedMinutes / 60);
    const hoursSalaryCut = Math.round(hourlyBaseRate * totalMissedHours * penaltyMultiplier);

    // monthly_salary / Gross Earned = base salary - absent_salary_cut - hours salary cut
    const grossEarned = Math.max(0, Math.round(baseSalary - absentSalaryCut - hoursSalaryCut));

    // Loan & Advance Deductions
    const monthKey = `${year}-${month}`;
    const financialRecords = Array.isArray(emp.financialRecords) ? emp.financialRecords : [];

    const totalLoanTaken = financialRecords
        .filter((r) => r.type === "loan")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const totalLoanRepaid = financialRecords
        .filter((r) => r.type === "loan_repayment")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const remainingLoanBeforeMonth = Math.max(0, totalLoanTaken - totalLoanRepaid);

    const configuredLoanDeduction = emp.monthlyLoanDeductions?.[monthKey] !== undefined
        ? Number(emp.monthlyLoanDeductions[monthKey])
        : 0;

    // Advance for this month (deducted in current salary)
    const activeAdvanceForMonth = financialRecords
        .filter((r) => r.type === "advance" && !r.repaid && (!r.month || r.month === monthKey))
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    // Calculate actual advance cut based on available grossEarned
    const advanceDeduction = Math.min(grossEarned, activeAdvanceForMonth);
    const uncoveredAdvance = Math.max(0, activeAdvanceForMonth - advanceDeduction);

    // Remaining gross salary available for loan deduction
    const remainingGrossForLoan = Math.max(0, grossEarned - advanceDeduction);

    // Loan deduction capped at remaining loan before month AND remaining gross salary
    const requestedLoanDeduction = Math.min(remainingLoanBeforeMonth, configuredLoanDeduction);
    const loanDeduction = Math.min(remainingGrossForLoan, requestedLoanDeduction);

    // Remaining loan carried forward to next month:
    // Subtract actual loan deduction cut, and add any uncovered advance amount
    const remainingLoanAfterMonth = Math.max(0, remainingLoanBeforeMonth - loanDeduction + uncoveredAdvance);
    const netSalary = Math.max(0, Math.round(grossEarned - advanceDeduction - loanDeduction));

    return {
        baseSalary,
        daysInMonth,
        dailyWage,
        hoursDivisor,
        penaltyMultiplier,
        hourlyBaseRate,
        presentDays,
        actualAbsentDays,
        sundayPenalties,
        totalAbsentDays,
        absentSalaryCut,
        totalMissedMinutes,
        totalMissedHours: totalMissedHours.toFixed(1),
        hoursSalaryCut,
        grossEarned,
        advanceDeduction,
        loanDeduction,
        totalLoanTaken,
        totalLoanRepaid,
        remainingLoan: remainingLoanAfterMonth,
        netSalary,
    };
}

async function loadMasterSalaryData() {
    const selectedYear = masterSalaryYear?.value;
    const selectedMonth = masterSalaryMonth?.value;
    if (!selectedYear || !selectedMonth) return;

    const monthKey = `${selectedYear}-${selectedMonth}`;
    masterSalaryTableBody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align: center; padding: 28px; color: var(--text-secondary);">
                <div class="spinner-small" style="margin: 0 auto 10px;"></div>
                Calculating salary & deductions for ${selectedMonth}/${selectedYear}…
            </td>
        </tr>
    `;

    try {
        const attendanceQuery = query(
            attendanceCardsCollectionRef(),
            where("month", "==", monthKey)
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const attendanceMap = {};
        attendanceSnap.forEach((d) => { attendanceMap[d.id] = d.data(); });

        if (employees.length === 0) {
            masterSalaryTableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 28px; color: var(--text-secondary);">
                        No employees found. Add employees in the main dashboard or Employee tab.
                    </td>
                </tr>
            `;
            statTotalBaseSalary.textContent = "₹0";
            statTotalAttendanceCuts.textContent = "-₹0";
            statTotalLoanAdvDeductions.textContent = "-₹0";
            statTotalNetPayout.textContent = "₹0";
            return;
        }

        const sortedEmployees = [...employees].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

        let totalBase = 0;
        let totalAttendanceCut = 0;
        let totalLoanAdvCut = 0;
        let totalNet = 0;

        masterSalaryTableBody.innerHTML = "";

        sortedEmployees.forEach((emp) => {
            const card = attendanceMap[`${emp.id}_${monthKey}`];
            const calc = calculateEmployeeSalary(emp, selectedYear, selectedMonth, card);

            totalBase += calc.baseSalary;
            totalAttendanceCut += (calc.absentSalaryCut + calc.hoursSalaryCut);
            totalLoanAdvCut += (calc.advanceDeduction + calc.loanDeduction);
            totalNet += calc.netSalary;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <strong>${escapeHtml(emp.name || emp.id)}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHtml(emp.id)} &bull; ${escapeHtml(emp.jobTitle || "Staff")}</div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <strong>₹${calc.baseSalary.toLocaleString("en-IN")}</strong>
                            <button class="btn-edit-salary-action" title="Edit Base Salary & Multipliers">✏️</button>
                        </div>
                        <span class="badge-multiplier">${calc.hoursDivisor}h div &bull; ${calc.penaltyMultiplier}× pen</span>
                    </div>
                </td>
                <td>
                    <span style="color: ${calc.totalAbsentDays > 0 ? '#dc2626' : 'inherit'}; font-weight: ${calc.totalAbsentDays > 0 ? '700' : 'normal'};">
                        ${calc.totalAbsentDays} d
                    </span>
                    ${calc.sundayPenalties > 0 ? `<span class="badge-penalty" title="${calc.sundayPenalties} Sunday salary cuts for &ge;2 weekday absences">+${calc.sundayPenalties} Sun</span>` : ""}
                    <div style="font-size: 0.72rem; color: #dc2626;">-₹${calc.absentSalaryCut.toLocaleString("en-IN")}</div>
                </td>
                <td>
                    <span>${calc.totalMissedHours} h</span>
                    <div style="font-size: 0.72rem; color: #d97706;">-₹${calc.hoursSalaryCut.toLocaleString("en-IN")}</div>
                </td>
                <td>
                    <strong style="color: #4338ca;">₹${calc.grossEarned.toLocaleString("en-IN")}</strong>
                </td>
                <td>
                    <span style="color: ${calc.advanceDeduction > 0 ? '#d97706' : 'inherit'}; font-weight: ${calc.advanceDeduction > 0 ? '700' : 'normal'};">
                        ₹${calc.advanceDeduction.toLocaleString("en-IN")}
                    </span>
                </td>
                <td>
                    <span style="color: ${calc.loanDeduction > 0 ? '#d97706' : 'inherit'}; font-weight: ${calc.loanDeduction > 0 ? '700' : 'normal'};">
                        ₹${calc.loanDeduction.toLocaleString("en-IN")}
                    </span>
                    ${calc.remainingLoan > 0 ? `<div style="font-size: 0.7rem; color: #94a3b8;">Bal: ₹${calc.remainingLoan.toLocaleString("en-IN")}</div>` : ""}
                </td>
                <td>
                    <span class="badge-net-pay">₹${calc.netSalary.toLocaleString("en-IN")}</span>
                </td>
                <td style="text-align: right;">
                    <div class="btn-action-group">
                        <button class="btn-slip-view" title="View 2-Up Payslip / Download PDF">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                            </svg>
                            Slip
                        </button>
                        <button class="btn-loan-manage" title="Manage Loans & Advances">
                            💳 Loan
                        </button>
                    </div>
                </td>
            `;

            tr.querySelector(".btn-edit-salary-action").addEventListener("click", () => openEditSalaryModal(emp));
            tr.querySelector(".btn-slip-view").addEventListener("click", () => openSalarySlipModal(emp, selectedYear, selectedMonth, calc));
            tr.querySelector(".btn-loan-manage").addEventListener("click", () => openLoanAdvanceModal(emp));

            masterSalaryTableBody.appendChild(tr);
        });

        statTotalBaseSalary.textContent = `₹${totalBase.toLocaleString("en-IN")}`;
        statTotalAttendanceCuts.textContent = `-₹${totalAttendanceCut.toLocaleString("en-IN")}`;
        statTotalLoanAdvDeductions.textContent = `-₹${totalLoanAdvCut.toLocaleString("en-IN")}`;
        statTotalNetPayout.textContent = `₹${totalNet.toLocaleString("en-IN")}`;

    } catch (error) {
        console.error("Error loading master salary data:", error);
        masterSalaryTableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 24px; color: #dc2626;">
                    ❌ Error loading salary data. Check Firestore connection.
                </td>
            </tr>
        `;
    }
}

function renderMasterEmployeesList(filterQuery = "") {
    const tbody = document.getElementById("masterEmployeesTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const queryLower = (filterQuery || "").trim().toLowerCase();
    const filtered = employees.filter((emp) => {
        if (!queryLower) return true;
        return (
            (emp.id && emp.id.toLowerCase().includes(queryLower)) ||
            (emp.name && emp.name.toLowerCase().includes(queryLower)) ||
            (emp.jobTitle && emp.jobTitle.toLowerCase().includes(queryLower))
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 24px;">
                    ${employees.length === 0 ? "No employees registered." : "No employees match your search."}
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach((emp) => {
        const financialRecords = Array.isArray(emp.financialRecords) ? emp.financialRecords : [];
        const totalLoan = financialRecords.filter(r => r.type === "loan").reduce((s, r) => s + Number(r.amount || 0), 0);
        const totalRepaid = financialRecords.filter(r => r.type === "loan_repayment").reduce((s, r) => s + Number(r.amount || 0), 0);
        const remainingLoan = Math.max(0, totalLoan - totalRepaid);

        const hoursDivisor = emp.hoursDivider !== undefined && emp.hoursDivider !== "" ? emp.hoursDivider : 208;
        const penaltyMultiplier = emp.penaltyMultiplier !== undefined && emp.penaltyMultiplier !== "" ? emp.penaltyMultiplier : 1.25;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="master-emp-id-badge">${escapeHtml(emp.id)}</span></td>
            <td style="font-weight: 600;">${escapeHtml(emp.name || emp.id)}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(emp.jobTitle || "Employee")}</td>
            <td>
                <div>
                    <strong>₹${Number(emp.salary || 0).toLocaleString("en-IN")}</strong>
                    <div style="font-size: 0.72rem; color: var(--text-secondary);">${hoursDivisor}h div &bull; ${penaltyMultiplier}× pen</div>
                </div>
            </td>
            <td>
                <span style="color: ${remainingLoan > 0 ? '#dc2626' : 'inherit'}; font-weight: ${remainingLoan > 0 ? '700' : 'normal'};">
                    ₹${remainingLoan.toLocaleString("en-IN")}
                </span>
            </td>
            <td style="text-align: right;">
                <div class="btn-action-group">
                    <button class="btn-edit-salary-action" title="Set Base Salary & Rules">✏️ Rules</button>
                    <button class="btn-loan-manage" title="Manage Loans & Advances">💳 Loan/Adv</button>
                    <button class="btn-delete-emp-master" data-emp-id="${escapeHtml(emp.id)}" title="Delete Employee">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                            <path d="M10 11v6"></path>
                            <path d="M14 11v6"></path>
                        </svg>
                        Delete
                    </button>
                </div>
            </td>
        `;

        tr.querySelector(".btn-edit-salary-action").addEventListener("click", () => openEditSalaryModal(emp));
        tr.querySelector(".btn-loan-manage").addEventListener("click", () => openLoanAdvanceModal(emp));
        tr.querySelector(".btn-delete-emp-master").addEventListener("click", () => deleteEmployee(emp));

        tbody.appendChild(tr);
    });
}

// ========================================================
// EDIT BASE SALARY & DEDUCTION RULES MODAL
// ========================================================
function openEditSalaryModal(emp) {
    editSalaryEmpName.textContent = emp.name || emp.id;
    editSalaryEmpId.textContent = emp.id;
    editSalaryEmpIdHidden.value = emp.id;
    baseSalaryInput.value = emp.salary || "";
    hoursDivisorInput.value = emp.hoursDivider !== undefined && emp.hoursDivider !== "" ? emp.hoursDivider : 208;
    penaltyMultiplierInput.value = emp.penaltyMultiplier !== undefined && emp.penaltyMultiplier !== "" ? emp.penaltyMultiplier : 1.25;
    editSalaryModal.classList.remove("hidden");
    setTimeout(() => baseSalaryInput.focus(), 150);
}

function closeEditSalaryModal() {
    editSalaryModal.classList.add("hidden");
    baseSalaryInput.value = "";
}

async function handleSaveBaseSalary(e) {
    e.preventDefault();
    const empId = editSalaryEmpIdHidden.value;
    const salaryVal = Number(baseSalaryInput.value.trim());
    const divisorVal = Number(hoursDivisorInput.value.trim()) || 208;
    const penaltyVal = Number(penaltyMultiplierInput.value.trim());

    if (!empId || isNaN(salaryVal) || salaryVal < 0) {
        showToast("⚠️ Please enter a valid base salary amount.");
        return;
    }
    if (isNaN(divisorVal) || divisorVal <= 0) {
        showToast("⚠️ Hours divisor must be greater than 0.");
        return;
    }
    if (isNaN(penaltyVal) || penaltyVal < 0) {
        showToast("⚠️ Penalty multiplier must be 0 or greater.");
        return;
    }

    try {
        await setDoc(employeeDocRef(empId), {
            salary: salaryVal,
            hoursDivider: divisorVal,
            penaltyMultiplier: penaltyVal,
        }, { merge: true });

        // Update in-memory employee record
        const targetEmp = employees.find((x) => x.id === empId);
        if (targetEmp) {
            targetEmp.salary = salaryVal;
            targetEmp.hoursDivider = divisorVal;
            targetEmp.penaltyMultiplier = penaltyVal;
        }

        closeEditSalaryModal();
        showToast(`✅ Salary (₹${salaryVal.toLocaleString("en-IN")}), Divisor (${divisorVal}h), & Penalty (${penaltyVal}×) saved.`);
        loadMasterSalaryData();
        renderMasterEmployeesList(masterEmployeeSearch?.value || "");
    } catch (err) {
        console.error("Error saving base salary & rules:", err);
        showToast("❌ Error saving salary rules to Firestore.");
    }
}

// ========================================================
// LOAN & ADVANCE MANAGEMENT MODAL
// ========================================================
function openLoanAdvanceModal(emp) {
    const selectedYear = masterSalaryYear?.value || getTodayString().slice(0, 4);
    const selectedMonth = masterSalaryMonth?.value || getTodayString().slice(5, 7);
    const monthKey = `${selectedYear}-${selectedMonth}`;

    loanAdvanceModal.dataset.empId = emp.id;
    loanAdvanceModal.dataset.monthKey = monthKey;

    loanEmpName.textContent = emp.name || emp.id;
    loanEmpId.textContent = emp.id;
    financialEmpIdHidden.value = emp.id;
    financialDate.value = getTodayString();
    financialAmount.value = "";
    financialNote.value = "";

    loanDeductionMonthLabel.textContent = `${selectedMonth}/${selectedYear}`;
    const configuredDeduction = emp.monthlyLoanDeductions?.[monthKey] !== undefined
        ? emp.monthlyLoanDeductions[monthKey]
        : 0;
    monthLoanDeductionInput.value = configuredDeduction || "";

    renderLoanAdvanceOverviewAndLedger(emp, monthKey);
    loanAdvanceModal.classList.remove("hidden");
}

function closeLoanAdvanceModal() {
    loanAdvanceModal.classList.add("hidden");
    financialAmount.value = "";
    financialNote.value = "";
}

function renderLoanAdvanceOverviewAndLedger(emp, monthKey) {
    const financialRecords = Array.isArray(emp.financialRecords) ? emp.financialRecords : [];

    const totalLoanTaken = financialRecords
        .filter((r) => r.type === "loan")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const totalLoanRepaid = financialRecords
        .filter((r) => r.type === "loan_repayment")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const remainingLoan = Math.max(0, totalLoanTaken - totalLoanRepaid);

    const activeAdvance = financialRecords
        .filter((r) => r.type === "advance" && !r.repaid && (!r.month || r.month === monthKey))
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    loanStatTotalLoans.textContent = `₹${totalLoanTaken.toLocaleString("en-IN")}`;
    loanStatTotalRepaid.textContent = `₹${totalLoanRepaid.toLocaleString("en-IN")}`;
    loanStatRemainingLoan.textContent = `₹${remainingLoan.toLocaleString("en-IN")}`;
    loanStatActiveAdvance.textContent = `₹${activeAdvance.toLocaleString("en-IN")}`;

    // Ledger table
    financialHistoryTableBody.innerHTML = "";
    if (financialRecords.length === 0) {
        financialHistoryTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 18px;">
                    No loan or advance records for this employee yet.
                </td>
            </tr>
        `;
        return;
    }

    const sortedRecords = [...financialRecords].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    sortedRecords.forEach((rec) => {
        const tr = document.createElement("tr");
        const typeLabels = {
            loan: `<span style="color: #dc2626; font-weight: 700;">💳 Loan Given</span>`,
            advance: `<span style="color: #d97706; font-weight: 700;">💵 Advance Given</span>`,
            loan_repayment: `<span style="color: #16a34a; font-weight: 700;">🔄 Loan Repayment</span>`,
        };

        tr.innerHTML = `
            <td>${escapeHtml(rec.date || "—")}</td>
            <td>${typeLabels[rec.type] || rec.type}</td>
            <td><strong>₹${Number(rec.amount || 0).toLocaleString("en-IN")}</strong></td>
            <td style="color: var(--text-secondary);">${escapeHtml(rec.note || (rec.month ? `Month: ${rec.month}` : "—"))}</td>
            <td style="text-align: right;">
                <button class="btn-delete-emp-master" style="padding: 3px 8px; font-size: 0.72rem;" title="Delete Record">
                    ✕
                </button>
            </td>
        `;

        tr.querySelector("button").addEventListener("click", () => {
            handleDeleteFinancialRecord(emp.id, rec.id);
        });

        financialHistoryTableBody.appendChild(tr);
    });
}

async function handleAddFinancialRecord(e) {
    e.preventDefault();
    const empId = financialEmpIdHidden.value;
    const type = financialType.value;
    const amount = Number(financialAmount.value.trim());
    const date = financialDate.value || getTodayString();
    const note = financialNote.value.trim();
    const monthKey = loanAdvanceModal.dataset.monthKey || getTodayString().slice(0, 7);

    if (!empId || isNaN(amount) || amount <= 0) {
        showToast("⚠️ Please enter a valid amount.");
        return;
    }

    const targetEmp = employees.find((x) => x.id === empId);
    if (!targetEmp) return;

    const currentRecords = Array.isArray(targetEmp.financialRecords) ? [...targetEmp.financialRecords] : [];
    const newRecord = {
        id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        type,
        amount,
        date,
        note,
        month: monthKey,
        repaid: false,
    };

    currentRecords.push(newRecord);

    try {
        await setDoc(employeeDocRef(empId), {
            financialRecords: currentRecords,
        }, { merge: true });

        targetEmp.financialRecords = currentRecords;
        financialAmount.value = "";
        financialNote.value = "";

        showToast(`✅ ${type === "loan" ? "Loan" : "Advance"} of ₹${amount.toLocaleString("en-IN")} recorded.`);
        renderLoanAdvanceOverviewAndLedger(targetEmp, monthKey);
        loadMasterSalaryData();
        renderMasterEmployeesList(masterEmployeeSearch?.value || "");
    } catch (err) {
        console.error("Error adding financial record:", err);
        showToast("❌ Error saving record to Firestore.");
    }
}

async function handleSaveMonthlyLoanDeduction() {
    const empId = loanAdvanceModal.dataset.empId;
    const monthKey = loanAdvanceModal.dataset.monthKey;
    const deductionVal = Number(monthLoanDeductionInput.value.trim()) || 0;

    if (!empId || !monthKey || isNaN(deductionVal) || deductionVal < 0) {
        showToast("⚠️ Please enter a valid deduction amount.");
        return;
    }

    const targetEmp = employees.find((x) => x.id === empId);
    if (!targetEmp) return;

    const currentMonthlyDeductions = targetEmp.monthlyLoanDeductions || {};
    currentMonthlyDeductions[monthKey] = deductionVal;

    try {
        await setDoc(employeeDocRef(empId), {
            monthlyLoanDeductions: currentMonthlyDeductions,
        }, { merge: true });

        targetEmp.monthlyLoanDeductions = currentMonthlyDeductions;
        showToast(`✅ Set ₹${deductionVal.toLocaleString("en-IN")} loan cut for ${monthKey}.`);
        loadMasterSalaryData();
    } catch (err) {
        console.error("Error saving monthly deduction:", err);
        showToast("❌ Error saving deduction to Firestore.");
    }
}

async function handleDeleteFinancialRecord(empId, recId) {
    if (!confirm("Are you sure you want to delete this financial entry?")) return;

    const targetEmp = employees.find((x) => x.id === empId);
    if (!targetEmp) return;

    const updatedRecords = (targetEmp.financialRecords || []).filter((r) => r.id !== recId);

    try {
        await setDoc(employeeDocRef(empId), {
            financialRecords: updatedRecords,
        }, { merge: true });

        targetEmp.financialRecords = updatedRecords;
        const monthKey = loanAdvanceModal.dataset.monthKey || getTodayString().slice(0, 7);
        renderLoanAdvanceOverviewAndLedger(targetEmp, monthKey);
        loadMasterSalaryData();
        renderMasterEmployeesList(masterEmployeeSearch?.value || "");
        showToast("✓ Entry removed.");
    } catch (err) {
        console.error("Error deleting entry:", err);
        showToast("❌ Error deleting entry from Firestore.");
    }
}

// ========================================================
// 2-UP A4 PAYSLIP BUILDER & MULTI-EMPLOYEE PDF GENERATOR
// ========================================================

/**
 * Returns HTML for one half of a payslip (either Employer Copy or Employee Copy)
 */
function renderSingleSlipHalfHTML(emp, year, month, calc, copyLabel) {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[Number(month) - 1];
    const companyName = document.getElementById("companyNameDisplay")?.textContent || "Company";
    const companyLogo = document.getElementById("companyLogoDisplay")?.src || "Email_logo-removebg-preview.png";

    return `
        <div class="slip-half">
            <div class="slip-header">
                <div class="slip-company-info">
                    <img src="${companyLogo}" alt="Logo" class="slip-company-logo">
                    <div>
                        <div class="slip-company-name">${escapeHtml(companyName)}</div>
                        <div style="font-size: 0.7rem; color: #64748b;">Employee Payroll Statement</div>
                    </div>
                </div>
                <div class="slip-title-badge">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <h3 class="slip-title-text">SALARY PAYSLIP</h3>
                        <span class="slip-copy-tag">${escapeHtml(copyLabel)}</span>
                    </div>
                    <p class="slip-period-text">${monthName} ${year}</p>
                </div>
            </div>

            <div class="slip-emp-box">
                <div class="slip-emp-field">
                    <span class="slip-emp-label">Employee Name</span>
                    <span class="slip-emp-val">${escapeHtml(emp.name || emp.id)}</span>
                </div>
                <div class="slip-emp-field">
                    <span class="slip-emp-label">Employee ID</span>
                    <span class="slip-emp-val" style="font-family: monospace;">${escapeHtml(emp.id)}</span>
                </div>
                <div class="slip-emp-field">
                    <span class="slip-emp-label">Designation</span>
                    <span class="slip-emp-val">${escapeHtml(emp.jobTitle || "Staff")}</span>
                </div>
                <div class="slip-emp-field">
                    <span class="slip-emp-label">Pay Period</span>
                    <span class="slip-emp-val">${calc.daysInMonth} Days (${calc.presentDays} Present)</span>
                </div>
            </div>

            <table class="slip-table">
                <thead>
                    <tr>
                        <th style="width: 50%;">Description / Item</th>
                        <th style="text-align: center; width: 25%;">Units / Rate Basis</th>
                        <th style="text-align: right; width: 25%;">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Monthly Base Salary</strong></td>
                        <td style="text-align: center; color: #64748b;">₹${Math.round(calc.dailyWage)}/day &bull; ₹${Math.round(calc.hourlyBaseRate)}/hr</td>
                        <td style="text-align: right; font-weight: 700;">₹${calc.baseSalary.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr>
                        <td>
                            Absent Days Cut
                            ${calc.sundayPenalties > 0 ? `<br><small style="color:#dc2626;">(Includes ${calc.sundayPenalties} Sunday cut for &ge;2 weekday absences)</small>` : ""}
                        </td>
                        <td style="text-align: center; color: #dc2626;">${calc.totalAbsentDays} Days (${calc.actualAbsentDays} Wkday + ${calc.sundayPenalties} Sun)</td>
                        <td style="text-align: right; color: #dc2626; font-weight: 600;">-₹${calc.absentSalaryCut.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr>
                        <td>Hours Cut (${calc.hoursDivisor}h div &bull; ${calc.penaltyMultiplier}× pen)</td>
                        <td style="text-align: center; color: #d97706;">${calc.totalMissedHours} Hours late</td>
                        <td style="text-align: right; color: #d97706; font-weight: 600;">-₹${calc.hoursSalaryCut.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr class="row-subtotal">
                        <td><strong>Gross Payable (After Attendance Cuts)</strong></td>
                        <td style="text-align: center;">—</td>
                        <td style="text-align: right; font-weight: 800;">₹${calc.grossEarned.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr>
                        <td>Advance Deduction</td>
                        <td style="text-align: center; color: #d97706;">Current Month Advance</td>
                        <td style="text-align: right; color: #d97706; font-weight: 600;">${calc.advanceDeduction > 0 ? `-₹${calc.advanceDeduction.toLocaleString("en-IN")}` : "₹0"}</td>
                    </tr>
                    <tr>
                        <td>Loan Installment Deduction</td>
                        <td style="text-align: center; color: #d97706;">Monthly Loan Recovery</td>
                        <td style="text-align: right; color: #d97706; font-weight: 600;">${calc.loanDeduction > 0 ? `-₹${calc.loanDeduction.toLocaleString("en-IN")}` : "₹0"}</td>
                    </tr>
                    <tr class="row-net">
                        <td><strong>NET PAYABLE SALARY</strong></td>
                        <td style="text-align: center; font-size: 0.75rem; color: #4338ca; text-transform: uppercase;">Bank Transfer / Cash</td>
                        <td style="text-align: right; font-size: 1.05rem; color: #16a34a;">₹${calc.netSalary.toLocaleString("en-IN")}</td>
                    </tr>
                </tbody>
            </table>

            <div class="slip-loan-summary-box">
                <span><strong>Remaining Loan Balance:</strong> ₹${calc.remainingLoan.toLocaleString("en-IN")}</span>
                <span style="font-size: 0.7rem; color: #9a3412;">(Total Loan: ₹${calc.totalLoanTaken.toLocaleString("en-IN")} &bull; Total Repaid: ₹${(calc.totalLoanRepaid + calc.loanDeduction).toLocaleString("en-IN")})</span>
            </div>

            <div class="slip-formula-note">
                * Daily Wage = Salary / ${calc.daysInMonth}d = ₹${calc.dailyWage.toFixed(2)}/d. Hours Cut = (Salary / ${calc.hoursDivisor}h) × ${calc.totalMissedHours}h × ${calc.penaltyMultiplier} pen = ₹${calc.hoursSalaryCut}. Sunday cut applied if absent &ge;2 days in a week.
            </div>

            <div class="slip-signatures">
                <div class="slip-signature-box">
                    <div class="slip-signature-line"></div>
                    <span class="slip-signature-text">Authorized Signatory</span>
                </div>
                <div class="slip-signature-box">
                    <div class="slip-signature-line"></div>
                    <span class="slip-signature-text">Employee Signature</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Returns HTML for full A4 sheet containing Top Half + Cut Line + Bottom Half
 */
function renderEmployeeA4SheetHTML(emp, year, month, calc) {
    return `
        <div class="a4-page-sheet" data-emp-id="${escapeHtml(emp.id)}">
            ${renderSingleSlipHalfHTML(emp, year, month, calc, "Employer Copy")}
            <div class="slip-cut-divider">
                <span>✂ CUT ALONG DOTTED LINE — (TOP: EMPLOYER COPY / BOTTOM: EMPLOYEE COPY) ✂</span>
            </div>
            ${renderSingleSlipHalfHTML(emp, year, month, calc, "Employee Copy")}
        </div>
    `;
}

function openSalarySlipModal(emp, year, month, calc) {
    const monthKey = `${year}-${month}`;
    salarySlipModal.dataset.mode = "single";
    salarySlipModal.dataset.empName = emp.name || emp.id;
    salarySlipModal.dataset.monthKey = monthKey;

    slipModalTitle.textContent = `Payslip (2-Up A4): ${emp.name || emp.id} (${month}/${year})`;
    salarySlipPrintArea.innerHTML = renderEmployeeA4SheetHTML(emp, year, month, calc);
    salarySlipModal.classList.remove("hidden");
}

function closeSalarySlipModal() {
    salarySlipModal.classList.add("hidden");
}

function downloadSingleSalarySlipPDF(empName, monthKey) {
    const element = document.getElementById("salarySlipPrintArea");
    if (!element) return;

    showToast("📄 Generating 2-Up A4 Payslip PDF...");
    const opt = {
        margin: [6, 6, 6, 6],
        filename: `SalarySlip_${empName.replace(/\s+/g, "_")}_${monthKey}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ['css', 'legacy'] }
    };

    if (typeof html2pdf !== "undefined") {
        html2pdf().set(opt).from(element).save().then(() => {
            showToast("✅ PDF downloaded successfully");
        }).catch((err) => {
            console.error("PDF generation error:", err);
            window.print();
        });
    } else {
        window.print();
    }
}

function renderCompactCardHTML(emp, calc) {
    return `
        <div style="border: 1px solid #000; border-radius: 3px; padding: 4px 5px; background: #fff; color: #000; font-size: 8.5px; box-sizing: border-box; font-family: sans-serif; line-height: 1.25;">
            <div style="font-weight: bold; font-size: 9.5px; border-bottom: 1px dashed #000; padding-bottom: 2px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">
                ${escapeHtml(emp.name || emp.id)} <span style="font-weight: normal; font-size: 7.5px; color: #333;">(${escapeHtml(emp.id)})</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; color: #000;">
                <span>Base: ₹${calc.baseSalary.toLocaleString("en-IN")}</span>
                <span>Att: ${calc.presentDays}/${calc.daysInMonth}d</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; color: #000;">
                <span>Abs Cut (${calc.totalAbsentDays}d):</span>
                <span>-₹${calc.absentSalaryCut.toLocaleString("en-IN")}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; color: #000;">
                <span>Hrs Cut (${calc.totalMissedHours}h):</span>
                <span>-₹${calc.hoursSalaryCut.toLocaleString("en-IN")}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; color: #000;">
                <span>Adv Cut:</span>
                <span>-₹${calc.advanceDeduction.toLocaleString("en-IN")}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; color: #000;">
                <span>Loan Cut:</span>
                <span>-₹${calc.loanDeduction.toLocaleString("en-IN")}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; color: #000;">
                <span>Rem Loan:</span>
                <span>₹${calc.remainingLoan.toLocaleString("en-IN")}</span>
            </div>
            <div style="font-weight: bold; font-size: 9px; border-top: 1px solid #000; margin-top: 2px; padding-top: 1px; display: flex; justify-content: space-between; color: #000;">
                <span>NET PAY:</span>
                <span>₹${calc.netSalary.toLocaleString("en-IN")}</span>
            </div>
        </div>
    `;
}

function renderCardsGridHalf(employeeChunk, calcMap, copyLabel, monthKey) {
    let cardsHTML = employeeChunk.map(emp => renderCompactCardHTML(emp, calcMap[emp.id])).join('');
    return `
        <div style="padding: 4px 6px; box-sizing: border-box;">
            <div style="text-align: center; font-weight: bold; font-size: 11px; text-transform: uppercase; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 4px; color: #000;">
                SALARY PAYSLIPS — ${copyLabel} (${monthKey})
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;">
                ${cardsHTML}
            </div>
        </div>
    `;
}

function renderAllEmployeesCompactSheetsHTML(sortedEmployees, calcMap, monthKey) {
    const chunkSize = 16;
    let combinedHTML = "";
    for (let i = 0; i < sortedEmployees.length; i += chunkSize) {
        const chunk = sortedEmployees.slice(i, i + chunkSize);
        combinedHTML += `
            <div class="a4-page-sheet" style="padding: 4px 0; background: #ffffff; color: #000000; font-family: sans-serif; box-sizing: border-box;">
                ${renderCardsGridHalf(chunk, calcMap, "EMPLOYER COPY", monthKey)}
                <div style="border-top: 1.5px dashed #000; margin: 4px 0; padding: 2px 0; text-align: center; font-size: 8.5px; font-weight: bold; color: #000;">
                    ✂ CUT ALONG DOTTED LINE — (TOP: EMPLOYER COPY / BOTTOM: EMPLOYEE COPY) ✂
                </div>
                ${renderCardsGridHalf(chunk, calcMap, "EMPLOYEE COPY", monthKey)}
            </div>
        `;
    }
    return combinedHTML;
}

async function handleDownloadAllPayslips() {
    const selectedYear = masterSalaryYear?.value;
    const selectedMonth = masterSalaryMonth?.value;
    if (!selectedYear || !selectedMonth) return;

    const monthKey = `${selectedYear}-${selectedMonth}`;

    showToast("⏳ Gathering attendance & generating Combined PDF...");

    try {
        const attendanceQuery = query(
            attendanceCardsCollectionRef(),
            where("month", "==", monthKey)
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const attendanceMap = {};
        attendanceSnap.forEach((d) => { attendanceMap[d.id] = d.data(); });

        if (employees.length === 0) {
            showToast("⚠️ No employees found to generate payslips.");
            return;
        }

        const sortedEmployees = [...employees].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

        const calcMap = {};
        sortedEmployees.forEach(emp => {
            const card = attendanceMap[`${emp.id}_${monthKey}`];
            calcMap[emp.id] = calculateEmployeeSalary(emp, selectedYear, selectedMonth, card);
        });

        salarySlipPrintArea.innerHTML = renderAllEmployeesCompactSheetsHTML(sortedEmployees, calcMap, monthKey);
        salarySlipModal.dataset.mode = "all";
        salarySlipModal.dataset.monthKey = monthKey;
        const totalPages = Math.ceil(sortedEmployees.length / 16);
        slipModalTitle.textContent = `All Employees Payslips (${monthKey}) - ${totalPages} Sheet(s)`;
        salarySlipModal.classList.remove("hidden");

        // Download multi-page PDF
        downloadAllSalarySlipsPDF(selectedYear, selectedMonth);

    } catch (err) {
        console.error("Error generating all payslips PDF:", err);
        showToast("❌ Error generating combined payslips PDF.");
    }
}

function downloadAllSalarySlipsPDF(year, month) {
    const element = document.getElementById("salarySlipPrintArea");
    if (!element) return;

    showToast("📄 Compiling Combined PDF for all employees...");
    const opt = {
        margin: [6, 6, 6, 6],
        filename: `All_Employees_Salary_Slips_${year}-${month}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ['css', 'legacy'] }
    };

    if (typeof html2pdf !== "undefined") {
        html2pdf().set(opt).from(element).save().then(() => {
            showToast("✅ Combined PDF downloaded successfully!");
        }).catch((err) => {
            console.error("Combined PDF error:", err);
            window.print();
        });
    } else {
        window.print();
    }
}

async function handlePrintAllPayslips() {
    const selectedYear = masterSalaryYear?.value;
    const selectedMonth = masterSalaryMonth?.value;
    if (!selectedYear || !selectedMonth) return;

    const monthKey = `${selectedYear}-${selectedMonth}`;

    try {
        const attendanceQuery = query(
            attendanceCardsCollectionRef(),
            where("month", "==", monthKey)
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const attendanceMap = {};
        attendanceSnap.forEach((d) => { attendanceMap[d.id] = d.data(); });

        const sortedEmployees = [...employees].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

        const calcMap = {};
        sortedEmployees.forEach(emp => {
            const card = attendanceMap[`${emp.id}_${monthKey}`];
            calcMap[emp.id] = calculateEmployeeSalary(emp, selectedYear, selectedMonth, card);
        });

        salarySlipPrintArea.innerHTML = renderAllEmployeesCompactSheetsHTML(sortedEmployees, calcMap, monthKey);
        salarySlipModal.dataset.mode = "all";
        salarySlipModal.dataset.monthKey = monthKey;
        const totalPages = Math.ceil(sortedEmployees.length / 16);
        slipModalTitle.textContent = `All Employees Payslips (${monthKey}) - ${totalPages} Sheet(s)`;
        salarySlipModal.classList.remove("hidden");

        setTimeout(() => {
            window.print();
        }, 300);

    } catch (err) {
        console.error("Error opening all payslips for print:", err);
        showToast("❌ Error preparing payslips for print.");
    }
}

// ========================================================
// VIEW ATTENDANCE MODAL
// ========================================================
function openViewAttendanceModal() {
    const modal = document.getElementById("viewAttendanceModal");
    modal.classList.remove("hidden");

    // Populate year / month selectors (same logic as download controls)
    const viewYear = document.getElementById("viewYear");
    const viewMonth = document.getElementById("viewMonth");
    viewYear.innerHTML = "";
    viewMonth.innerHTML = "";

    const now = new Date();
    const currentYear = now.getFullYear();
    for (let y = currentYear - 2; y <= currentYear; y++) {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        if (y === currentYear) opt.selected = true;
        viewYear.appendChild(opt);
    }

    const monthNames = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    monthNames.forEach((m, idx) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = `${m} (${new Date(0, idx).toLocaleString("default", { month: "short" })})`;
        if (idx === now.getMonth()) opt.selected = true;
        viewMonth.appendChild(opt);
    });

    // Auto-load attendance directly for selected (current) month
    loadViewAttendance();
}

function closeViewAttendanceModal() {
    document.getElementById("viewAttendanceModal").classList.add("hidden");
}

async function loadViewAttendance() {
    const selectedYear = document.getElementById("viewYear").value;
    const selectedMonth = document.getElementById("viewMonth").value;

    if (!selectedYear || !selectedMonth) {
        showToast("⚠️ Please select a year and month.");
        return;
    }

    const monthKey = `${selectedYear}-${selectedMonth}`;
    const wrap = document.getElementById("viewAttendanceTableWrap");
    wrap.innerHTML = '<div class="view-loading"><div class="spinner-small"></div><p>Loading…</p></div>';

    try {
        // ── Fetch employees ──────────────────────────────────────
        if (employees.length === 0) {
            wrap.innerHTML = '<p class="view-placeholder">No employees found.</p>';
            return;
        }
        const empList = [...employees].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

        // ── Fetch attendance cards for all employees this month ──
        const attendanceQuery = query(
            attendanceCardsCollectionRef(),
            where("month", "==", monthKey)
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const attendanceMap = {};
        attendanceSnap.forEach(d => { attendanceMap[d.id] = d.data(); });

        // ── Build table ──────────────────────────────────────────
        const year = Number(selectedYear);
        const monthNum = Number(selectedMonth);
        const daysInMonth = getDaysInMonth(year, monthNum);
        const todayStr = getTodayString();

        // Totals per employee
        const totals = empList.map(() => ({ present: 0, absent: 0, missedMinutes: 0 }));

        // Two-row header (employee name spanning 3 cols, then IN/OUT/Hrs Missed sub-header)
        let header1 = `<tr><th rowspan="2" class="th-date">Date</th>`;
        let header2 = `<tr>`;
        empList.forEach(emp => {
            header1 += `<th colspan="4" class="th-emp-name">${escapeHtml(emp.name)}</th>`;
            header2 += `<th>IN</th><th>OUT</th><th>Hrs&nbsp;Missed</th><th class="th-edited-col"></th>`;
        });
        header1 += `</tr>`;
        header2 += `</tr>`;

        let bodyRows = "";

        for (let d = 1; d <= daysInMonth; d++) {
            const paddedDay = String(d).padStart(2, "0");
            const fullDateStr = `${selectedYear}-${selectedMonth}-${paddedDay}`;
            if (fullDateStr > todayStr) continue; // skip future

            const dayKey = String(d);
            const dateObj = new Date(year, monthNum - 1, d);
            const isSunday = dateObj.getDay() === 0;

            // Determine row-level class (driven by first non-sunday employee or sunday)
            let rowMeta = isSunday ? "row-sunday" : "";

            let cells = "";
            empList.forEach((emp, idx) => {
                const card = attendanceMap[`${emp.id}_${monthKey}`];
                const rec = card?.attendance?.[dayKey] || null;
                const isEdited = !!(rec?.editNote);

                let inVal = "—", outVal = "—", missedVal = "—";
                let cellClass = "";
                let editAttr = "";
                let editIcon = "";

                if (isSunday && !rec) {
                    inVal = "Sunday"; outVal = "Sunday"; missedVal = "—";
                    cellClass = "cell-sunday";
                } else if (rec) {
                    if (rec.Status === "A") {
                        inVal = "Absent"; outVal = "Absent"; missedVal = "00:00";
                        cellClass = isEdited ? "cell-absent cell-edited" : "cell-absent";
                        if (!isSunday) totals[idx].absent++;
                    } else if (rec.Status === "P") {
                        inVal = rec.in || "—";
                        // auto = no out in DB; manual = out exists in DB
                        let isAuto = !rec.out;
                        let actualOut = rec.out || "17:30";
                        outVal = isAuto
                            ? `<span title="Auto OUT — not manually confirmed" class="default-out">${actualOut}*<br><span style="font-size: 0.85em; opacity: 0.8">(auto)</span></span>`
                            : actualOut;
                        cellClass = isEdited ? "cell-present cell-edited" : "cell-present";
                        totals[idx].present++;

                        const workedMinutes = Math.round(Number(rec.hours || 0) * 60);
                        if (!rec.out) {
                            if (isSunday) {
                                inVal = rec.in || "Sunday"; outVal = "Sunday"; missedVal = "—";
                            } else {
                                const missed = Math.max(0, Math.round(EXPECTED_WORK_MINUTES - workedMinutes));
                                missedVal = missed > 0 ? formatMinutes(missed) : "00:00";
                                totals[idx].missedMinutes += missed;
                            }
                        } else {
                            if (isSunday) {
                                missedVal = "—";
                            } else {
                                const missed = Math.max(0, Math.round(EXPECTED_WORK_MINUTES - workedMinutes));
                                missedVal = missed > 0 ? formatMinutes(missed) : "00:00";
                                totals[idx].missedMinutes += missed;
                            }
                        }
                    }
                } else {
                    // No record
                    if (isSunday) {
                        inVal = "Sunday"; outVal = "Sunday"; missedVal = "—";
                        cellClass = "cell-sunday";
                    } else {
                        inVal = "Absent"; outVal = "Absent"; missedVal = "00:00";
                        cellClass = "cell-absent";
                        totals[idx].absent++;
                    }
                }

                if (isEdited) {
                    const noteEsc = escapeHtml(rec.editNote || "");
                    const edAtEsc = escapeHtml(rec.editedAt || "");
                    editIcon = `<span class="edited-badge" data-note="${noteEsc}" data-date="${fullDateStr}" data-edited-at="${edAtEsc}" title="Edited — click to see note">✏️</span>`;
                }

                cells += `<td class="${cellClass}">${inVal}</td>`;
                cells += `<td class="${cellClass}">${outVal}</td>`;
                cells += `<td class="${cellClass} cell-missed">${missedVal}</td>`;
                cells += `<td class="cell-edit-icon">${editIcon}</td>`;
            });

            // Row-level edited attribute: if any cell in this row is edited we want the row clickable
            // But since edits are per-employee, we handle clicks at cell level via JS below.
            bodyRows += `<tr class="${rowMeta}" data-date="${fullDateStr}">
                <td class="td-date">${fullDateStr}</td>${cells}</tr>`;
        }

        // ── Summary rows ─────────────────────────────────────────
        let summaryPresent = `<tr class="summary-row"><td class="summary-label">✅ Total Present</td>`;
        let summaryAbsent = `<tr class="summary-row"><td class="summary-label">❌ Total Absent</td>`;
        let summaryMissed = `<tr class="summary-row"><td class="summary-label">⏱ Hrs Missed</td>`;
        totals.forEach(t => {
            summaryPresent += `<td colspan="2" class="summary-val">${t.present}</td><td colspan="2"></td>`;
            summaryAbsent += `<td colspan="2" class="summary-val">${t.absent}</td><td colspan="2"></td>`;
            summaryMissed += `<td colspan="3" class="summary-val missed-val">${formatMinutes(t.missedMinutes)}</td><td></td>`;
        });
        summaryPresent += `</tr>`;
        summaryAbsent += `</tr>`;
        summaryMissed += `</tr>`;

        const tableHtml = `
            <div class="view-table-month-label">
                Attendance — ${selectedMonth}/${selectedYear}
                <span class="view-emp-count">${empList.length} employee${empList.length !== 1 ? "s" : ""}</span>
            </div>
            <div class="view-table-scroll">
                <table class="view-table view-table-multi">
                    <thead>${header1}${header2}</thead>
                    <tbody>${bodyRows}</tbody>
                    <tfoot>${summaryPresent}${summaryAbsent}${summaryMissed}</tfoot>
                </table>
            </div>`;

        wrap.innerHTML = tableHtml;

        // Wire edited-badge click events
        wrap.querySelectorAll(".edited-badge").forEach(badge => {
            badge.addEventListener("click", (e) => {
                e.stopPropagation();
                showNoteDetailPopup(
                    badge.getAttribute("data-note") || "",
                    badge.getAttribute("data-date") || "",
                    badge.getAttribute("data-edited-at") || ""
                );
            });
        });

        // Also make entire edited cells clickable
        wrap.querySelectorAll(".cell-edited").forEach(cell => {
            cell.style.cursor = "pointer";
            cell.addEventListener("click", (e) => {
                const row = cell.closest("tr");
                const badge = row?.querySelector(".edited-badge");
                if (badge) badge.click();
            });
        });

    } catch (err) {
        console.error("Error loading attendance view:", err);
        wrap.innerHTML = '<p class="view-placeholder view-error">Failed to load attendance data.</p>';
    }
}

// ========================================================
// NOTE DETAIL POPUP
// ========================================================
function showNoteDetailPopup(note, dateStr, editedAt) {
    document.getElementById("noteDetailText").textContent = note || "(no note)";
    document.getElementById("noteDetailDate").textContent = `Date: ${dateStr}`;
    if (editedAt) {
        const d = new Date(editedAt);
        document.getElementById("noteDetailTimestamp").textContent =
            `Edited on: ${d.toLocaleDateString()} at ${d.toLocaleTimeString()}`;
    } else {
        document.getElementById("noteDetailTimestamp").textContent = "";
    }
    document.getElementById("noteDetailPopup").classList.remove("hidden");
}

function closeNoteDetailPopup() {
    document.getElementById("noteDetailPopup").classList.add("hidden");
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

    const dateStr = selectedAttendanceDate || getTodayString();
    const editNote = editNoteInput.value.trim();

    // Require note for past dates
    if (isDateInPast(dateStr) && !editNote) {
        editNoteSection.classList.remove("hidden");
        editNoteInput.focus();
        editNoteInput.classList.add("note-required-shake");
        setTimeout(() => editNoteInput.classList.remove("note-required-shake"), 600);
        showToast("⚠️ A reason/note is required for past-date entries.");
        return;
    }

    isProcessing = true;
    pendingClockAction = "ABSENT";
    // Grey out buttons
    btnClockIn.classList.add("disabled-btn");
    btnClockOut.classList.add("disabled-btn");
    btnClockIn.disabled = true;
    btnClockOut.disabled = true;
    btnAbsent.classList.add("disabled-btn");
    btnAbsent.disabled = true;
    loadingState.classList.remove("hidden");
    confirmationMessage.classList.add("hidden");
    absentWarningPrompt.classList.add("hidden");

    try {
        const { month, day } = getMonthAndDayFromDateStr(dateStr);
        const attendanceDocId = `${selectedEmployee.id}_${month}`;

        const attendanceRef = attendanceCardDocRef(attendanceDocId);
        const attendanceSnap = await getDoc(attendanceRef);
        const storedAttendance = attendanceSnap.exists() ? attendanceSnap.data().attendance || {} : {};
        const dayRecord = storedAttendance[day] || null;

        // Check if employee has checked in
        if (dayRecord && dayRecord.in) {
            loadingState.classList.add("hidden");
            absentWarningText.textContent = `${selectedEmployee.name} was marked checked IN at ${dayRecord.in}. Do you still want to mark absent?`;
            absentWarningPrompt.classList.remove("hidden");
            return;
        }

        // Proceed directly if no checked in times
        const newRecord = { Status: "A" };
        if (editNote) {
            newRecord.editNote = editNote;
            newRecord.editedAt = new Date().toISOString();
        }
        storedAttendance[day] = newRecord;

        await setDoc(
            attendanceRef,
            {
                employeeId: selectedEmployee.id,
                month,
                attendance: storedAttendance,
            },
            { merge: true }
        );

        const dateDisplay = dateStr === getTodayString() ? "today" : dateStr;
        confirmationText.textContent = `${selectedEmployee.name} — Marked absent for ${dateDisplay}`;
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
        btnAbsent.classList.remove("disabled-btn");
        btnClockIn.disabled = false;
        btnClockOut.disabled = false;
        btnAbsent.disabled = false;
        pendingClockAction = null;
    }
}

async function handleAbsentWarningYes() {
    if (!selectedEmployee || !isProcessing) return;

    absentWarningPrompt.classList.add("hidden");
    loadingState.classList.remove("hidden");

    const dateStr = selectedAttendanceDate || getTodayString();
    const editNote = editNoteInput.value.trim();
    const { month, day } = getMonthAndDayFromDateStr(dateStr);

    try {
        const attendanceDocId = `${selectedEmployee.id}_${month}`;
        const attendanceRef = attendanceCardDocRef(attendanceDocId);

        const newDayRecord = {
            Status: "A",
            in: deleteField(),
            out: deleteField(),
            hours: deleteField()
        };
        if (editNote) {
            newDayRecord.editNote = editNote;
            newDayRecord.editedAt = new Date().toISOString();
        }

        // Delete checking times from Firebase and set Status to 'A'
        await setDoc(
            attendanceRef,
            {
                employeeId: selectedEmployee.id,
                month,
                attendance: {
                    [day]: newDayRecord
                }
            },
            { merge: true }
        );

        const dateDisplay = dateStr === getTodayString() ? "today" : dateStr;
        confirmationText.textContent = `${selectedEmployee.name} — Marked absent for ${dateDisplay}`;
        confirmationMessage.classList.remove("hidden");
        loadingState.classList.add("hidden");

        setTimeout(() => {
            closeAttendanceModal();
            isProcessing = false;
        }, 3000);

        showToast("✓ Absent recorded successfully");
    } catch (error) {
        console.error("Error confirming absent:", error);
        loadingState.classList.add("hidden");
        showToast("❌ Error: Could not mark absent. Check Firebase setup.");
        isProcessing = false;
        btnClockIn.classList.remove("disabled-btn");
        btnClockOut.classList.remove("disabled-btn");
        btnAbsent.classList.remove("disabled-btn");
        btnClockIn.disabled = false;
        btnClockOut.disabled = false;
        btnAbsent.disabled = false;
        pendingClockAction = null;
    }
}

function handleAbsentWarningNo() {
    absentWarningPrompt.classList.add("hidden");

    // Enable buttons and remove grey out styling
    btnClockIn.classList.remove("disabled-btn");
    btnClockOut.classList.remove("disabled-btn");
    btnAbsent.classList.remove("disabled-btn");
    btnClockIn.disabled = false;
    btnClockOut.disabled = false;
    btnAbsent.disabled = false;

    isProcessing = false;
    pendingClockAction = null;
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
