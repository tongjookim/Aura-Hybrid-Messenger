/**
 * WP Realtime Secure Chat - Node.js Socket.io 서버 (수정판)
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { authMiddleware } = require('./auth');
const RoomManager = require('./roomManager');
const PresenceManager = require('./presenceManager');

const PORT = process.env.PORT || 3201;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim());

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: true, // 🚀 [수정] ALLOWED_ORIGINS 대신 true로 변경 (모든 출처 자동 허용)
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
});

//app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// 임시 DB 역할을 할 메모리 저장소 (실무에서는 DB 테이블로 교체)
const userPublicKeys = new Map(); // 사용자별 자물쇠(공개키) 보관소
const roomSecrets = new Map();    // 방+사용자별 잠긴 비밀번호 보관소

const roomManager = new RoomManager();
const presenceManager = new PresenceManager();
roomManager.createDefaultRoom();

const axios = require('axios');

const jwt = require('jsonwebtoken'); // JWT 모듈
const sqlite3 = require('sqlite3').verbose(); // SQLite 모듈

// 🚀 SQLite DB 초기화 및 테이블 생성
const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) console.error('DB 연결 실패:', err.message);
    else console.log('✅ SQLite DB 연결 성공');
});

const admin = require('firebase-admin');
const serviceAccount = require("./firebase-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// [중요] 특정 사용자에게 푸시를 보내는 함수
async function sendPushNotification(fcmToken, title, message) {
  const payload = {
    notification: {
      title: title,
      body: message,
    },
    // 앱이 꺼져 있어도 웹뷰 주소를 열 수 있게 데이터 추가
    data: {
      url: "https://aura.swnest.net" 
    }
  };

  try {
    const response = await admin.messaging().sendToDevice(fcmToken, payload);
    console.log("Successfully sent push:", response);
  } catch (error) {
    console.error("Error sending push:", error);
  }
}

// Socket.io에서 메시지 수신 시 호출
io.on('connection', (socket) => {
  socket.on('new_message', (data) => {
    // 1. DB에서 상대방의 fcmToken을 가져옵니다.
    // 2. 푸시 전송
    if (data.targetUserToken) {
        sendPushNotification(data.targetUserToken, "신규 메시지", data.message);
    }
  });
});

// 🚀 [서버 시작 시 실행] DB에 저장된 모든 방 정보를 메모리로 복구
function restoreRoomsFromDB() {
    db.all("SELECT * FROM chat_rooms", [], (err, rows) => {
        if (err) return console.error("방 복구 실패:", err);
        
        rows.forEach(row => {
            const room = {
                id: row.roomId,
                name: row.name,
                type: row.type,
                createdBy: row.createdBy,
                dmPair: row.dmPair ? JSON.parse(row.dmPair) : null,
                users: new Map(), // 실시간 접속자는 비워둠
                createdAt: Date.now()
            };
            roomManager.rooms.set(row.roomId, room);
        });
        console.log(`[DB 복구] 총 ${rows.length}개의 방을 메모리에 로드했습니다.`);
    });
}

// ✅ 🚀 [신규 추가] REST API용 인증 미들웨어
// 헤더에 담긴 Bearer 토큰을 확인하여 유저 정보를 req.user에 담아줍니다.
const authMiddlewareRest = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN" 에서 TOKEN만 추출

    if (!token) {
        return res.status(401).json({ error: '인증 토큰이 없습니다.' });
    }

    const secretKey = process.env.JWT_SECRET || 'your_secret_key_here';
    
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
        }
        req.user = decoded; // 다음 단계(라우터)에서 유저 정보를 사용할 수 있게 저장
        next(); // 검사 통과! 다음으로 진행
    });
};

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (userId TEXT PRIMARY KEY, password TEXT, displayName TEXT, phoneNumber TEXT UNIQUE)");
    db.run("CREATE TABLE IF NOT EXISTS friends (userId TEXT, friendId TEXT, PRIMARY KEY(userId, friendId))");
    db.run("CREATE TABLE IF NOT EXISTS public_keys (userId TEXT PRIMARY KEY, publicKey TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS room_secrets (storageKey TEXT PRIMARY KEY, encryptedSecret TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS chat_rooms (roomId TEXT PRIMARY KEY, name TEXT, type TEXT, createdBy TEXT, dmPair TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS synced_contacts (ownerId TEXT, contactName TEXT, phoneNumber TEXT, UNIQUE(ownerId, phoneNumber))");    
    restoreRoomsFromDB();
});

// ✅ 유저 상태 메시지 (메모리 보관 - 서버 재시작 시 소멸)
const userStatuses = new Map(); // userId → statusMessage

// ============================================================
// REST 라우트
// ============================================================

// ✅ 루트 경로 (Cannot GET / 해결)
app.get('/', (req, res) => {
    res.json({
        name: 'WP Realtime Secure Chat Server',
        status: 'running',
        connections: presenceManager.getOnlineCount(),
        rooms: roomManager.rooms.size,
        uptime: Math.floor(process.uptime()) + 's',
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        connections: io.engine.clientsCount,
        rooms: roomManager.rooms.size,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    });
});

// 디버그용 상태 페이지
app.get('/status', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Chat Server</title></head>
        <body style="font-family:sans-serif;padding:40px;">
            <h2>✅ Chat Server Running</h2>
            <p>Connections: ${presenceManager.getOnlineCount()}</p>
            <p>Rooms: ${roomManager.rooms.size}</p>
            <p>Uptime: ${Math.floor(process.uptime())}s</p>
            <p>Socket.io client: <a href="/socket.io/socket.io.js">/socket.io/socket.io.js</a> (이 링크가 열리면 정상)</p>
            <h3>CORS Allowed Origins:</h3>
            <pre>${ALLOWED_ORIGINS.join('\n')}</pre>
        </body></html>
    `);
});

// 🚀 1. 회원가입 API
app.post('/api/register', (req, res) => {
    const { userId, password, displayName, phoneNumber } = req.body;
    if (!userId || !password || !displayName || !phoneNumber) {
        return res.status(400).json({ error: '모든 정보를 입력해주세요.' });
    }

    // 번호에서 숫자만 추출 (010-1234-5678 -> 01012345678)
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    db.run(
        "INSERT INTO users (userId, password, displayName, phoneNumber) VALUES (?, ?, ?, ?)", 
        [userId, password, displayName, normalizedPhone], 
        function(err) {
            if (err) {
                console.error(err.message);
                return res.status(400).json({ error: '이미 존재하는 아이디 또는 전화번호입니다.' });
            }
            res.json({ success: true, message: '회원가입 완료!' });
        }
    );
});

// 🚀 주소록 동기화 API (새로 추가)
app.post('/api/contacts/sync', authMiddlewareRest, (req, res) => {
    // 앱에서 [{name: "홍길동", number: "010-1234-5678"}, ...] 형태로 보낸다고 가정
    const { contacts } = req.body; 
    const myId = req.user.userId;

    if (!contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ error: '주소록 데이터가 필요합니다.' });
    }

    if (contacts.length === 0) return res.json({ members: [], nonMembers: [] });

    // 1. 모든 연락처를 synced_contacts 테이블에 INSERT OR IGNORE로 저장 (이름 포함)
    const insertStmt = db.prepare("INSERT OR IGNORE INTO synced_contacts (ownerId, contactName, phoneNumber) VALUES (?, ?, ?)");
    
    // 전화번호 정규화 및 가입자 검색을 위한 배열 준비
    const cleanNumbers = [];
    const contactMap = new Map(); // 번호 -> 이름 매핑 (나중에 비회원 이름 찾을 때 사용)

    contacts.forEach(c => {
        if(c && c.number) {
           const cleanNum = c.number.replace(/\D/g, '');
           cleanNumbers.push(cleanNum);
           contactMap.set(cleanNum, c.name || '이름 없음');
           insertStmt.run(myId, c.name || '이름 없음', cleanNum);
        }
    });
    insertStmt.finalize();

    // 2. 가입된 유저 찾기
    const placeholders = cleanNumbers.map(() => '?').join(',');
    const query = `SELECT userId, displayName, phoneNumber FROM users WHERE phoneNumber IN (${placeholders}) AND userId != ?`;

    db.all(query, [...cleanNumbers, myId], (err, members) => {
        if (err) return res.status(500).json({ error: '조회 실패' });

        // 3. 비회원(문자 전송 대상) 분류 및 이름 매칭
        const memberPhones = members.map(m => m.phoneNumber);
        const nonMembers = cleanNumbers
            .filter(phone => !memberPhones.includes(phone))
            .map(phone => ({
                phoneNumber: phone,
                contactName: contactMap.get(phone) // 맵에서 이름 찾아오기
            }));

        // 4. (선택) 찾은 유저는 자동으로 친구 테이블에 등록
        const friendInsertStmt = db.prepare("INSERT OR IGNORE INTO friends (userId, friendId) VALUES (?, ?)");
        members.forEach(m => friendInsertStmt.run(myId, m.userId));
        friendInsertStmt.finalize();

        res.json({
            success: true,
            members: members,     // 아우라 회원 (채팅 가능)
            nonMembers: nonMembers // 비회원 (객체 배열: {phoneNumber, contactName})
        });
    });
});

// 🚀 [신규 추가] 새로고침 시 저장된 주소록 불러오기 API
app.get('/api/contacts/list', authMiddlewareRest, (req, res) => {
    const myId = req.user.userId;

    // 1. 내가 동기화했던 모든 연락처 가져오기
    db.all("SELECT contactName, phoneNumber FROM synced_contacts WHERE ownerId = ?", [myId], (err, allContacts) => {
        if (err) return res.status(500).json({ error: '주소록 조회 실패' });
        
        if (!allContacts || allContacts.length === 0) {
            return res.json({ success: true, members: [], nonMembers: [] });
        }

        const phoneNumbers = allContacts.map(c => c.phoneNumber);
        const placeholders = phoneNumbers.map(() => '?').join(',');
        
        // 2. 그 중에서 아우라 가입자 찾기
        const query = `SELECT userId, displayName, phoneNumber FROM users WHERE phoneNumber IN (${placeholders}) AND userId != ?`;
        
        db.all(query, [...phoneNumbers, myId], (err, members) => {
             if (err) return res.status(500).json({ error: '가입자 조회 실패' });

             const memberPhones = members.map(m => m.phoneNumber);
             
             // 3. 가입하지 않은 사람(비회원) 필터링 (이름 포함)
             const nonMembers = allContacts.filter(c => !memberPhones.includes(c.phoneNumber));

             res.json({
                 success: true,
                 members: members,
                 nonMembers: nonMembers
             });
        });
    });
});

// 🚀 2. 로그인 API (토큰 발급)
app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    db.get("SELECT * FROM users WHERE userId = ? AND password = ?", [userId, password], (err, row) => {
        if (err || !row) return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다.' });

        const secretKey = process.env.JWT_SECRET || 'your_secret_key_here';
        const payload = { userId: row.userId, displayName: row.displayName, isGuest: false };
        const token = jwt.sign(payload, secretKey, { expiresIn: '24h' });
        
        res.json({ success: true, token: token, displayName: row.displayName, phoneNumber: row.phoneNumber });
    });
});

// Express 라우터에 추가
app.post('/api/update-token', async (req, res) => {
  const { userId, fcmToken } = req.body;
  
  // DB에서 해당 userId의 fcm_token 컬럼을 업데이트하는 로직을 작성하세요.
  // 예: await User.update({ fcm_token: fcmToken }, { where: { id: userId } });
  
  console.log(`User ${userId} token updated: ${fcmToken}`);
  res.sendStatus(200);
});

// ============================================================
// Socket.io
// ============================================================

//io.use(authMiddleware);
io.use((socket, next) => {
    const authData = socket.handshake.auth;
    
    // 1️⃣ [독립형 하이패스] 프론트엔드에서 isStandalone 꼬리표를 달고 온 경우
    if (authData && authData.isStandalone) {
        if (authData.token) {
            try {
                const secretKey = process.env.JWT_SECRET || 'your_secret_key_here';
                const decoded = jwt.verify(authData.token, secretKey);
                
                socket.user = {
                    userId: decoded.userId,
                    displayName: decoded.displayName, // SQLite에서 빼온 이름
                    avatarUrl: '',
                    isGuest: false,
                    isStandalone: true 
                };
                return next(); // 통과!
            } catch (err) {
                return next(new Error('독립형 앱 토큰이 만료되었거나 유효하지 않습니다.'));
            }
        }
        return next(new Error('인증 토큰이 없습니다.'));
    }

    // 2️⃣ [워드프레스 일반 차로] 꼬리표가 없으면 무조건 기존 auth.js 에게 토스!
    // (워드프레스의 복잡한 토큰 구조와 닉네임을 원래대로 완벽하게 처리해 줍니다)
    return authMiddleware(socket, next);
});

io.on('connection', (socket) => {
    const user = socket.user;
    
    // 🚨 1. 유저 정보가 없으면 튕겨냅니다 (서버 다운 방지)
    if (!user) {
        console.log('[Socket] 비정상적인 접근 차단');
        return socket.disconnect();
    }

    console.log(`[Socket] Connected: ${user.displayName} (${user.userId})`);

    // 2. 접속 상태 업데이트 (온라인 표시)
    presenceManager.userConnected(socket.id, user);

    socket.emit('auth:success', {
        userId: user.userId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isGuest: user.isGuest,
    });

    io.emit('users:list', presenceManager.getOnlineUserList());
    socket.broadcast.emit('user:joined', {
        userId: user.userId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isGuest: user.isGuest,
    });
    
    // 🚀 3. 내 방 목록 불러오기 & 소켓 재연결 (나와의 채팅 완벽 지원)
    const myRooms = roomManager.getUserRooms(user.userId).map(roomData => {
        const internalRoom = roomManager.getRoom(roomData.id);
        
        if (internalRoom) {
            // [핵심] 로그아웃 후 재접속 시, 소켓을 방에 다시 연결(Join)
            socket.join(internalRoom.id);
            internalRoom.users.set(user.userId, { ...user, socketId: socket.id });

            // 상대방 찾기
            if (internalRoom.dmPair) {
                roomData.otherUserId = internalRoom.dmPair.find(id => String(id) !== String(user.userId)) || user.userId;
            } else if (internalRoom.users) {
                let foundOther = false;
                for (let uid of internalRoom.users.keys()) {
                    if (String(uid) !== String(user.userId)) {
                        roomData.otherUserId = uid;
                        foundOther = true;
                        break;
                    }
                }
                if (!foundOther) {
                    roomData.otherUserId = user.userId;
                }
            }
        }
        return roomData;
    });

    socket.emit('rooms:list', myRooms);

    // 채팅방 생성
    socket.on('room:create', (data) => {
        const { name, type } = data || {};
        if (!name || typeof name !== 'string') return;
        const sanitizedName = name.replace(/[<>&"']/g, '').slice(0, 50);
        const room = roomManager.createRoom(sanitizedName, type, user.userId);
        room.source = 'wp';
        roomManager.joinRoom(room.id, { ...user, socketId: socket.id });
        socket.join(room.id);
        io.emit('room:created', roomManager.serializeRoom(room));
        socket.emit('room:joined', roomManager.serializeRoom(room));
    });

    // 🚀 [추가 2] 클라이언트가 "이 방 워드프레스 출신이야!" 라고 알려줄 때 꼬리표 달기
    socket.on('room:flag', (data) => {
        const { roomId, source } = data;
        const room = roomManager.getRoom(roomId);
        if (room) {
            room.source = source; // 방 객체에 source='wp' 꼬리표 저장
            console.log(`[WP 방 꼬리표 부착] 방 ID: ${roomId}`);
        }
    });

    // 🚀 [추가 3] DB엔 있는데 메모리엔 없는 방을 강제로 살려내기
    socket.on('room:restore', (data) => {
        const { roomId, name, type } = data;
        let room = roomManager.getRoom(roomId);
        
        if (!room) {
            console.log(`[방 부활] 지워졌던 WP 방(${roomId})을 다시 생성합니다.`);
            
            // 기존 방 생성 함수를 활용하되, ID를 기존 ID로 강제 덮어씌웁니다.
            // (서버의 roomManager 구조에 맞춰 살짝 수정이 필요할 수 있습니다.)
            room = roomManager.createRoom(name || "복구된 대화방", type || "public", user.userId);
            
            // 기존 ID로 강제 교체 및 꼬리표 부착
            roomManager.rooms.delete(room.id); // 새로 발급된 임시 ID 삭제
            room.id = roomId;                  // 과거 DB의 ID로 덮어쓰기
            room.source = 'wp';                // 삭제 방지 꼬리표 달기
            
            roomManager.rooms.set(roomId, room); // 방 목록에 다시 등록
        }
        
        // 방이 부활했으니 정상적으로 입장 처리
        roomManager.joinRoom(roomId, { ...user, socketId: socket.id });
        socket.join(roomId);
        
        // 🚀 [수정] 복구할 때도 상대방 ID 찾아서 넣어주기
        const restoredRoomData = roomManager.serializeRoom(room);
        if (room.users) {
            for (let uid of room.users.keys()) {
                if (String(uid) !== String(user.userId)) {
                    restoredRoomData.otherUserId = uid;
                    break;
                }
            }
        }
        socket.emit('room:joined', restoredRoomData);
    });

    // 🚀 [추가] 친구 추가 기능
    socket.on('friend:add', (data) => {
        const targetUserId = data.targetUserId;
        if (targetUserId === user.userId) return socket.emit('message:system', '자기 자신은 추가할 수 없습니다.');

        db.get("SELECT userId, displayName FROM users WHERE userId = ?", [targetUserId], (err, row) => {
            if (err || !row) return socket.emit('message:system', '존재하지 않는 사용자 아이디입니다.');
            
            db.run("INSERT INTO friends (userId, friendId) VALUES (?, ?)", [user.userId, targetUserId], function(insertErr) {
                if (insertErr) return socket.emit('message:system', '이미 추가된 친구입니다.');
                
                sendFriendList(user.userId, socket);
                socket.emit('message:system', `${row.displayName}님을 친구로 추가했습니다.`);
            });
        });
    });

    // 🚀 [추가] 내 친구 목록 요청
    socket.on('friend:request-list', () => {
        sendFriendList(user.userId, socket);
    });

    // 🚀 친구 목록 조회 도우미 함수
    function sendFriendList(userId, targetSocket) {
        const query = `
            SELECT u.userId, u.displayName 
            FROM friends f 
            JOIN users u ON f.friendId = u.userId 
            WHERE f.userId = ?
        `;
        db.all(query, [userId], (err, rows) => {
            if (!err && rows) {
                targetSocket.emit('friend:list', rows);
            }
        });
    }

    // 1:1 DM
    socket.on('room:create-dm', (data) => {
        const { targetUserId } = data || {};
        if (!targetUserId) return;
        const target = presenceManager.getUser(targetUserId);
        if (!target) {
            socket.emit('message:system', '해당 사용자가 오프라인입니다.');
            return;
        }
        const room = roomManager.findOrCreateDM(
            user.userId, user.displayName,
            targetUserId, target.displayName
        );
        roomManager.joinRoom(room.id, { ...user, socketId: socket.id });
        socket.join(room.id);
        const targetSocketId = presenceManager.getSocketId(targetUserId);
        if (targetSocketId) {
            roomManager.joinRoom(room.id, { ...target, socketId: targetSocketId });
            io.to(targetSocketId).socketsJoin(room.id);
            
            const targetRoomData = roomManager.serializeRoom(room);
            targetRoomData.otherUserId = user.userId; // 상대방 입장에선 내가 otherUser!
            io.to(targetSocketId).emit('room:created', targetRoomData);
        }
        
        const myRoomData = roomManager.serializeRoom(room);
        myRoomData.otherUserId = targetUserId; // 내 입장에선 target이 otherUser!
        socket.emit('room:joined', myRoomData);
    });

    // 방 참여
    socket.on('room:join', (data) => {
            socket.join(data.roomId);
            
            // 🚀 방에 입장할 때 해당 방의 텍스트 파일을 읽어옵니다.
            const logFilePath = path.join(chatLogDir, `${data.roomId}.txt`);
            
            if (fs.existsSync(logFilePath)) {
                // 파일을 읽어서 줄바꿈(\n) 단위로 쪼갠 뒤, 다시 JSON 객체로 조립합니다.
                const fileContent = fs.readFileSync(logFilePath, 'utf8');
                const history = fileContent
                    .split('\n')
                    .filter(line => line.trim() !== '') // 빈 줄 제거
                    .map(line => JSON.parse(line));     // 문자열을 다시 객체로 변환

                // 클라이언트에게 과거 대화 기록을 쏴줍니다.
                socket.emit('chat:history', history);
            } else {
                // 파일이 없으면 처음 만들어진 방이므로 빈 배열을 보냅니다.
                socket.emit('chat:history', []);
            }
        });

    // 방 나가기
    socket.on('room:leave', (data) => {
        const { roomId } = data || {};
        if (!roomId) return;
        socket.leave(roomId);
        const result = roomManager.leaveRoom(roomId, user.userId);
        if (result?.deleted) { io.emit('room:deleted', roomId); }
        else if (result) {
            socket.to(roomId).emit('message:system', `${user.displayName}님이 퇴장했습니다.`);
            io.emit('room:updated', roomManager.serializeRoom(result));
        }
    });

    // 초대
    socket.on('room:invite', (data) => {
        const { roomId, userId: targetId } = data || {};
        if (!roomId || !targetId) return;
        const target = presenceManager.getUser(targetId);
        const targetSocketId = target ? presenceManager.getSocketId(targetId) : null;
        const room = roomManager.getRoom(roomId);
        if (!target || !targetSocketId || !room) return;
        roomManager.joinRoom(roomId, { ...target, socketId: targetSocketId });
        io.to(targetSocketId).socketsJoin(roomId);
        io.to(targetSocketId).emit('room:joined', roomManager.serializeRoom(room));
        io.to(roomId).emit('message:system', `${target.displayName}님이 초대되었습니다.`);
        io.to(roomId).emit('room:updated', roomManager.serializeRoom(room));
    });

    // ✅ 메시지 전송 (실시간 중계 + DB 저장 연동)
    socket.on('message:send', async (data) => {
        const { roomId, text, image } = data || {};
        
        // 유효성 검사: 텍스트나 이미지 중 하나는 필수
        if (!roomId || (!text && !image)) return; 
        
        const room = roomManager.getRoom(roomId);
        if (!room || !room.users.has(user.userId)) return;

        // 방 상태 업데이트
        room.hasMessages = true;

        // 🚨 욕설 필터링은 프론트엔드(암호화 전)로 책임을 넘겼다고 가정하고 삭제!
        // (만약 E2EE를 포기하고 평문으로 통신한다면 기존 axios 로직을 여기에 두시면 됩니다.)
        const finalMessageText = text || ""; 

        // 1. 실시간 브로드캐스트 (클라이언트로 즉시 전송)
        const messagePayload = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            roomId,
            userId: user.userId,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            text: finalMessageText, // 🔒 암호문이 그대로 들어감
            image: image,           // ⚠️ (주의) 이미지는 파일 경로로 보내는 것을 강력 권장!
            timestamp: Date.now(),
        };

        io.to(roomId).emit('message:receive', messagePayload);

        // 🚀 2. [추가] 텍스트 파일에 기록 저장 (그래야 나중에 읽어올 수 있음!)
        try {
            const fs = require('fs');
            const path = require('path');
            const logFilePath = path.join(chatLogDir, `${roomId}.txt`);
            // 한 줄씩 JSON 형태로 추가 저장
            fs.appendFileSync(logFilePath, JSON.stringify(messagePayload) + '\n');
        } catch (err) {
            console.error("파일 저장 실패:", err);
        }

        // 3. FastAPI 백엔드에 영구 저장 (await로 깔끔하게 통일)
        try {
            const response = await fetch('https://www.mocam.xyz/api/chat/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: roomId,
                    user_id: user.userId,
                    user_name: user.displayName,
                    content: finalMessageText,
                    image_data: image 
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log(`[DB 저장 성공] ${user.displayName}`);
        } catch (e) {
            console.error("🔴 DB 저장 에러:", e.message);
        }
    });

    // 타이핑
    socket.on('typing:start', (data) => {
        if (!data?.roomId) return;
        socket.to(data.roomId).emit('typing:show', { userId: user.userId, displayName: user.displayName, roomId: data.roomId });
    });
    socket.on('typing:stop', (data) => {
        if (!data?.roomId) return;
        socket.to(data.roomId).emit('typing:hide', { userId: user.userId, roomId: data.roomId });
    });

    // 닉네임 변경
    socket.on('user:change-name', (data) => {
        const { displayName: newName } = data || {};
        if (!newName || typeof newName !== 'string') return;
        user.displayName = newName.replace(/[<>&"']/g, '').slice(0, 20);
        presenceManager.updateDisplayName(user.userId, user.displayName);
        io.emit('users:list', presenceManager.getOnlineUserList());
    });

    // ✅ 상태 메시지 설정
    socket.on('user:set-status', ({ statusMessage }) => {
        const sanitized = (statusMessage || '').replace(/[<>&"']/g, '').slice(0, 100);
        userStatuses.set(user.userId, sanitized);
        io.emit('user:status-changed', {
            userId: user.userId,
            statusMessage: sanitized,
        });
    });

    // ✅ 전체 상태 메시지 요청 (나중에 접속한 사용자용)
    socket.on('users:request-statuses', () => {
        const statusMap = {};
        userStatuses.forEach((msg, uid) => {
            if (msg) statusMap[uid] = msg;
        });
        socket.emit('users:statuses', statusMap);
    });

    // 연결 해제
    socket.on('disconnect', (reason) => {
        console.log(`[Socket] Disconnected: ${user.displayName} (${reason})`);
        presenceManager.userDisconnected(socket.id);
        userStatuses.delete(user.userId); // ✅ 상태 메시지 정리
        const affectedRooms = roomManager.removeUserFromAllRooms(user.userId);
        
        affectedRooms.forEach((roomId) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                io.to(roomId).emit('message:system', `${user.displayName}님이 퇴장했습니다.`);
                io.emit('room:updated', roomManager.serializeRoom(room));
                
                // ✅ 방이 비었을 때의 삭제 로직 수정
                if (room.users && room.users.size === 0) {
                    // 🚀 [추가 1] 꼬리표가 'wp'인 워드프레스 방은 절대 지우지 않고 리턴!
                    if (room.source === 'wp') {
                        console.log(`[WP 방 유지] ${room.id} 방은 사람이 없어도 유지됩니다.`);
                        return; // 삭제 로직 취소
                    }

                    // 🚀 [수정] 메시지가 한 개라도 있는 방은 삭제하지 않고 살려둡니다.
                    if (room.hasMessages) {
                        console.log(`[Room Keep] ${roomId} 방은 메시지가 있어 유지됩니다.`);
                    } else {
                        // 메시지가 전혀 없는 빈 방만 기존처럼 삭제 (5분 유예)
                        if (typeof scheduleRoomDeletion === 'function') {
                            scheduleRoomDeletion(roomId);
                        }
                    }
                }
            }
        });
        io.emit('users:list', presenceManager.getOnlineUserList());
        socket.broadcast.emit('user:left', user.userId);
    });

    // [Socket] 유저 접속 시 자신의 userId 이름의 방에 자동 입장 (중계 타겟팅용)
    socket.join(user.userId);

    /**
     * 1. [수신 중계] 모바일 앱에서 문자를 받았을 때 서버로 토스
     */
    socket.on('sms:bridge_to_server', (data) => {
        const { sender, message, timestamp } = data;
        
        console.log(`[Relay] SMS 수신 중계: ${sender} -> ${user.userId}`);

        // DB 저장 없이 현재 접속 중인 이 유저의 '모든 기기'에 쏴줌
        // 본인 제외 다른 세션(PC 등)에만 보내려면 broadcast.to 사용
        socket.to(user.userId).emit('sms:display', {
            sender,
            message,
            timestamp: timestamp || Date.now(),
            isSMS: true
        });
    });

    /**
     * 2. [발신 명령] PC 등에서 SMS 답장을 보낼 때 모바일 앱에 전송 명령
     */
    socket.on('sms:send_request', (data) => {
        const { receiver, message } = data;

        console.log(`[Relay] SMS 발신 명령: ${user.userId} -> ${receiver}`);

        // 내 계정으로 연결된 모든 기기에 명령을 내림 
        // (안드로이드 앱이 이 신호를 받아 실제 SMS를 발송함)
        io.to(user.userId).emit('sms:command_send', {
            receiver,
            message
        });
    });
});

server.listen(PORT, () => {
    console.log('================================================');
    console.log('  WP Realtime Secure Chat Server');
    console.log(`  Port: ${PORT}`);
    console.log(`  Origins: ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(`  Status: http://localhost:${PORT}/status`);
    console.log('  Security: NO DATABASE - Memory Only');
    console.log('================================================');
});

// ==========================================
// 🔐 1. 사용자 자물쇠(Public Key) 관리 API
// ==========================================

app.post('/api/user/public_key', (req, res) => {
    const { userId, publicKey } = req.body;
    if (!userId || !publicKey) return res.status(400).json({ error: '데이터가 부족합니다.' });
    
    db.run("INSERT OR REPLACE INTO public_keys (userId, publicKey) VALUES (?, ?)", [userId, publicKey], (err) => {
        if (err) return res.status(500).json({ error: 'DB 저장 에러' });
        console.log(`[E2EE DB] ${userId}님의 자물쇠가 영구 저장되었습니다.`);
        res.json({ success: true });
    });
});

app.get('/api/user/:userId/public_key', (req, res) => {
    db.get("SELECT publicKey FROM public_keys WHERE userId = ?", [req.params.userId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: '상대방의 자물쇠를 찾을 수 없습니다.' });
        res.json({ success: true, publicKey: row.publicKey });
    });
});


// ==========================================
// 📦 2. 방 비밀번호(Room Secret) 교환 API
// ==========================================

app.post('/api/room/secret', (req, res) => {
    const { roomId, targetUserId, encryptedSecret } = req.body;
    
    db.run("INSERT OR REPLACE INTO room_secrets (storageKey, encryptedSecret) VALUES (?, ?)", 
        [`${roomId}_${targetUserId}`, encryptedSecret], (err) => {
        if (err) return res.status(500).json({ error: 'DB 저장 에러' });

        // 🚀 [중요] HTTP 요청 안에서 소켓(io)을 사용하여 실시간 신호를 쏩니다.
        // req.app.get('io')를 쓰거나 global.io가 잘 설정되어 있는지 확인하세요.
        const io = req.app.get('io') || global.io;
        if (io) {
            console.log(`[E2EE] 방 ${roomId}의 비밀번호가 갱신되어 신호를 보냅니다.`);
            // 방 전체에 알림을 보냅니다.
            io.to(roomId).emit('secret:updated', { roomId, senderId: req.body.senderId }); 
        }

        res.json({ success: true });
    });
});

app.get('/api/room/:roomId/secret/:userId', (req, res) => {
    const storageKey = `${req.params.roomId}_${req.params.userId}`;
    db.get("SELECT encryptedSecret FROM room_secrets WHERE storageKey = ?", [storageKey], (err, row) => {
        if (err || !row) return res.status(404).json({ error: '보관된 비밀번호가 없습니다.' });
        res.json({ success: true, encryptedSecret: row.encryptedSecret });
    });
});

// ============================================================
// [신규 추가] 랜덤 채팅 전용 네임스페이스 (/random)
// ============================================================
const randomChat = io.of('/random');

// 랜덤 채팅용 대기열(Queue) 메모리
let waitingQueue = [];

// 랜덤 채팅은 워드프레스 JWT 인증(authMiddleware)을 거치지 않게 하거나,
// 별도의 익명 인증 미들웨어를 적용할 수 있습니다.
randomChat.use((socket, next) => {
    // (선택) 간단한 닉네임 정도만 확인 후 통과
    socket.user = { id: socket.id, isRandomUser: true };
    next();
});

randomChat.on('connection', (socket) => {
    console.log(`[RandomChat] Connected: ${socket.id}`);

    // 매칭 요청
    socket.on('random:match', () => {
        if (waitingQueue.length > 0) {
            // 대기 중인 사람이 있으면 매칭 성사
            const partner = waitingQueue.shift();
            const roomId = `rand_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
            
            // 두 사람을 같은 방으로 조인
            socket.join(roomId);
            partner.join(roomId);

            // 매칭 성공 알림
            randomChat.to(roomId).emit('random:matched', { roomId, message: '상대방과 연결되었습니다.' });
        } else {
            // 대기 중인 사람이 없으면 큐에 추가
            waitingQueue.push(socket);
            socket.emit('random:waiting', { message: '상대방을 찾고 있습니다...' });
        }
    });

    // 랜덤 채팅 메시지 전송
    socket.on('random:message', async (data) => {
        if (!data.roomId || !data.text) return;

        // 🚀 랜덤 채팅 필터링 API 호출
        let filteredText = data.text;
        try {
            const response = await axios.post('http://218.38.12.116:8080/api/v1/filter', {
                service_id: "zerochat-random",
                category: "game", // 랜덤채팅은 보통 game이나 community 카테고리 권장
                text: filteredText
            });
            filteredText = response.data.masked_text;
        } catch (err) {
            console.error("랜덤채팅 필터링 실패:", err.message);
        }

        data.text = filteredText; // ✅ 필터링된 데이터로 덮어쓰기
        socket.to(data.roomId).emit('random:message', data);
    });

    // 연결 종료 시 큐에서 제거 및 상대방에게 알림
    socket.on('disconnect', () => {
        waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
        // 속해있던 방의 상대방에게 퇴장 알림 전송 로직 등 추가
    });
});

const multer = require('multer');
const fs = require('fs');
const path = require('path');

// 🚀 1. 업로드 폴더 설정 (data/upload)
const uploadDir = path.join('/home/chatservice/www/data/upload'); // 실제 폴더 구조에 맞게 경로 조절 필요
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        // 파일명 난독화 (보안): 타임스탬프 + 랜덤문자열 + 원래확장자
        const ext = path.extname(file.originalname);
        const randomName = Date.now() + '_' + Math.random().toString(36).substr(2, 9) + ext;
        cb(null, randomName);
    }
});
const upload = multer({ storage: storage });

// 🚀 2. 브라우저가 이미지를 볼 수 있게 정적 폴더 개방
app.use('/uploads', express.static(uploadDir));

// 🚀 3. 이미지 업로드 API
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: '파일이 없습니다.' });
    // 업로드 성공 시, 접근 가능한 URL 경로(파일명) 반환
    res.json({ success: true, filename: req.file.filename });
});

// 🚀 4. 사용자 수동 삭제 API (보안 규정 준수)
app.delete('/api/upload/:filename', (req, res) => {
    const filePath = path.join(uploadDir, req.params.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // 서버 디스크에서 즉시 영구 삭제!
        res.json({ success: true, message: '파일이 영구 삭제되었습니다.' });
    } else {
        res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다.' });
    }
});

// 🚀 5. 시한폭탄 자동 삭제 (Auto-Sweeping) - 1시간마다 검사해서 24시간 지난 파일 삭제
setInterval(() => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(uploadDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                // 파일 생성 후 24시간(86400000ms)이 지났으면 강제 삭제
                if (now - stats.birthtimeMs > 86400000) {
                    fs.unlinkSync(filePath);
                    console.log(`[보안 파기] 보관 기간이 만료된 임시 파일 삭제: ${file}`);
                }
            });
        });
    });
}, 3600000); // 1시간(3600000ms)마다 실행

process.on('SIGTERM', () => { io.close(); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { io.close(); server.close(() => process.exit(0)); });

// 🚀 채팅 로그를 텍스트 파일로 저장할 절대 경로
const chatLogDir = '/home/chatservice/www/data/chats';
if (!fs.existsSync(chatLogDir)) {
    fs.mkdirSync(chatLogDir, { recursive: true });
}

// 서버 측 가상 방(Virtual Room) 처리
function generateSmsRoomId(phone) {
    return `sms_${phone.replace(/\D/g, '')}`;
}