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

const absentWarningPrompt = document.getElementById("absentWarningPrompt");
const absentWarningText = document.getElementById("absentWarningText");
const btnAbsentWarningYes = document.getElementById("btnAbsentWarningYes");
const btnAbsentWarningNo = document.getElementById("btnAbsentWarningNo");

const toastNotification = document.getElementById("toastNotification");
const toastMessage = document.getElementById("toastMessage");

// Delete Account Modal elements
const deleteAccountModal = document.getElementById("deleteAccountModal");
const deleteAccountOverlay = document.getElementById("deleteAccountOverlay");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const confirmDeleteAccountBtn = document.getElementById("confirmDeleteAccount");
const cancelDeleteAccountBtn = document.getElementById("cancelDeleteAccount");
const deleteAccountPassword = document.getElementById("deleteAccountPassword");
const deleteReauthSection = document.getElementById("deleteReauthSection");
const deleteAccountError = document.getElementById("deleteAccountError");
const deleteAccountErrorText = document.getElementById("deleteAccountErrorText");
const deleteAccountLoading = document.getElementById("deleteAccountLoading");

let pendingClockAction = null; // Track which action (IN/OUT) is pending time selection
let editExistingTime = null;
let editExistingAction = null;

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
    deleteAccountBtn.addEventListener("click", () => showDeleteAccountModal());
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
            "auth/invalid-email":  "Please enter a valid email address.",
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
    populateMonthYearSelectors();
    loadEmployees();
    setupEventListeners();
}

function populateMonthYearSelectors() {
    // Clear existing options to prevent duplicates on re-init
    selectYear.innerHTML = "";
    selectMonth.innerHTML = "";

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

    // Check today's attendance to avoid duplicate check-ins/outs
    try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const day = String(now.getDate());
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
    if (!confirm(`Delete ${employee.name}? This action cannot be undone.`)) {
        return;
    }

    try {
        await deleteDoc(employeeDocRef(employee.id));
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
    absentWarningPrompt.classList.add("hidden");
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
    absentWarningPrompt.classList.add("hidden");
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
    btnAbsentWarningYes.addEventListener("click", handleAbsentWarningYes);
    btnAbsentWarningNo.addEventListener("click", handleAbsentWarningNo);

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
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const day = String(now.getDate());
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

    try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const day = String(now.getDate());
        const attendanceDocId = `${selectedEmployee.id}_${month}`;

        const attendanceRef = attendanceCardDocRef(attendanceDocId);

        // Delete checking times from Firebase and set Status to 'A'
        await setDoc(
            attendanceRef,
            {
                employeeId: selectedEmployee.id,
                month,
                attendance: {
                    [day]: {
                        Status: "A",
                        in: deleteField(),
                        out: deleteField(),
                        hours: deleteField()
                    }
                }
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
