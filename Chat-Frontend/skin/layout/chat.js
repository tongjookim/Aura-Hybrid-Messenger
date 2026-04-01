    // ============================================================
    // ⚙️ 환경 설정 (백엔드 포트 3201 기준)
    // ============================================================    
    let socket = null;
    let currentUser = { userId: '', displayName: '', avatarUrl: '', statusMessage: '' };
    let currentRoomId = null;
    let activeRooms = new Map();
    let onlineUsersList = []; 
    let myFriendsList = [];   
    let pendingDMRoom = false; 
    let isRegisterMode = false; 

    let mySyncedMembers = [];
    let mySyncedNonMembers = [];

    // 🚀 알림음 설정 (기본값 ON)
    let isSoundEnabled = localStorage.getItem('k_sound') !== 'off';
    const notifySound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); 

    const viewSplash = document.getElementById('splash-view');
    const viewLogin = document.getElementById('login-view');
    const viewMain = document.getElementById('main-view');
    const viewChat = document.getElementById('chat-view');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const messagesContainer = document.getElementById('chat-messages');

    // 파일 첨부용 숨김 인풋 생성
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // ============================================================
    // 🚀 초기화 및 자동 로그인
    // ============================================================
    window.onload = () => {
        updateSoundUI();
        const token = localStorage.getItem('k_token');
        const userId = localStorage.getItem('k_userId');
        const nickname = localStorage.getItem('k_nickname');
        const phone = localStorage.getItem('k_phone');
        
        if (token && userId && nickname) {
            currentUser.userId = userId;
            currentUser.displayName = nickname;
            currentUser.phoneNumber = phone || ''; 

            connectToServer(token, nickname, userId);
        } else {
            // 토큰이 없으면(첫 접속): 스플래시 1.5초 보여주고 로그인 화면으로 전환!
            setTimeout(() => {
                viewSplash.classList.remove('active');
                viewLogin.classList.add('active');
            }, 1500); // 1500ms = 1.5초
        }
    };

    function toggleRegister() {
        isRegisterMode = !isRegisterMode;
        
        const regName = document.getElementById('reg-name');
        const regPhone = document.getElementById('reg-phone'); // 👈 이 줄이 있는지 확인!
        const loginTitle = document.getElementById('login-box-title');
        const btnAction = document.getElementById('btn-action');
        const toggleText = document.getElementById('toggle-text');

        if (isRegisterMode) {
            regName.style.display = 'block';
            regPhone.style.display = 'block'; // 🚀 여기서 'block'으로 바꿔줘야 화면에 나타납니다!
            loginTitle.innerText = '새 계정 만들기';
            btnAction.innerText = '회원가입';
            toggleText.innerText = '이미 계정이 있으신가요? 로그인';
        } else {
            regName.style.display = 'none';
            regPhone.style.display = 'none'; // 🚀 로그인 모드에선 다시 숨깁니다.
            loginTitle.innerText = '로그인';
            btnAction.innerText = '입장하기';
            toggleText.innerText = '계정이 없으신가요? 회원가입';
        }
    }

    async function handleLogin() {
        const userId = document.getElementById('login-id').value.trim();
        const password = document.getElementById('login-pw').value.trim();
        
        if (isRegisterMode) {
            const displayName = document.getElementById('reg-name').value.trim();
            const phoneNumber = document.getElementById('reg-phone').value;

            // 🚀 [수정] phoneNumber가 비어있는지 반드시 확인해야 합니다!
            if (!userId || !password || !displayName || !phoneNumber) {
                return alert('모든 정보를 입력하세요. (전화번호 포함)');
            }
            try {
                const res = await fetch(SERVER_URL + '/api/register', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, password, displayName, phoneNumber })
                });
                const data = await res.json();
                alert(data.message || data.error);
                if (data.success) toggleRegister(); 
            } catch (err) { alert('서버와 통신할 수 없습니다.'); }
        } else {
            if (!userId || !password) return alert('아이디와 비밀번호를 입력하세요.');
            try {
                const res = await fetch(SERVER_URL + '/api/login', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, password })
                });
                const data = await res.json();
                if (!data.success) return alert(data.error);

                localStorage.setItem('k_token', data.token);
                localStorage.setItem('k_userId', userId);
                localStorage.setItem('k_nickname', data.displayName);
                localStorage.setItem('k_phone', data.phoneNumber || '');
                
                connectToServer(data.token, data.displayName, userId);
            } catch (err) { alert('서버와 통신할 수 없습니다.'); }
        }
    }

    // ============================================================
    // 🚀 소켓 연결 및 이벤트 수신
    // ============================================================
    function connectToServer(token, nickname, userId) {
        if (socket) socket.disconnect();
        try {
            socket = io(SERVER_URL, {
                auth: { token: token, isStandalone: true },
                transports: ['websocket', 'polling']
            });

            socket.on('connect', () => {
                currentUser.userId = userId;
                currentUser.displayName = nickname;
                currentUser.avatarUrl = localStorage.getItem('k_avatar') || '';
                currentUser.statusMessage = localStorage.getItem('k_status') || '';
                
                // 🚀 스플래시와 로그인 화면 모두 숨기고 메인으로 전환
                viewSplash.classList.remove('active'); 
                viewLogin.classList.remove('active');
                viewMain.classList.add('active');
                
                socket.emit('friend:request-list');
                if (currentUser.statusMessage) {
                    socket.emit('user:set-status', { statusMessage: currentUser.statusMessage });
                }
                restoreMyRooms();
                updateSettingsMyProfileUI(); 

                loadSyncedContacts();
            });

            socket.on('connect_error', (err) => {
                alert('❌ 인증 실패: 다시 로그인해주세요.');
                logout();
            });

            setupSocketListeners();
        } catch(error) { console.error('연결 에러:', error); }
    }

    function setupSocketListeners() {
        socket.on('auth:success', (data) => {
            currentUser.userId = data.userId;
            currentUser.displayName = data.displayName;
            localStorage.setItem('k_nickname', currentUser.displayName);
            updateSettingsMyProfileUI();
        });

        socket.on('users:list', (users) => {
            onlineUsersList = users || [];
            renderFriends(); 
        });

        socket.on('friend:list', (friends) => {
            myFriendsList = friends || [];
            const countEl = document.getElementById('friend-count');
            if (countEl) countEl.textContent = myFriendsList.length;
            renderFriends(); 
        });

        socket.on('user:status-changed', () => renderFriends());

        socket.on('rooms:list', (rooms) => {
            if (rooms && Array.isArray(rooms)) {
                rooms.forEach(r => {
                    // 🚀 방어 로직: 서버가 상대방 ID를 까먹고 안 보냈어도, 내 메모리에 있으면 그걸 씁니다!
                    const existingRoom = activeRooms.get(r.id);
                    if (existingRoom && existingRoom.otherUserId && !r.otherUserId) {
                        r.otherUserId = existingRoom.otherUserId;
                    }
                    
                    activeRooms.set(r.id, r);
                    saveRoomToLocal(r.id, r.name, r.type, r.otherUserId); // 👈 4번째 값 전달
                });
                renderRooms();
            }
        });

        socket.on('room:created', (room) => {
            activeRooms.set(room.id, room);
            saveRoomToLocal(room.id, room.name, room.type, room.otherUserId); // 👈 4번째 값 전달
            renderRooms();
            
            if (currentRoomId === room.id) {
                currentRoomId = null; 
                enterRoom(room.id, room.name, room.otherUserId);
            }
        });

        socket.on('room:joined', (room) => {
            // 서버가 까먹었을 때를 대비한 방어 로직
            const existingRoom = activeRooms.get(room.id);
            if (existingRoom && existingRoom.otherUserId && !room.otherUserId) {
                room.otherUserId = existingRoom.otherUserId;
            }
            
            activeRooms.set(room.id, room);
            saveRoomToLocal(room.id, room.name, room.type, room.otherUserId); // 👈 4번째 값 전달
            renderRooms();
            
            if (pendingDMRoom) {
                pendingDMRoom = false;
                let targetUserId = room.otherUserId;
                if (!targetUserId && Array.isArray(room.users)) {
                    const partner = room.users.find(u => {
                        const uid = typeof u === 'string' ? u : u.userId;
                        return String(uid) !== String(currentUser.userId);
                    });
                    if (partner) targetUserId = typeof partner === 'string' ? partner : partner.userId;
                }
                enterRoom(room.id, room.name, targetUserId);
            }
        });

        // 🚀 실시간으로 방 비밀번호가 갱신되었다는 신호를 받았을 때
        socket.on('secret:updated', async (data) => {
            console.log("🔒 보안 채널이 갱신되었습니다. 새로운 암호를 가져옵니다...");
            
            // 현재 내가 그 방에 있다면, 비밀번호를 새로 고침합니다.
            if (currentRoomId === data.roomId) {
                await refreshRoomSecret(data.roomId);
            }
        });

        socket.on('message:system', (text) => {
            if (currentRoomId) appendSystemMessage(text);
            else alert(`[알림] ${text}`); 
        });

        // 🚀 [해결] 기존 리스너를 먼저 제거하여 중복 등록(메시지 이중 전송)을 방지합니다.
        socket.off('message:receive');

        socket.on('message:receive', async (msg) => {
            if (msg.id && document.querySelector(`[data-msg-id="${msg.id}"]`)) return; 
            
            // 🚀 암호문인지 판별
            const isEncryptedMsg = msg.text && msg.text.startsWith('U2FsdGVkX1');

            if (isEncryptedMsg) {
                if (currentRoomCryptoKey && currentRoomCryptoKey !== 'PLAIN' && currentRoomCryptoKey !== 'SMS_MODE') {
                    try {
                        let bytes = CryptoJS.AES.decrypt(msg.text, currentRoomCryptoKey);
                        let decryptedText = bytes.toString(CryptoJS.enc.Utf8);
                        // ... (기존 해독 재시도 로직 유지) ...
                        if (decryptedText) msg.text = decryptedText; 
                        else msg.text = "🔒 [해독 실패] 열쇠가 변경되었습니다."; 
                    } catch (e) {
                        msg.text = "🔒 [손상된 메시지]";
                    }
                } else {
                    // 🚀 [외계어 차단!] 키가 없는데 암호문이 왔을 때
                    msg.text = "🔒 [암호화된 메시지입니다. 상대방 접속 시 해독됩니다.]";
                }
            }
            
            // 해독이 끝난(혹은 실패한) 메시지를 화면에 표시
            appendMessage(msg);

            // 2. 알림음 재생 로직
            const isMine = String(msg.userId) === String(currentUser.userId);
            if (!isMine && isSoundEnabled) {
                notifySound.play().catch(e => console.log('소리 재생 차단됨'));
            }

            // 3. 화면에 예쁘게 그리기
            if (currentRoomId === msg.roomId) {
                appendMessage(msg);
                scrollToBottom();
            }
        });

        socket.on('room:updated', (room) => {
            activeRooms.set(room.id, room);
            renderRooms();
            if (currentRoomId === room.id && document.getElementById('chat-menu-overlay').style.display === 'flex') {
                renderChatParticipants();
            }
        });

        // 🚀 방에 입장했을 때 서버에서 텍스트 파일 기록을 보내주면 처리
        socket.on('chat:history', (history) => {
            
            // 🚨 [핵심 방어 로직] 서버 기록이 텅 비어있다면?
            // 화면을 지우지 않고 내 폰에 띄워둔 대화(캐시)를 그대로 유지합니다!
            if (!history || history.length === 0) {
                appendSystemMessage('채팅방에 입장했습니다.');
                scrollToBottom();
                return; // 여기서 함수를 끝내버림!
            }

            // 서버 기록이 진짜로 있을 때만 화면을 지우고 덮어씁니다.
            messagesContainer.innerHTML = '';
            appendSystemMessage('채팅방에 입장했습니다. (기록 동기화 완료)');

            history.forEach(msg => {
                try {
                    // 🔓 암호문 해독!
                    const bytes = CryptoJS.AES.decrypt(msg.text, currentRoomCryptoKey);
                    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
                    if (decryptedText) {
                        msg.text = decryptedText; 
                    } else {
                        msg.text = "🔒 [암호화된 메시지]";
                    }
                } catch (e) {
                    msg.text = "🔒 [암호화된 메시지]";
                }
                
                appendMessage(msg, true);
            });
            
            scrollToBottom();
        });
    }

    // ============================================================
    // 🚀 탭 전환 및 설정 UI 
    // ============================================================
    function switchMainTab(tab) {
        // 1. 하단 탭 버튼 활성화 색상 변경
        document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
        document.querySelector(`.tab-item[data-target="${tab}"]`).classList.add('active');
        
        // 🚨 [복구된 핵심 코드] 각 탭에 맞는 화면(div)을 껐다 켜주는 역할!
        document.getElementById('list-friends').style.display = tab === 'friends' ? 'block' : 'none';
        document.getElementById('list-rooms').style.display = tab === 'rooms' ? 'block' : 'none';
        document.getElementById('list-openchat').style.display = tab === 'openchat' ? 'block' : 'none';
        document.getElementById('list-settings').style.display = tab === 'settings' ? 'block' : 'none';
        
        // 2. 상단 타이틀 글자 변경
        let title = '친구';
        if (tab === 'rooms') title = '채팅';
        if (tab === 'openchat') title = '오픈채팅';
        if (tab === 'settings') title = '설정';
        document.getElementById('main-title').textContent = title;
        
        // 🚀 3. 상단 우측 버튼들 가로 배치 (inline-block 적용 완료!)
        document.getElementById('btn-add-friend').style.display = tab === 'friends' ? 'inline-block' : 'none';
        document.getElementById('btn-create-room').style.display = tab === 'openchat' ? 'inline-block' : 'none';
    }

    function updateSettingsMyProfileUI() {
        // HTML 요소가 없으면 에러를 내지 않고 안전하게 넘어가도록 각각 if문 처리!
        const nameEl = document.getElementById('setting-my-name');
        if (nameEl) nameEl.textContent = currentUser.displayName;

        const idEl = document.getElementById('setting-my-id');
        if (idEl) idEl.textContent = `ID: ${currentUser.userId}`;

        const phoneEl = document.getElementById('display-phone');
        const savedPhone = localStorage.getItem('k_phone'); // 저장된 번호 가져오기

        // 전화번호 포맷팅 함수 (01012345678 -> 010-1234-5678)
        function formatPhoneNumber(num) {
            if (!num) return '미등록';
            return num.replace(/[^0-9]/g, "")
                    .replace(/(^02|^0505|^1[0-9]{3}|^0[0-9]{2})([0-9]+)?([0-9]{4})$/, "$1-$2-$3")
                    .replace("--", "-");
        }

        if (phoneEl && savedPhone) {
            phoneEl.textContent = formatPhoneNumber(savedPhone); // 예쁘게 포맷팅해서 출력
        }

        const statusEl = document.getElementById('setting-my-status');
        if (statusEl) statusEl.textContent = currentUser.statusMessage || '상태 메시지를 설정해주세요.';
        
        const avatarEl = document.getElementById('setting-my-avatar');
        if (avatarEl) {
            if (currentUser.avatarUrl) {
                avatarEl.style.backgroundImage = `url('${currentUser.avatarUrl}')`;
                avatarEl.textContent = '';
            } else {
                avatarEl.style.backgroundImage = 'none';
                avatarEl.textContent = currentUser.displayName.charAt(0);
            }
        }
    }

    function toggleSound() {
        isSoundEnabled = !isSoundEnabled;
        localStorage.setItem('k_sound', isSoundEnabled ? 'on' : 'off');
        updateSoundUI();
    }

    function updateSoundUI() {
        const btn = document.getElementById('sound-toggle-btn');
        if (!btn) return;
        if (isSoundEnabled) {
            btn.textContent = 'ON';
            btn.className = 'toggle-btn on';
        } else {
            btn.textContent = 'OFF';
            btn.className = 'toggle-btn off';
        }
    }

    function logout() {
        localStorage.removeItem('k_token');
        localStorage.removeItem('k_userId');
        localStorage.removeItem('k_nickname');
        localStorage.removeItem('k_my_rooms');
        location.reload();
    }

    // ============================================================
    // 🚀 커스텀 공통 입력 팝업 로직 (충돌 방지 구조)
    // ============================================================
    let currentInputCallback = null;

    function openInputModal(title, placeholder, defaultValue, callback) {
        closeProfileModal(); // 다른 팝업 강제 종료

        document.getElementById('input-modal-title').textContent = title;
        const inputField = document.getElementById('input-modal-field');
        inputField.placeholder = placeholder;
        inputField.value = defaultValue || '';
        
        const modal = document.getElementById('input-modal');
        modal.style.zIndex = '9999'; 
        modal.style.display = 'flex';
        
        currentInputCallback = callback;
        setTimeout(() => inputField.focus(), 150);
    }

    function closeInputModal() {
        document.getElementById('input-modal').style.display = 'none';
        currentInputCallback = null;
        document.getElementById('input-modal-field').value = ''; 
    }

    document.getElementById('input-modal-submit').addEventListener('click', () => {
        if (!currentInputCallback) return;
        const val = document.getElementById('input-modal-field').value;
        const callbackToRun = currentInputCallback; 
        
        closeInputModal(); 
        callbackToRun(val); 
    });

    document.getElementById('input-modal-field').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            document.getElementById('input-modal-submit').click();
        }
    });

    // ============================================================
    // 🚀 프로필 팝업 & 정보 수정 로직
    // ============================================================
    function openProfileModal(targetUserId, targetUserName, isMe) {
        document.getElementById('profile-modal').style.display = 'flex';
        
        const avatarEl = document.getElementById('profile-modal-avatar');
        if (isMe && currentUser.avatarUrl) {
            avatarEl.style.backgroundImage = `url('${currentUser.avatarUrl}')`;
            avatarEl.textContent = '';
        } else {
            avatarEl.style.backgroundImage = 'none';
            avatarEl.textContent = targetUserName.charAt(0);
        }

        document.getElementById('profile-modal-name').textContent = targetUserName;
        document.getElementById('profile-modal-status').textContent = isMe && currentUser.statusMessage ? currentUser.statusMessage : '상태 메시지가 없습니다.';
        
        const actionsDiv = document.getElementById('profile-actions');
        
        if (isMe) {
            actionsDiv.innerHTML = `
                <button class="profile-action-btn" onclick="editMyProfile()">
                    <i class="fas fa-pen"></i> 이름/상태 수정
                </button>
                <button class="profile-action-btn" onclick="editMyAvatar()">
                    <i class="fas fa-camera"></i> 사진 변경
                </button>
                <button class="profile-action-btn" onclick="startDM('${targetUserId}')">
                    <i class="fas fa-comment"></i> 나와의 채팅
                </button>
            `;
        } else {
            actionsDiv.innerHTML = `
                <button class="profile-action-btn" onclick="startDM('${targetUserId}')">
                    <i class="fas fa-comment"></i> 1:1 채팅
                </button>
            `;
        }
    }

    function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }

    function editMyProfile() {
        openInputModal('닉네임 변경', '새로운 닉네임을 입력하세요', currentUser.displayName, (newName) => {
            if (!newName || newName.trim() === '') return;
            
            socket.emit('user:change-name', { displayName: newName.trim() });
            currentUser.displayName = newName.trim();
            localStorage.setItem('k_nickname', currentUser.displayName);
            
            setTimeout(() => {
                openInputModal('상태 메시지 변경', '상태 메시지를 입력하세요', currentUser.statusMessage, (newStatus) => {
                    if (newStatus !== null) {
                        socket.emit('user:set-status', { statusMessage: newStatus.trim() });
                        currentUser.statusMessage = newStatus.trim();
                        localStorage.setItem('k_status', currentUser.statusMessage);
                    }
                    updateSettingsMyProfileUI();
                    renderFriends();
                });
            }, 200);
        });
    }

    function editMyAvatar() {
        openInputModal('프로필 사진 변경', '이미지 URL 주소를 입력하세요', currentUser.avatarUrl, (url) => {
            if (url !== null && url.trim() !== '') {
                currentUser.avatarUrl = url.trim();
                localStorage.setItem('k_avatar', currentUser.avatarUrl);
                updateSettingsMyProfileUI();
                renderFriends();
            }
        });
    }

    // ============================================================
    // 🚀 친구 목록 및 방 목록 그리기
    // ============================================================
    function renderFriends() {
        const myContainer = document.getElementById('my-profile-container');
        const friendsContainer = document.getElementById('friends-container');
        if (!myContainer || !friendsContainer) return; 
        if (!currentUser || !currentUser.userId) return;

        // 화면 싹 비우기
        friendsContainer.innerHTML = '';
        myContainer.innerHTML = '';

        // 1. 내 프로필 그리기
        const myInitial = currentUser.displayName ? currentUser.displayName.charAt(0) : '?';
        let myAvatarHTML = currentUser.avatarUrl 
            ? `<div class="avatar" style="background-image:url('${currentUser.avatarUrl}')"></div>` 
            : `<div class="avatar">${myInitial}</div>`;

        myContainer.innerHTML = `
            <div class="my-profile-section" onclick="openProfileModal('${currentUser.userId}', '${currentUser.displayName}', true)">
                ${myAvatarHTML}
                <div class="item-info">
                    <div class="item-name">${currentUser.displayName}</div>
                    <div class="item-sub">${currentUser.statusMessage || '나'}</div>
                </div>
            </div>
            <hr style="border: 0; border-top: 1px solid #f2f2f2; margin: 5px 20px 15px;">
        `;

        // 2. 일반 접속 친구 그리기
        if (Array.isArray(myFriendsList)) {
            myFriendsList.forEach(friend => {
                if (!friend || !friend.userId) return;
                const initial = friend.displayName ? friend.displayName.charAt(0) : '?';
                const isOnline = Array.isArray(onlineUsersList) && onlineUsersList.some(u => String(u.userId) === String(friend.userId));
                const statusColor = isOnline ? '#2ecc71' : '#b2b2b2'; 

                friendsContainer.innerHTML += `
                    <div class="list-item" id="member-${friend.userId}" onclick="openProfileModal('${friend.userId}', '${friend.displayName}', false)">
                        <div class="avatar" style="position:relative;">
                            ${initial}
                            <div style="position:absolute; bottom:0; right:0; width:12px; height:12px; background:${statusColor}; border-radius:50%; border:2px solid #fff;"></div>
                        </div>
                        <div class="item-info">
                            <div class="item-name">${friend.displayName}</div>
                            <div class="item-sub" style="color:${statusColor};">${isOnline ? '온라인' : '오프라인'}</div>
                        </div>
                    </div>
                `;
            });
        }

        // 3. 주소록 동기화 친구 그리기 (데이터가 있을 때만 구분선 표시)
        if (mySyncedMembers.length > 0 || mySyncedNonMembers.length > 0) {
            friendsContainer.insertAdjacentHTML('beforeend', '<div style="padding:15px 20px 5px; font-size:12px; font-weight:bold; color:#888; background:#f9fafb;">기기 연락처 친구</div>');
        }

        // 3-1. 주소록 중 아우라 가입자
        if (mySyncedMembers.length > 0) {
            mySyncedMembers.forEach(member => {
                if (document.getElementById(`member-${member.userId}`)) return; // 중복 방지

                const html = `
                    <div class="list-item" id="member-${member.userId}" onclick="openProfileModal('${member.userId}', '${member.displayName}', false)">
                        <div class="avatar">${member.displayName[0]}</div>
                        <div class="item-info">
                            <div class="item-name">${member.displayName} <span class="badge-aura" style="font-size:10px; background:#e8f0fe; color:#1a73e8; padding:2px 6px; border-radius:10px; margin-left:5px;">Aura</span></div>
                            <div class="item-sub">ID: ${member.userId} | ${member.phoneNumber || ''}</div>
                        </div>
                        <i class="fas fa-chevron-right" style="color:#eee; font-size:12px; margin-right:15px;"></i>
                    </div>
                `;
                friendsContainer.insertAdjacentHTML('beforeend', html);
            });
        }

        // 3-2. 주소록 중 비가입자 (문자 초대 대상)
        if (mySyncedNonMembers.length > 0) {
            mySyncedNonMembers.forEach(c => {
                const phone = c.phoneNumber || c; 
                const name = c.contactName || '이름 없음';

                const html = `
                    <div class="list-item" style="opacity: 0.8;" onclick="startSmsChat('${phone}', '${name}')">
                        <div class="avatar" style="background: #e2e8f0; color: #94a3b8;"><i class="fas fa-sms"></i></div>
                        <div class="item-info">
                            <div class="item-name">${name}</div>
                            <div class="item-sub">${phone}</div>
                        </div>
                        <button class="btn-invite-mini" style="margin-right:15px; background:#1a73e8; color:white; border:none; padding:6px 12px; border-radius:15px; font-size:12px; cursor:pointer;" onclick="event.stopPropagation(); startSmsChat('${phone}', '${name}')">문자 채팅</button>
                    </div>
                `;
                
                // 🚨 여기가 핵심입니다! syncSection이 아니라 friendsContainer에 추가해야 합니다.
                friendsContainer.insertAdjacentHTML('beforeend', html);
            });
        }
    }

    function renderRooms() {
        const chatContainer = document.getElementById('rooms-container');
        const openChatContainer = document.getElementById('openchat-container');
        
        if (chatContainer) chatContainer.innerHTML = '';
        if (openChatContainer) openChatContainer.innerHTML = '';
        
        let chatCount = 0; let openChatCount = 0;

        activeRooms.forEach(room => {
            const isDM = room.type === 'dm' || room.type === 'sms' || (room.id && (room.id.includes('dm') || room.id.startsWith('sms_')));
            const initial = room.name ? room.name.charAt(0) : 'R';
            
            // 🚨 [강력 방어막] DM(1:1 채팅)인데 '나'와 전혀 관련 없는 방이면 화면에 그리지 않고 무시!
            if (isDM) {
                let isMyRoom = false;
                
                // 1. 내가 만든 방인가?
                if (String(room.createdBy) === String(currentUser.userId)) isMyRoom = true;
                
                // 2. 방 참여자 명단(dmPair)에 내가 있는가?
                if (room.dmPair && room.dmPair.includes(String(currentUser.userId))) isMyRoom = true;
                
                // 3. 현재 접속 중인 유저(users) 중에 내가 있는가?
                if (Array.isArray(room.users) && room.users.some(u => String(typeof u === 'string' ? u : u.userId) === String(currentUser.userId))) isMyRoom = true;

                // 🚀 4. [추가된 예외 조항] 로컬 스토리지(캐시)에 상대방 ID가 적혀있으면 내 방이 확실함!
                if (room.otherUserId || room.targetUserId) isMyRoom = true;

                // 내 방이 아니면 이 밑의 로직을 쿨하게 건너뜁니다! (화면에 안 그림)
                if (!isMyRoom) {
                    console.log(`[차단됨] ${room.name} 방은 내 방이 아니라서 숨깁니다.`);
                    return; 
                }
            }

            // 🚀 [궁극의 방어 로직] 내 아이디는 절대 상대방이 될 수 없다!
            let targetUserId = '';
            
            // 백엔드가 줄 수 있는 모든 아이디 후보군을 긁어모읍니다.
            const candidates = [room.targetUserId, room.otherUserId, room.partnerId];
            if (Array.isArray(room.users)) {
                room.users.forEach(u => candidates.push(typeof u === 'string' ? u : u.userId));
            }

            // 1단계: 나를 제외한 진짜 상대방 찾기
            for (let c of candidates) {
                if (c && String(c) !== String(currentUser.userId) && c !== '알수없음') {
                    targetUserId = c;
                    break;
                }
            }

            // 🚀 2단계: 예외 처리 [나와의 채팅]
            // 방 인원이 나 혼자(1명)밖에 없거나, dmPair가 ['나', '나']라면? 상대방은 나 자신!
            if (!targetUserId) {
                const isSelfDM = room.dmPair && room.dmPair[0] === room.dmPair[1] && room.dmPair[0] === String(currentUser.userId);
                const isOnlyMe = Array.isArray(room.users) && room.users.length === 1 && String(room.users[0].userId || room.users[0]) === String(currentUser.userId);
                
                if (isSelfDM || isOnlyMe) {
                    targetUserId = currentUser.userId;
                }
            }

            // 그래도 없으면 어쩔 수 없이 알수없음 처리
            if (!targetUserId) targetUserId = '알수없음';

            // 🚨 백엔드 데이터 확인용 콘솔 로그
            console.log(`[디버깅] ${room.name} 방 데이터:`, room, `=> 찾은 상대방 ID: ${targetUserId}`);

            const roomHTML = `
                <li class="list-item" onclick="enterRoom('${room.id}', '${room.name}', '${targetUserId}')">
                    <div class="avatar" style="border-radius:14px; background:#e6e6e6;">${initial}</div>
                    <div class="item-info">
                        <div class="item-name">${room.name}</div>
                        <div class="item-sub">대화 내용을 확인하세요.</div>
                    </div>
                </li>
            `;

            if (isDM) {
                if (chatContainer) chatContainer.innerHTML += roomHTML;
                chatCount++;
            } else {
                if (openChatContainer) openChatContainer.innerHTML += roomHTML;
                openChatCount++;
            }
        });

        if (chatCount === 0 && chatContainer) chatContainer.innerHTML = '<div style="text-align:center; padding:50px 0; color:#b2b2b2; font-size:14px;">진행 중인 1:1 대화가 없습니다.</div>';
        if (openChatCount === 0 && openChatContainer) openChatContainer.innerHTML = '<div style="text-align:center; padding:50px 0; color:#b2b2b2; font-size:14px;">참여 중인 오픈채팅방이 없습니다.</div>';
    }

    // ============================================================
    // 🚀 채팅방 조작 및 메시지 송수신
    // ============================================================
    function startDM(targetId) {
        pendingDMRoom = true; // 방이 생성된 후 자동으로 입장하기 위한 깃발
        socket.emit('room:create-dm', { targetUserId: targetId });
        
        // 프로필 모달이 열려있다면 닫고 채팅 탭으로 이동
        if (typeof closeProfileModal === 'function') closeProfileModal();
        if (typeof switchMainTab === 'function') switchMainTab('rooms'); 
    }

    function addFriend() {
        openInputModal('친구 추가', '친구의 아이디(userId)를 입력하세요', '', (targetId) => {
            if (targetId && targetId.trim() !== '') {
                socket.emit('friend:add', { targetUserId: targetId.trim() });
            }
        });
    }

    document.getElementById('btn-create-room').addEventListener('click', () => {
        openInputModal('새로운 오픈채팅방', '채팅방 이름을 입력하세요', '', (roomName) => {
            if (roomName && roomName.trim() !== '') {
                const tempId = 'room_' + Date.now();
                currentRoomId = tempId;
                socket.emit('room:create', { name: roomName.trim(), type: 'public' });
            }
        });
    });

    // 🚀 앱 실행 시 나의 자물쇠/열쇠 자동 세팅
    async function initE2EE() {
        // 너무 일찍 실행되는 걸 방지하기 위해 로컬 스토리지에서 아이디를 직접 가져옵니다.
        let savedUserId = localStorage.getItem('k_userId');
        if (!savedUserId) return; // 로그인을 안 했으면 그냥 통과

        let myPrivateKey = localStorage.getItem('my_private_key');
        let myPublicKey = localStorage.getItem('my_public_key');

        if (!myPrivateKey || !myPublicKey) {
            // 자물쇠가 아예 없으면 새로 만들기
            const crypt = new JSEncrypt({ default_key_size: 1024 });
            myPrivateKey = crypt.getPrivateKey();
            myPublicKey = crypt.getPublicKey();

            localStorage.setItem('my_private_key', myPrivateKey);
            localStorage.setItem('my_public_key', myPublicKey);
        }

        // 🚀 핵심: 자물쇠를 새로 만들었든 이미 있든, 앱을 켤 때마다 무조건 서버에 내 자물쇠를 다시 등록합니다!
        // (이렇게 하면 서버를 껐다 켜서 데이터가 다 날아가도 자동으로 복구됩니다 👍)
        try {
            const res = await fetch(`${SERVER_URL}/api/user/public_key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: savedUserId, // 안전하게 가져온 아이디
                    publicKey: myPublicKey
                })
            });
            if (res.ok) console.log("🔑 내 자물쇠가 서버에 성공적으로 등록(복구)되었습니다!");
        } catch(e) {
            console.error("자물쇠 등록 실패:", e);
        }
    }
    initE2EE();

    let currentRoomCryptoKey = null;

    // 🚀 2. 방 입장 함수 수정 (최초 1회만 묻기)
    async function enterRoom(roomId, roomName, targetUserId) {
        try {
            currentRoomId = roomId;
            openChat(roomId, roomName);

            // 1. 암호화 예외 방 (오픈채팅 등)
            if (roomId === 'default-lobby' || !targetUserId || targetUserId === '알수없음') {
                currentRoomCryptoKey = null;
                socket.emit('room:join', roomId);
                return;
            }

            // 2. 보안 키(열쇠) 동기화
            try {
                const res = await fetch(`${SERVER_URL}/api/room/${roomId}/secret/${currentUser.userId}`);
                
                if (res.ok) {
                    const data = await res.json();
                    
                    if (data && data.encryptedSecret) {
                        // 🟢 정상적으로 열쇠를 받아온 경우
                        const decryptor = new JSEncrypt();
                        decryptor.setPrivateKey(localStorage.getItem('my_private_key'));
                        const decryptedSecret = decryptor.decrypt(data.encryptedSecret);
                        
                        if (decryptedSecret) {
                            currentRoomCryptoKey = decryptedSecret;
                            console.log("🔐 방 암호 복구 성공!");
                        } else {
                            // ⚠️ 내 RSA 키(브라우저 캐시)가 지워져서 예전 암호를 못 푸는 경우
                            console.warn("기존 암호를 풀 수 없습니다. 새 보안 채널을 생성합니다.");
                            await createAndShareNewSecret(roomId, targetUserId);
                        }
                    } else {
                        // 🟠 서버가 200 OK를 줬지만 열쇠 데이터가 텅 비어있을 때 (진짜 처음 방을 만들었을 때)
                        // 동시 생성(Race Condition)을 막기 위해 0.5초 대기 후 생성
                        setTimeout(async () => {
                            await createAndShareNewSecret(roomId, targetUserId);
                        }, 500);
                    }
                } else if (res.status === 404) {
                    // 🟠 서버에 열쇠가 아예 없다고 확정(404) 받았을 때만 새로 생성!
                    await createAndShareNewSecret(roomId, targetUserId);
                } else {
                    // 🔴 서버 에러(500) 등으로 통신에 실패한 경우 -> 섣불리 새 열쇠를 만들지 않고 보류!
                    console.warn(`서버 통신 오류(${res.status}). 기존 열쇠를 덮어쓰지 않습니다.`);
                }
            } catch (e) {
                // 🚨 인터넷 끊김 등 치명적 네트워크 에러 발생 시
                // [기존 문제점]: 여기서 무조건 새 열쇠를 만들어버려서 열쇠가 계속 리셋됐음!
                // [해결]: 새 열쇠를 만들지 않고 임시 평문 모드로 우회합니다.
                console.warn("⚠️ 보안 연결 시도 중 네트워크 오류 발생. 평문 모드로 임시 전환합니다.", e.message);
                currentRoomCryptoKey = 'PLAIN'; 
                setTimeout(() => appendSystemMessage("⚠️ 네트워크 지연으로 보안 설정을 불러오지 못했습니다. 임시 모드로 연결됩니다."), 500);
            }

            // 3. 최종적으로 소켓 방 입장 알림
            socket.emit('room:join', roomId);

        } catch (err) {
            console.error("방 입장 에러:", err);
        }
    }

    // 🚀 새로운 방 비밀번호를 생성하고 상대방 자물쇠로 잠가서 서버에 보내는 공통 함수
    async function createAndShareNewSecret(roomId, targetUserId) {
        // 1. 상대방 자물쇠(Public Key) 가져오기
        const keyRes = await fetch(`${SERVER_URL}/api/user/${targetUserId}/public_key`);
        if (!keyRes.ok) throw new Error("상대방 자물쇠 없음");
        const keyData = await keyRes.json();

        // 2. 새로운 랜덤 암호 생성
        const newSecret = Math.random().toString(36).substring(2, 15);
        
        // 3. 상대방 자물쇠로 잠그기
        const encryptor = new JSEncrypt();
        encryptor.setPublicKey(keyData.publicKey);
        const encryptedForPartner = encryptor.encrypt(newSecret);

        // 4. 내 자물쇠로도 잠그기 (나중에 내가 다시 들어올 때 써야 하니까!)
        const myEncryptor = new JSEncrypt();
        myEncryptor.setPublicKey(localStorage.getItem('my_public_key'));
        const encryptedForMe = myEncryptor.encrypt(newSecret);

        // 5. 서버에 두 명 몫의 암호를 각각 저장 (API가 지원하도록 수정 필요)
        await fetch(`${SERVER_URL}/api/room/secret`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, targetUserId, encryptedSecret: encryptedForPartner })
        });
        
        await fetch(`${SERVER_URL}/api/room/secret`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, targetUserId: currentUser.userId, encryptedSecret: encryptedForMe })
        });

        currentRoomCryptoKey = newSecret;
        console.log("✨ 새로운 보안 채널이 생성되었습니다.");
    }

    function openChat(roomId, roomName) {
        // 1. 화면 전환: 메인 화면(viewMain)을 숨기고, 채팅방 화면(viewChat)을 켭니다.
        if (typeof viewMain !== 'undefined' && viewMain) viewMain.classList.remove('active');
        if (typeof viewChat !== 'undefined' && viewChat) viewChat.classList.add('active');

        // 2. 채팅방 상단 제목 변경 (HTML 구조에 따라 ID가 다를 수 있으니 튼튼하게 방어!)
        const titleEl = document.getElementById('chat-room-title') || 
                        document.getElementById('chat-title') || 
                        document.querySelector('.chat-header .title');
        if (titleEl) {
            titleEl.textContent = roomName;
        }

        // 3. 화면에 남아있던 이전 대화 지우기 & 로컬 캐시에서 내역 불러오기
        if (typeof messagesContainer !== 'undefined' && messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        
        if (typeof loadChatHistoryFromCache === 'function') {
            loadChatHistoryFromCache(roomId);
        }
        
        // 4. 스크롤을 맨 아래로!
        if (typeof scrollToBottom === 'function') {
            scrollToBottom();
        }
    }

    // 🚀 3. 방을 나갈 때 (채팅방 닫기)
    function closeChat() {
        currentRoomId = null;
        currentRoomCryptoKey = null; // 메모리에서만 지웁니다 (localStorage에는 남아있어 다음엔 바로 입장 가능)
        viewChat.classList.remove('active');
        viewMain.classList.add('active');
    }

    chatInput.addEventListener('input', () => { chatSendBtn.disabled = chatInput.value.trim() === ''; });
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !chatSendBtn.disabled) sendChatMessage(); });
    chatSendBtn.addEventListener('click', sendChatMessage);

    function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentRoomId) return;

        // 🚀 1. 원래부터 SMS 전용 가상 채팅방인 경우 (주소록 비가입자)
        if (currentRoomId.startsWith('sms_')) {
            const receiverPhone = currentRoomId.replace('sms_', '');
            
            if (typeof AndroidBridge !== 'undefined' && AndroidBridge.sendActualSms) {
                AndroidBridge.sendActualSms(receiverPhone, text);
            } else {
                if (socket) socket.emit('sms:send_request', { receiver: receiverPhone, message: text });
            }

            appendMessage({
                id: 'msg_' + Date.now(),
                roomId: currentRoomId,
                userId: currentUser.userId,
                displayName: currentUser.displayName,
                text: text,
                timestamp: Date.now()
            });

            chatInput.value = '';
            chatSendBtn.disabled = true;
            chatInput.focus();
            closeAllChatMenus();
            return; 
        }
        
        // 🚀 2. 일반 채팅방: 상대방 상태와 무관하게 무조건 서버로 전송 (앱 내 대화 기록용)
        let finalMessage = text;
        if (currentRoomCryptoKey && currentRoomCryptoKey !== 'PLAIN' && currentRoomCryptoKey !== 'SMS_MODE') {
            finalMessage = CryptoJS.AES.encrypt(text, currentRoomCryptoKey).toString();
        }
        
        // 소켓으로 발사! (서버 파일 및 DB에 안전하게 암호화되어 저장됨)
        socket.emit('message:send', { roomId: currentRoomId, text: finalMessage });

        // 🚀 3. [수정됨] 상대방이 오프라인일 때 '실제 대화 내용'을 문자로 전송!
        const roomInfo = activeRooms.get(currentRoomId);
        const targetUserId = roomInfo ? roomInfo.otherUserId : null;
        const isOnline = onlineUsersList.some(u => String(u.userId) === String(targetUserId));

        if (!isOnline && targetUserId) {
            const friend = myFriendsList.find(f => String(f.userId) === String(targetUserId))
                        || mySyncedMembers.find(m => String(m.userId) === String(targetUserId));

            if (friend && friend.phoneNumber) {
                if (typeof AndroidBridge !== 'undefined' && AndroidBridge.sendActualSms) {
                    // 🚨 사용자가 입력한 실제 메시지(text)를 평문으로 발송합니다!
                    // 상대방이 앱 출처임을 알 수 있게 말머리를 살짝 붙여줍니다.
                    const fallbackMsg = `[Aura]\n${text}`;
                    AndroidBridge.sendActualSms(friend.phoneNumber, fallbackMsg);
                    
                    appendSystemMessage('📱 상대방이 오프라인이라 통신사 문자로 대화 내용이 전송되었습니다.');
                }
            } else {
                appendSystemMessage('💾 상대방이 오프라인입니다. (전화번호가 없어 문자로 우회할 수 없습니다)');
            }
        }
        
        // 4. 입력창 초기화 및 서랍 닫기
        chatInput.value = '';
        chatSendBtn.disabled = true;
        chatInput.focus();
        closeAllChatMenus();
    }
    
    function appendMessage(msg, isFromCache = false) {
        // 🚀 [추가] 중복 메시지 차단 (기존 디자인 유지하며 로직만 추가)
        if (msg.id && document.querySelector(`[data-msg-id="${msg.id}"]`)) {
            return; 
        }

        // [내 메시지 판별]
        const isMine = String(msg.userId) === String(currentUser.userId);
        
        // [아바타 설정]
        let avatarStyle = '';
        let avatarText = msg.displayName ? msg.displayName.charAt(0) : '?';
        if (isMine && currentUser.avatarUrl) {
            avatarStyle = `style="background-image:url('${currentUser.avatarUrl}');"`;
            avatarText = '';
        } else if (!isMine && msg.avatarUrl) {
            avatarStyle = `style="background-image:url('${msg.avatarUrl}');"`;
            avatarText = '';
        }

        // [콘텐츠 판별] 텍스트 vs 이미지
        let messageContent = `<div class="msg-bubble">${msg.text}</div>`;
        if (msg.text && msg.text.startsWith('[IMAGE]:')) {
            const filename = msg.text.split('[IMAGE]:')[1];
            const imgUrl = `${SERVER_URL}/uploads/${filename}`;
            const uniqueId = 'img_' + Math.random().toString(36).substr(2, 9);
            
            messageContent = `
                <div class="msg-bubble" id="${uniqueId}" style="background:transparent; padding:0; box-shadow:none;">
                    <img src="${imgUrl}" style="max-width: 200px; border-radius: 12px; border: 1px solid #e5e5e5; display: block;">
                    ${isMine ? `<button onclick="deleteAttachedFile('${filename}', '${uniqueId}')" style="margin-top:5px; font-size:11px; color:#e74c3c; background:#fff; padding:4px 8px; border-radius:8px; border:1px solid #e74c3c;"><i class="fas fa-trash-alt"></i> 서버에서 파기</button>` : ''}
                </div>
            `;
    }

    // 🚀 [여기서부터 CSS 클래스 완벽 복구]
    const messagesContainer = document.getElementById('chat-messages'); // 채팅창 컨테이너 아이디 확인
    if (!messagesContainer) return;

    const row = document.createElement('div');
    // 기존 CSS가 타겟팅하는 'me'와 'other' 클래스를 정확히 부여합니다.
    row.className = `msg-row ${isMine ? 'me' : 'other'}`;
    // 중복 체크를 위한 ID 심기
    if (msg.id) row.setAttribute('data-msg-id', msg.id);

    row.innerHTML = `
        ${!isMine ? `<div class="msg-avatar" ${avatarStyle}>${avatarText}</div>` : ''}
        <div class="msg-info">
            ${!isMine ? `<div class="msg-sender">${msg.displayName}</div>` : ''}
            ${messageContent}
            <div class="msg-time" style="font-size: 11px; color: #999; margin-top: 4px;">
                ${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
        </div>
    `;

    messagesContainer.appendChild(row);
    scrollToBottom();

    if (!isFromCache && currentRoomId) {
        saveMessageToCache(currentRoomId, msg);
    }
}

    function appendSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'sys-msg';
        div.innerHTML = `<span>${text}</span>`;
        messagesContainer.appendChild(div);
    }

    function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

    // ============================================================
    // 🚀 채팅방 우측 햄버거 메뉴 (서랍) & 나가기
    // ============================================================
    function openChatMenu() {
        document.getElementById('chat-menu-overlay').style.display = 'flex';
        renderChatParticipants(); 
    }

    function closeChatMenu() {
        document.getElementById('chat-menu-overlay').style.display = 'none';
    }

    function renderChatParticipants() {
        const listContainer = document.getElementById('chat-participants-list');
        listContainer.innerHTML = '';
        
        const room = activeRooms.get(currentRoomId);
        if (!room || !room.users) return;

        room.users.forEach(user => {
            const isMe = String(user.userId) === String(currentUser.userId);
            const initial = user.displayName ? user.displayName.charAt(0) : '?';
            
            listContainer.innerHTML += `
                <div class="list-item" style="padding: 10px 20px;">
                    <div class="avatar" style="width: 36px; height: 36px; border-radius: 14px; font-size: 14px;">${initial}</div>
                    <div class="item-info">
                        <div class="item-name" style="font-size: 14px;">
                            ${user.displayName} ${isMe ? '<span style="color:#b2b2b2; font-size: 12px;">(나)</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    function leaveRoom() {
        if (!currentRoomId) return;
        if (!confirm('정말 채팅방에서 나가시겠습니까?\n(대화 내역이 모두 삭제되며 목록에서 사라집니다.)')) return;

        socket.emit('room:leave', { roomId: currentRoomId });
        localStorage.removeItem('k_chat_history_' + currentRoomId);
        
        try {
            let saved = JSON.parse(localStorage.getItem('k_my_rooms') || '[]');
            saved = saved.filter(r => r.id !== currentRoomId);
            localStorage.setItem('k_my_rooms', JSON.stringify(saved));
        } catch(e) {}

        activeRooms.delete(currentRoomId);
        closeChatMenu();
        closeChat();
        renderRooms();
    }

    // ============================================================
    // 🚀 서랍 메뉴 (+ 및 이모티콘) 열기/닫기 로직
    // ============================================================
    const attachMenu = document.getElementById('chat-attach-menu');
    const emojiMenu = document.getElementById('chat-emoji-menu');

    // [+] 버튼 누를 때
    document.getElementById('chat-attach-btn').addEventListener('click', () => {
        if (attachMenu.classList.contains('active')) {
            attachMenu.classList.remove('active');
        } else {
            attachMenu.classList.add('active');
            emojiMenu.classList.remove('active'); // 다른 서랍 닫기
        }
        scrollToBottom();
    });

    // 🚀 [앨범] 아이콘을 누르면 숨겨진 fileInput을 클릭한 것처럼 작동
    document.querySelector('.attach-item:nth-child(1)').onclick = () => {
        fileInput.click();
        closeAllChatMenus(); // 서랍 닫기
    };

    // 🚀 사진을 선택하면 바로 서버에 업로드!
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            // 서버에 파일 전송
            const res = await fetch(SERVER_URL + '/api/upload', {
                method: 'POST',
                body: formData // 파일은 JSON이 아니라 FormData로 보냅니다
            });
            const data = await res.json();

            if (data.success) {
                // 업로드 성공 시, 소켓으로 '이미지 파일명'을 특별한 태그와 함께 전송
                const imgMessage = `[IMAGE]:${data.filename}`;
                socket.emit('message:send', { roomId: currentRoomId, text: imgMessage });
            } else {
                alert('업로드 실패: ' + data.error);
            }
        } catch (err) {
            alert('파일 전송 중 오류가 발생했습니다.');
        }
        fileInput.value = ''; // 다음 업로드를 위해 초기화
    });

    // 🚀 수동 삭제 함수 (사용자가 원할 때 언제든 파일 파기)
    async function deleteAttachedFile(filename, elementId) {
        if (!confirm('서버에서 이 파일을 영구적으로 파기하시겠습니까?')) return;
        
        try {
            await fetch(`${SERVER_URL}/api/upload/${filename}`, { method: 'DELETE' });
            // 화면에서도 안 보이게 처리
            const imgEl = document.getElementById(elementId);
            if (imgEl) {
                imgEl.innerHTML = '<div style="color:#e74c3c; font-size:12px;"><i class="fas fa-ban"></i> 서버에서 파기된 이미지입니다.</div>';
            }
        } catch (e) {
            console.error('삭제 실패');
        }
    }

    // [스마일] 버튼 누를 때
    document.getElementById('chat-emoji-btn').addEventListener('click', () => {
        if (emojiMenu.classList.contains('active')) {
            emojiMenu.classList.remove('active');
        } else {
            emojiMenu.classList.add('active');
            attachMenu.classList.remove('active'); // 다른 서랍 닫기
        }
        scrollToBottom();
    });

    // 이모지 콕 찍었을 때 입력창에 넣기
    function insertEmoji(emoji) {
        chatInput.value += emoji;
        chatSendBtn.disabled = false; // 글자가 들어갔으니 노란 전송버튼 활성화!
        chatInput.focus(); 
    }

    // 텍스트 창을 터치하거나 빈 메시지 공간을 누르면 열려있던 서랍 닫기
    chatInput.addEventListener('focus', closeAllChatMenus);
    messagesContainer.addEventListener('click', closeAllChatMenus);

    function closeAllChatMenus() {
        attachMenu.classList.remove('active');
        emojiMenu.classList.remove('active');
    }

    // 전송 버튼을 누르면 서랍도 같이 닫히게 sendChatMessage 함수 끝에 한 줄 추가!
    const originalSendChatMessage = sendChatMessage;
    sendChatMessage = function() {
        originalSendChatMessage();
        closeAllChatMenus(); // 🚀 메시지 전송 후 서랍 스르륵 닫기
    };

    // ============================================================
    // 🚀 로컬 캐시 스토리지 관리
    // ============================================================
    function saveRoomToLocal(roomId, roomName, roomType, otherUserId) {
        if (!roomId) return;
        try {
            let saved = JSON.parse(localStorage.getItem('k_my_rooms') || '[]');
            const existingIndex = saved.findIndex(r => r.id === roomId);
            
            if (existingIndex === -1) {
                // 처음 저장할 때 상대방 ID도 같이 저장!
                saved.push({ id: roomId, name: roomName || '채팅방', type: roomType || 'public', otherUserId: otherUserId });
                localStorage.setItem('k_my_rooms', JSON.stringify(saved));
            } else {
                let updated = false;
                if (!saved[existingIndex].type && roomType) { saved[existingIndex].type = roomType; updated = true; }
                
                // 🚀 핵심: 상대방 ID를 발견하면 내 스마트폰에 영구 각인!
                if (otherUserId && otherUserId !== '알수없음' && saved[existingIndex].otherUserId !== otherUserId) {
                    saved[existingIndex].otherUserId = otherUserId;
                    updated = true;
                }
                if (updated) localStorage.setItem('k_my_rooms', JSON.stringify(saved));
            }
        } catch(e) {}
    }

    function restoreMyRooms() {
        try {
            let saved = JSON.parse(localStorage.getItem('k_my_rooms') || '[]');
            if (saved.length > 0) {
                saved.forEach(room => {
                    // 🚀 로컬에 저장된 방(상대방 ID 포함)을 그대로 메모리에 복구!
                    activeRooms.set(room.id, room); 
                    socket.emit('room:restore', { roomId: room.id, name: room.name, type: room.type });
                });
                renderRooms();
            }
        } catch(e) {}
    }

    function saveMessageToCache(roomId, msg) {
        if (!roomId || !msg) return;
        try {
            const cacheKey = 'k_chat_history_' + roomId;
            let history = JSON.parse(localStorage.getItem(cacheKey) || '[]');
            history.push(msg); 
            if (history.length > 200) history.shift(); 
            localStorage.setItem(cacheKey, JSON.stringify(history));
        } catch(e) { }
    }

    function loadChatHistoryFromCache(roomId) {
        try {
            const cacheKey = 'k_chat_history_' + roomId;
            const history = JSON.parse(localStorage.getItem(cacheKey) || '[]');
            if (history.length > 0) {
                history.forEach(msg => appendMessage(msg, true));
            }
        } catch(e) {}
    }

    // 🔓 서버에서 내 몫의 암호를 다시 가져와 해독하는 함수
    async function refreshRoomSecret(roomId) {
        try {
            const res = await fetch(`${SERVER_URL}/api/room/${roomId}/secret/${currentUser.userId}`);
            if (!res.ok) return;

            const data = await res.json();
            const myPrivateKey = localStorage.getItem('my_private_key');
            
            if (!myPrivateKey) return;

            const decryptor = new JSEncrypt();
            decryptor.setPrivateKey(myPrivateKey);
            
            const decryptedSecret = decryptor.decrypt(data.encryptedSecret);
            if (decryptedSecret) {
                currentRoomCryptoKey = decryptedSecret;
                console.log("🔐 방 암호가 최신으로 동기화되었습니다!");
                return true;
            }
        } catch (e) {
            console.error("암호 동기화 실패:", e);
        }
        return false;
    }

    // 🚀 앱(Native)에서 호출할 수 있도록 전역 함수로 노출
    window.setFcmToken = function(token) {
        const userId = localStorage.getItem('userId'); // 로그인된 사용자 ID
        
        if (userId && token) {
            // 서버에 토큰 전송
            fetch('https://aura.swnest.net/api/update-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, fcmToken: token })
            })
            .then(res => console.log("Token synced with server"))
            .catch(err => console.error("Token sync failed", err));
        }
    };

    // 설정 모달 열기
    function openSettings() {
        document.getElementById('settings-modal').style.display = 'block';
    }

    // 설정 모달 닫기
    function closeSettings() {
        document.getElementById('settings-modal').style.display = 'none';
    }

    /**
     * [Aura] 주소록 동기화 및 UI 렌더링 로직
    */

    // 1. 주소록 동기화 실행 함수 (완성본)
    function syncAddressBook() {
        if (!confirm("휴대폰 연락처에 있는 친구들을 불러오시겠습니까?")) return;

        if (typeof AndroidBridge === 'undefined') {
            alert("모바일 앱 환경에서만 동기화가 가능합니다.");
            return;
        }

        try {
            alert("동기화 중입니다...");
            const rawData = AndroidBridge.getContactList();

            alert("안드로이드 원본 데이터: " + rawData.substring(0, 150));
            
            const contactArray = JSON.parse(rawData);

            // 🚀 SERVER_URL 변수와 k_token을 사용하여 요청
            fetch(SERVER_URL + '/api/contacts/sync', { 
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('k_token')}`
                },
                body: JSON.stringify({ contacts: contactArray })
            })
            .then(res => {
                if (res.status === 401 || res.status === 403) {
                    throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
                }
                return res.json();
            })
            .then(data => {
                const debugEl = document.getElementById('debug-console');
                if(debugEl) debugEl.textContent = "서버 응답: " + JSON.stringify(data);

                if (data.success) {
                    // 🚀 [디버그용 알림 추가] 서버가 몇 명을 찾아냈는지 바로 팝업으로 띄워봅니다!
                    alert(`✅ 동기화 완료!\n- 아우라 가입자: ${data.members ? data.members.length : 0}명\n- 미가입자: ${data.nonMembers ? data.nonMembers.length : 0}명`);

                    mySyncedMembers = data.members || [];
                    mySyncedNonMembers = data.nonMembers || [];
                    
                    renderFriends(); 
                    if (typeof switchMainTab === 'function') switchMainTab('friends'); 
                }
            })
            .catch(err => {
                console.error("동기화 에러:", err);
                alert(err.message || "서버 통신 중 오류가 발생했습니다.");
            });
        } catch (e) {
            alert("주소록을 읽어올 수 없습니다.");
        }
    }

    /**
     * 2. SMS 실시간 중계(Relay) 리스너 설정
     * 이 부분은 페이지 로드 시(socket 연결 직후) 실행되어야 합니다.
     */
    function initSmsRelay() {
        if (!window.socket) return;

        // [수신] 서버가 다른 기기(폰)에서 온 문자를 나(PC/앱)에게 보여줄 때
        socket.on('sms:display', (data) => {
            const { sender, message, timestamp } = data;
            
            console.log(`[SMS 수신] ${sender}: ${message}`);
            
            if (typeof appendMessageToUI === 'function') {
                appendMessageToUI({
                    roomId: `sms_${sender.replace(/\D/g, '')}`,
                    userId: sender,
                    displayName: sender,
                    text: message,
                    isSMS: true,
                    timestamp: timestamp
                });
            }
        });

        // [발신 명령] 서버가 나에게 "실제 문자"를 보내라고 시킬 때 (안드로이드 전용)
        socket.on('sms:command_send', (data) => {
            const { receiver, message } = data;
            
            if (typeof AndroidBridge !== 'undefined' && AndroidBridge.sendActualSms) {
                console.log(`[Relay] 기기에서 문자 실제 발송 명령 수행: ${receiver}`);
                AndroidBridge.sendActualSms(receiver, message);
            }
        });
    }

    /**
     * 3. 안드로이드 기기가 직접 호출하는 전역 함수 (WebInterface 전용)
     */
    window.onSmsReceived = function(sender, message) {
        console.log("기기에서 문자 감지됨, 서버로 중계 시도");
        
        // 서버로 중계 신호를 보냄 (그래야 내 계정의 다른 기기에서도 보임)
        if (window.socket && socket.connected) {
            socket.emit('sms:bridge_to_server', {
                sender: sender,
                message: message,
                timestamp: Date.now()
            });
        }

        // 현재 내 앱 화면에도 즉시 표시
        if (typeof appendMessageToUI === 'function') {
            appendMessageToUI({
                roomId: `sms_${sender.replace(/\D/g, '')}`,
                userId: sender,
                text: message,
                isSMS: true,
                timestamp: Date.now()
            });
        }
    };

    // 4. 기존 휴대폰 번호 업데이트 로직 유지 (fetch 주소만 서버 환경에 맞게 수정 권장)
    function updatePhoneNumber(phone) {
        fetch(SERVER_URL + '/api/register_phone', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.userId, phoneNumber: phone })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert("번호가 변경되었습니다.");
                
                localStorage.setItem('k_phone', phone); 
                currentUser.phoneNumber = phone; 
                
                updateSettingsMyProfileUI(); 
            } else {
                alert("변경 실패: " + data.message);
            }
        })
        .catch(err => alert("서버 연결 오류가 발생했습니다."));
    }

    // 🚀 [신규 추가] 앱 시작 시 서버에 저장된 주소록 불러오기
    function loadSyncedContacts() {
        fetch(SERVER_URL + '/api/contacts/list', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('k_token')}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // 🚀 데이터를 전역 변수에 저장한 뒤
                mySyncedMembers = data.members || [];
                mySyncedNonMembers = data.nonMembers || [];
                
                // 🚀 화면 전체를 한 번에 다시 그립니다!
                renderFriends(); 
            }
        })
        .catch(err => console.error("주소록 불러오기 실패:", err));
    }

    // 🚀 [신규 추가] 앱 내 SMS 전용 가상 채팅방 열기
    function startSmsChat(phone, name) {
        const cleanPhone = phone.replace(/\D/g, '');
        const roomId = `sms_${cleanPhone}`;
        
        // 로컬 방 목록에 SMS 방으로 저장
        saveRoomToLocal(roomId, name, 'sms', cleanPhone);
        activeRooms.set(roomId, { id: roomId, name: name, type: 'sms', otherUserId: cleanPhone });
        
        currentRoomId = roomId;
        currentRoomCryptoKey = 'SMS_MODE'; // 암호화 패스 (문자는 평문으로 가야 함)
        
        openChat(roomId, name + " (문자 메시지)");
        
        setTimeout(() => {
            if (messagesContainer.innerHTML === '') {
                appendSystemMessage('💬 이 채팅방에서 입력한 메시지는 상대방의 휴대폰 문자로 바로 전송됩니다.');
            }
        }, 300);
    }