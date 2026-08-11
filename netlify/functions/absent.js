exports.handler = async function (event, context) {
    const email = event.queryStringParameters?.email || "guidance446@gmail.com";
    const password = event.queryStringParameters?.password || "87654321";
    const tz = event.queryStringParameters?.tz || "Asia/Kolkata";
    const type = event.queryStringParameters?.type || "all"; // 'all' (marked + no check-in) or 'marked' (only explicitly marked)

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

        // 2. Format Date in local timezone (default IST / Asia/Kolkata)
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: 'numeric',
            weekday: 'short'
        });
        const parts = formatter.formatToParts(now);
        
        let year, month, dayStr, weekday;
        parts.forEach(p => {
            if (p.type === 'year') year = p.value;
            if (p.type === 'month') month = p.value;
            if (p.type === 'day') dayStr = String(parseInt(p.value, 10)); // Strip leading 0 to match Firestore day keys ("1".."31")
            if (p.type === 'weekday') weekday = p.value;
        });

        const monthKey = `${year}-${month}`;
        const isSunday = (weekday === 'Sun');

        // 3. Fetch All Employees from Firestore
        const empRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/companies/${uid}/employees`, {
            headers: { Authorization: `Bearer ${idToken}` }
        });
        const empData = await empRes.json();
        const employees = [];
        if (empData.documents) {
            empData.documents.forEach(doc => {
                const fields = doc.fields || {};
                const empId = fields.employeeId?.stringValue || fields.id?.stringValue || doc.name.split('/').pop();
                const name = fields.name?.stringValue || empId;
                employees.push({ id: empId, name });
            });
        }

        // 4. Fetch Attendance Cards from Firestore
        const cardsRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/companies/${uid}/attendanceCards`, {
            headers: { Authorization: `Bearer ${idToken}` }
        });
        const cardsData = await cardsRes.json();
        
        const cardMap = {};
        if (cardsData.documents) {
            cardsData.documents.forEach(doc => {
                const docId = doc.name.split('/').pop(); // Format: {employeeId}_{YYYY-MM}
                cardMap[docId] = doc.fields || {};
            });
        }

        const absentNames = [];

        // 5. Evaluate Attendance Status for Every Employee
        employees.forEach(emp => {
            const cardId = `${emp.id}_${monthKey}`;
            const cardFields = cardMap[cardId] || {};
            const attendanceMap = cardFields.attendance?.mapValue?.fields || {};
            const dayRecord = attendanceMap[dayStr]?.mapValue?.fields || null;

            if (dayRecord) {
                const status = dayRecord.Status?.stringValue;
                const inTime = dayRecord.in?.stringValue;

                if (status === 'A') {
                    // Explicitly marked absent
                    absentNames.push(emp.name);
                } else if (status === 'P' || inTime) {
                    // Employee checked in / Present - NOT absent
                } else if (!isSunday && type === 'all') {
                    // Has record but no check-in
                    absentNames.push(emp.name);
                }
            } else {
                // No record for today
                if (!isSunday && type === 'all') {
                    // On a weekday, no check-in record means absent
                    absentNames.push(emp.name);
                }
            }
        });

        let message = "";
        if (absentNames.length === 0) {
            message = "No employees are absent today.";
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
