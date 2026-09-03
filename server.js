require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

const LINK4M_API_KEY = process.env.LINK4M_API_KEY;

const BASE_URL =
    process.env.BASE_URL ||
    `http://localhost:${PORT}`;

app.use(express.json());
app.use(express.static("public"));


// ================================
// GENERATE KEY
// ================================

function generateKey() {
    const random = crypto
        .randomBytes(12)
        .toString("hex")
        .toUpperCase();

    return `RBX-${random}`;
}


// ================================
// CREATE KEY
// ================================

function createKey(hours = 24) {
    let key;

    do {
        key = generateKey();
    } while (
        db.prepare(
            "SELECT id FROM keys WHERE key = ?"
        ).get(key)
    );

    const createdAt = Date.now();

    const expiresAt =
        createdAt +
        hours * 60 * 60 * 1000;

    db.prepare(`
        INSERT INTO keys (
            key,
            created_at,
            expires_at
        )
        VALUES (?, ?, ?)
    `).run(
        key,
        createdAt,
        expiresAt
    );

    return {
        key,
        createdAt,
        expiresAt
    };
}


// ================================
// SESSION TOKEN
// ================================

function generateSessionToken() {
    return crypto
        .randomBytes(32)
        .toString("hex");
}


// ================================
// CREATE SESSION
// ================================

function createSession() {
    let token;

    do {
        token = generateSessionToken();
    } while (
        db.prepare(
            "SELECT id FROM sessions WHERE token = ?"
        ).get(token)
    );

    const createdAt = Date.now();

    const expiresAt =
        createdAt +
        30 * 60 * 1000;

    db.prepare(`
        INSERT INTO sessions (
            token,
            created_at,
            expires_at,
            completed
        )
        VALUES (?, ?, ?, 0)
    `).run(
        token,
        createdAt,
        expiresAt
    );

    return {
        token,
        createdAt,
        expiresAt
    };
}


// ================================
// START
// ================================

app.get("/api/start", async (req, res) => {
    try {

        if (
            !LINK4M_API_KEY ||
            LINK4M_API_KEY === "YOUR_LINK4M_TOKEN"
        ) {
            return res.status(500).json({
                success: false,
                error: "Chưa cấu hình API token Link4M"
            });
        }


        const session = createSession();


        const destinationUrl =
            `${BASE_URL}/complete/${session.token}`;


        const apiUrl =
            "https://link4m.co/api-shorten/v2" +
            "?api=" +
            encodeURIComponent(LINK4M_API_KEY) +
            "&url=" +
            encodeURIComponent(destinationUrl);


        console.log("---------------------------------");
        console.log("Creating Link4M link...");
        console.log("DESTINATION:", destinationUrl);


        const response = await fetch(apiUrl, {
            redirect: "manual"
        });


        const location =
            response.headers.get("location");


        console.log(
            "LINK4M STATUS:",
            response.status
        );

        console.log(
            "LINK4M LOCATION:",
            location
        );


        // ==========================================
        // LINK4M REDIRECT
        // ==========================================

        if (
            response.status >= 300 &&
            response.status < 400 &&
            location
        ) {

            console.log(
                "Redirect detected."
            );

            console.log(
                "Using redirect URL:",
                location
            );

            console.log("---------------------------------");


            return res.json({
                success: true,
                url: location
            });
        }


        // ==========================================
        // LINK4M JSON RESPONSE
        // ==========================================

        const responseText =
            await response.text();


        console.log(
            "LINK4M RESPONSE:",
            responseText
        );


        let data;

        try {

            data =
                JSON.parse(responseText);

        } catch (error) {

            console.error(
                "Link4M JSON error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Link4M không trả về JSON",
                details:
                    responseText
            });
        }


        if (
            data.status !== "success" ||
            !data.shortenedUrl
        ) {

            return res.status(500).json({
                success: false,
                error:
                    "Không thể tạo Link4M",
                details:
                    data
            });
        }


        console.log(
            "SHORTENED URL:",
            data.shortenedUrl
        );

        console.log("---------------------------------");


        return res.json({
            success: true,
            url: data.shortenedUrl
        });

    } catch (error) {

        console.error(
            "START ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Lỗi tạo link",
            details:
                error.message
        });
    }
});


// ================================
// COMPLETE
// ================================

app.get("/complete/:token", (req, res) => {

    const token =
        String(
            req.params.token || ""
        ).trim();


    const session =
        db.prepare(`
            SELECT *
            FROM sessions
            WHERE token = ?
        `).get(token);


    if (!session) {

        return res.status(404).send(
            "Liên kết không hợp lệ."
        );
    }


    if (
        session.completed === 1
    ) {

        return res.status(403).send(
            "Liên kết này đã được sử dụng."
        );
    }


    if (
        Date.now() >=
        session.expires_at
    ) {

        return res.status(403).send(
            "Liên kết này đã hết hạn."
        );
    }


    db.prepare(`
        UPDATE sessions
        SET completed = 1
        WHERE id = ?
    `).run(
        session.id
    );


    const result =
        createKey(24);


    res.send(`

<!DOCTYPE html>

<html lang="vi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>Nhận Key</title>

<style>

body {

    font-family:
        Arial,
        sans-serif;

    background:
        #111;

    color:
        white;

    display:
        flex;

    min-height:
        100vh;

    align-items:
        center;

    justify-content:
        center;

    margin:
        0;
}

.box {

    background:
        #222;

    padding:
        30px;

    border-radius:
        12px;

    width:
        90%;

    max-width:
        500px;

    text-align:
        center;
}

.key {

    background:
        #333;

    padding:
        15px;

    margin-top:
        20px;

    border-radius:
        8px;

    word-break:
        break-all;
}

button {

    width:
        100%;

    margin-top:
        15px;

    padding:
        14px;

    cursor:
        pointer;
}

</style>

</head>

<body>

<div class="box">

<h1>
    Nhận Key Thành Công
</h1>

<p>
    Key có hiệu lực trong 24 giờ.
</p>

<div
    class="key"
    id="key"
>
    ${result.key}
</div>

<button onclick="copyKey()">
    SAO CHÉP KEY
</button>

</div>

<script>

function copyKey() {

    const key =
        document
            .getElementById("key")
            .innerText
            .trim();

    navigator.clipboard
        .writeText(key);

    alert(
        "Đã sao chép key!"
    );
}

</script>

</body>

</html>

    `);
});


// ================================
// CHECK KEY
// ================================

app.get("/api/check-key", (req, res) => {

    const key =
        String(
            req.query.key || ""
        ).trim();


    if (!key) {

        return res.status(400).json({
            valid: false,
            error: "Thiếu key"
        });
    }


    const data =
        db.prepare(`
            SELECT *
            FROM keys
            WHERE key = ?
        `).get(key);


    if (!data) {

        return res.json({
            valid: false
        });
    }


    if (
        Date.now() >=
        data.expires_at
    ) {

        return res.json({
            valid: false,
            expired: true
        });
    }


    return res.json({
        valid: true,
        expiresAt:
            data.expires_at
    });

});


// ================================
// SERVER
// ================================

app.listen(
    PORT,
    () => {

        console.log(
            "================================="
        );

        console.log(
            " Roblox Key System"
        );

        console.log(
            "================================="
        );

        console.log(
            `Website: http://localhost:${PORT}`
        );

    }
);
