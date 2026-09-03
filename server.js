require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const db = require("./database");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL =
    process.env.BASE_URL ||
    `http://localhost:${PORT}`;

const LINK4M_FIXED_URL =
    process.env.LINK4M_FIXED_URL;


// =====================================================
// OWNER / PERMANENT KEYS
// =====================================================
// Đặt 2 key này trong Render > Environment.
// KHÔNG ghi key thật vào GitHub.
//
// OWNER_KEY_1
// OWNER_KEY_2
//
// Owner key:
// - Vĩnh viễn
// - Không cần Link4M
// - Không cần HWID
// - Không lưu vào database
// =====================================================

const OWNER_KEY_1 =
    String(
        process.env.OWNER_KEY_1 || ""
    ).trim();

const OWNER_KEY_2 =
    String(
        process.env.OWNER_KEY_2 || ""
    ).trim();

const OWNER_KEYS =
    new Set(
        [
            OWNER_KEY_1,
            OWNER_KEY_2
        ].filter(Boolean)
    );


app.use(
    express.json()
);

app.use(
    express.static("public")
);


// =====================================================
// GENERATE KEY
// =====================================================

function generateKey() {

    const random =
        crypto
            .randomBytes(12)
            .toString("hex")
            .toUpperCase();

    return `RBX-${random}`;
}


// =====================================================
// CREATE NORMAL KEY
// =====================================================

function createKey(hours = 24) {

    let key;

    do {

        key =
            generateKey();

    } while (
        db.prepare(
            "SELECT id FROM keys WHERE key = ?"
        ).get(key)
    );


    const createdAt =
        Date.now();

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


// =====================================================
// GENERATE SESSION TOKEN
// =====================================================

function generateSessionToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");
}


// =====================================================
// CREATE SESSION
// =====================================================

function createSession() {

    let token;

    do {

        token =
            generateSessionToken();

    } while (
        db.prepare(
            "SELECT id FROM sessions WHERE token = ?"
        ).get(token)
    );


    const createdAt =
        Date.now();

    // Session Link4M có hiệu lực 30 phút.
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


// =====================================================
// COOKIE PARSER
// =====================================================

function parseCookies(req) {

    const header =
        req.headers.cookie || "";

    const cookies = {};


    header
        .split(";")
        .forEach(part => {

            const index =
                part.indexOf("=");


            if (
                index === -1
            ) {
                return;
            }


            const name =
                part
                    .slice(
                        0,
                        index
                    )
                    .trim();


            const value =
                part
                    .slice(
                        index + 1
                    )
                    .trim();


            cookies[name] =
                decodeURIComponent(
                    value
                );

        });


    return cookies;
}


// =====================================================
// SET SESSION COOKIE
// =====================================================

function setSessionCookie(
    res,
    token
) {

    const isProduction =
        process.env.NODE_ENV ===
        "production";


    let cookie =
        `key_session=${encodeURIComponent(token)}; ` +
        `Path=/; ` +
        `HttpOnly; ` +
        `SameSite=Lax; ` +
        `Max-Age=1800`;


    if (
        isProduction
    ) {

        cookie +=
            "; Secure";

    }


    res.setHeader(
        "Set-Cookie",
        cookie
    );
}


// =====================================================
// START KEY SYSTEM
// =====================================================

app.get(
    "/api/start",
    (req, res) => {

        try {

            if (
                !LINK4M_FIXED_URL
            ) {

                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "Chưa cấu hình LINK4M_FIXED_URL trên Render."

                    });

            }


            // Tạo session mới.
            const session =
                createSession();


            // Lưu session vào cookie.
            setSessionCookie(
                res,
                session.token
            );


            console.log(
                "---------------------------------"
            );

            console.log(
                "New key session:",
                session.token
            );

            console.log(
                "Link4M:",
                LINK4M_FIXED_URL
            );

            console.log(
                "---------------------------------"
            );


            return res.json({

                success: true,

                url:
                    LINK4M_FIXED_URL

            });


        } catch (error) {

            console.error(
                "START ERROR:",
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Không thể tạo session."

                });

        }

    }
);


// =====================================================
// COMPLETE LINK4M
// =====================================================

app.get(
    "/complete",
    (req, res) => {

        try {

            const cookies =
                parseCookies(req);


            const token =
                String(
                    cookies.key_session ||
                    ""
                ).trim();


            // Không có session.
            if (
                !token
            ) {

                return res
                    .status(403)
                    .send(`

<!DOCTYPE html>

<html lang="vi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>Không hợp lệ</title>

</head>

<body style="
    background:#111;
    color:white;
    font-family:Arial;
    text-align:center;
    padding:50px;
">

<h1>
    Liên kết không hợp lệ
</h1>

<p>
    Vui lòng quay lại trang nhận key
    và vượt Link4M trước.
</p>

</body>

</html>

                    `);

            }


            // Tìm session.
            const session =
                db.prepare(`
                    SELECT *
                    FROM sessions
                    WHERE token = ?
                `).get(token);


            if (
                !session
            ) {

                return res
                    .status(403)
                    .send(
                        "Session không hợp lệ."
                    );

            }


            // Session đã dùng.
            if (
                session.completed === 1
            ) {

                return res
                    .status(403)
                    .send(`

<!DOCTYPE html>

<html lang="vi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>Đã sử dụng</title>

</head>

<body style="
    background:#111;
    color:white;
    font-family:Arial;
    text-align:center;
    padding:50px;
">

<h1>
    Session đã được sử dụng
</h1>

<p>
    Muốn nhận key tiếp theo,
    bạn phải vượt Link4M lại.
</p>

</body>

</html>

                    `);

            }


            // Session hết hạn.
            if (
                Date.now() >=
                session.expires_at
            ) {

                return res
                    .status(403)
                    .send(`

<!DOCTYPE html>

<html lang="vi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>Hết hạn</title>

</head>

<body style="
    background:#111;
    color:white;
    font-family:Arial;
    text-align:center;
    padding:50px;
">

<h1>
    Session đã hết hạn
</h1>

<p>
    Vui lòng quay lại và thử lại.
</p>

</body>

</html>

                    `);

            }


            // Đánh dấu session đã hoàn thành.
            db.prepare(`
                UPDATE sessions
                SET completed = 1
                WHERE id = ?
            `).run(
                session.id
            );


            // Tạo key thường 24 giờ.
            const result =
                createKey(24);


            // Xóa cookie session.
            res.setHeader(
                "Set-Cookie",
                "key_session=; Path=/; HttpOnly; Max-Age=0"
            );


            console.log(
                "KEY CREATED:",
                result.key
            );


            return res.send(`

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

* {
    box-sizing: border-box;
}


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

    font-weight:
        bold;

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

    border:
        none;

    border-radius:
        8px;

    font-weight:
        bold;

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


<button
    onclick="copyKey()"
>

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


    navigator
        .clipboard
        .writeText(key)
        .then(() => {

            alert(
                "Đã sao chép key!"
            );

        })
        .catch(() => {

            alert(
                "Không thể tự động sao chép."
            );

        });

}

</script>


</body>

</html>

            `);


        } catch (error) {

            console.error(
                "COMPLETE ERROR:",
                error
            );


            return res
                .status(500)
                .send(
                    "Có lỗi xảy ra khi cấp key."
                );

        }

    }
);


// =====================================================
// CHECK KEY
// =====================================================

app.get(
    "/api/check-key",
    (req, res) => {

        const key =
            String(
                req.query.key ||
                ""
            ).trim();


        // ---------------------------------------------
        // KIỂM TRA KEY CÓ NHẬP KHÔNG
        // ---------------------------------------------

        if (
            !key
        ) {

            return res
                .status(400)
                .json({

                    valid: false,

                    error:
                        "Thiếu key"

                });

        }


        // =================================================
        // OWNER KEY
        // =================================================
        //
        // OWNER_KEY_1 và OWNER_KEY_2 nằm trong Render ENV.
        //
        // Hai key này:
        // - Vĩnh viễn
        // - Không cần HWID
        // - Không cần database
        // - Không cần Link4M
        // =================================================

        if (
            OWNER_KEYS.has(key)
        ) {

            console.log(
                "OWNER KEY USED"
            );


            return res.json({

                valid: true,

                permanent: true,

                owner: true

            });

        }


        // =================================================
        // KEY THƯỜNG
        // =================================================

        const hwid =
            String(
                req.query.hwid ||
                ""
            ).trim();


        if (
            !hwid
        ) {

            return res
                .status(400)
                .json({

                    valid: false,

                    error:
                        "Không lấy được mã máy"

                });

        }


        // Tìm key trong database.
        const data =
            db.prepare(`
                SELECT *
                FROM keys
                WHERE key = ?
            `).get(key);


        // Key không tồn tại.
        if (
            !data
        ) {

            return res.json({

                valid: false

            });

        }


        // Key hết hạn.
        if (
            Date.now() >=
            data.expires_at
        ) {

            return res.json({

                valid: false,

                expired: true

            });

        }


        // =================================================
        // BIND HWID LẦN ĐẦU
        // =================================================
        //
        // Key chưa được dùng:
        // khóa vào máy đầu tiên nhập key.
        // =================================================

        if (
            !data.hwid
        ) {

            db.prepare(`
                UPDATE keys
                SET hwid = ?
                WHERE id = ?
            `).run(
                hwid,
                data.id
            );


            console.log(
                "KEY BOUND:",
                key
            );


            return res.json({

                valid: true,

                bound: true,

                expiresAt:
                    data.expires_at

            });

        }


        // =================================================
        // KIỂM TRA HWID
        // =================================================

        if (
            data.hwid !== hwid
        ) {

            return res.json({

                valid: false,

                bound: true,

                error:
                    "Key đã được khóa cho máy khác."

            });

        }


        // =================================================
        // KEY HỢP LỆ TRÊN ĐÚNG MÁY
        // =================================================

        return res.json({

            valid: true,

            expiresAt:
                data.expires_at

        });

    }
);


// =====================================================
// SERVER
// =====================================================

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
            `Website: ${BASE_URL}`
        );

        console.log(
            `Owner keys configured: ${OWNER_KEYS.size}/2`
        );

        console.log(
            "================================="
        );

    }
);
