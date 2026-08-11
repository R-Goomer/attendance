exports.handler = async function (event, context) {
    const email = event.queryStringParameters?.email || "guidance446@gmail.com";
    const password = event.queryStringParameters?.password || "87654321";

    const FIREBASE_API_KEY = "AIzaSyAwxg4_ZFpSUhN2jR6m4OK906xIw0-G1Wk";
    const PROJECT_ID = "attendance-38ca5";

    try {
        // 1. Authenticate with Firebase Auth REST API
        const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        
        const authData = await authRes.json();
        if (authData.error) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                body: `Authentication failed: ${authData.error.message}`
            };
        }

        const idToken = authData.idToken;
        const uid = authData.localId;

        // Current date formatting (YYYY-MM and day number)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const monthKey = `${year}-${month}`;
        const dayKey = String(now.getDate());

        // 2. Fetch Employees from Firestore
        const empRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/companies/${uid}/employees`, {
            headers: { Authorization: `Bearer ${idToken}` }
        });
        const empData = await empRes.json();
        const employees = {};
        if (empData.documents) {
            empData.documents.forEach(doc => {
                const fields = doc.fields || {};
                const empId = fields.employeeId?.stringValue || fields.id?.stringValue || doc.name.split('/').pop();
                const name = fields.name?.stringValue || empId;
                employees[empId] = name;
            });
        }

        // 3. Fetch Attendance Cards from Firestore
        const cardsRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/companies/${uid}/attendanceCards`, {
            headers: { Authorization: `Bearer ${idToken}` }
        });
        const cardsData = await cardsRes.json();
        
        const absentNames = [];

        if (cardsData.documents) {
            cardsData.documents.forEach(doc => {
                const docId = doc.name.split('/').pop(); // Format: {employeeId}_{YYYY-MM}
                if (docId.endsWith(`_${monthKey}`)) {
                    const empId = docId.replace(`_${monthKey}`, '');
                    const empName = employees[empId] || empId;
                    const fields = doc.fields || {};
                    
                    const attendanceMap = fields.attendance?.mapValue?.fields || {};
                    const dayRecord = attendanceMap[dayKey]?.mapValue?.fields || null;

                    if (dayRecord && dayRecord.Status?.stringValue === "A") {
                        absentNames.push(empName);
                    }
                }
            });
        }

        let message = "";
        if (absentNames.length === 0) {
            message = "No employees are marked absent today.";
        } else if (absentNames.length === 1) {
            message = `Today ${absentNames[0]} is absent.`;
        } else {
            const last = absentNames.pop();
            message = `Today ${absentNames.join(', ')} and ${last} are absent.`;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: message
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: `Error: ${err.message}`
        };
    }
};
