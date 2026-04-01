<?php
// 1. 환경 설정 파일 읽어오기
$config = parse_ini_file('config/dbconfig.conf');
$CHAT_SERVER_URL = $config['SERVER_URL'];

// 2. 헤더 불러오기
include_once 'head.php';
?>

<div id="app">
    <div id="splash-view" class="view active">
        <div class="splash-logo"><i class="fas fa-comment-dots"></i></div>
        <div class="splash-title">Aura</div>
    </div>

    <div id="login-view" class="view">
        <div class="login-header-logo"><i class="fas fa-comment"></i></div>
        <div class="login-box">
            <h2 style="font-size: 20px; margin-bottom: 25px; color: #333;" id="login-box-title">로그인</h2>
            <input type="text" id="login-id" class="login-input" placeholder="아이디" autocomplete="off">
            <input type="password" id="login-pw" class="login-input" placeholder="비밀번호">
            <input type="text" id="reg-name" class="login-input" placeholder="닉네임 (회원가입 시에만)" style="display:none;" autocomplete="off">
            <input type="tel" id="reg-phone" class="login-input" placeholder="휴대폰 번호 (010-1234-5678)" style="display:none;" autocomplete="off">
            
            <button id="btn-action" class="login-btn" onclick="handleLogin()">로그인</button>
            <div style="margin-top:20px; font-size:13px; color:#8b8b8b; cursor:pointer;" onclick="toggleRegister()">
                <span id="toggle-text" style="transition: color 0.2s;">계정이 없으신가요? 회원가입</span>
            </div>
        </div>
    </div>

    <div id="main-view" class="view">
        <div class="header">
            <h1 id="main-title">친구</h1>
            <div class="header-actions" style="display: flex; align-items: center; gap: 12px;">
                <button id="btn-add-friend" onclick="addFriend()"><i class="fas fa-user-plus"></i></button>
                <button id="btn-create-room" style="display: none;"><i class="fas fa-comment-medical"></i></button>
                <button id="btn-settings" onclick="openSettings()"><i class="fas fa-cog"></i></button>
            </div>
        </div>
        
        <div class="main-content">
            <ul id="list-friends" style="display: block;">
                <div id="my-profile-container"></div>
                <div style="padding: 10px 20px; font-size: 12px; color: #8b8b8b;">접속 중인 친구 <span id="friend-count">0</span></div>
                <div id="friends-container"></div>
            </ul>
            
            <ul id="list-rooms" style="display: none;">
                <div id="rooms-container"></div>
            </ul>
            
            <ul id="list-openchat" style="display: none;">
                <div id="openchat-container"></div>
            </ul>

            <ul id="list-settings" style="display: none;">
                <div class="my-profile-section" style="background:#fff; border-bottom:1px solid #e5e5e5;" onclick="openProfileModal(currentUser.userId, currentUser.displayName, true)">
                    <div style="display:flex; align-items:center;">
                        <div class="avatar" id="setting-my-avatar">?</div>
                        <div class="item-info">
                            <div class="item-name" id="setting-my-name">이름</div>
                            <div class="item-sub" id="setting-my-id">ID: ?</div>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                </div>

                <div class="settings-group">
                    <div class="settings-header" style="padding: 10px 15px; font-size: 12px; color: #888;">친구 및 계정 관리</div>
                    
                    <div class="settings-item" onclick="syncAddressBook()">
                        <div><i class="fas fa-sync-alt icon"></i> 주소록 친구 동기화</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>

                    <div class="settings-item" onclick="openPhoneEdit()">
                        <div><i class="fas fa-mobile-alt icon"></i> 휴대폰 번호 변경</div>
                        <div style="display:flex; align-items:center;">
                            <span id="display-phone" style="font-size:13px; color:#888; margin-right:5px;">010-0000-0000</span>
                            <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                        </div>
                    </div>
                </div>

                <div class="settings-group">
                    <div class="settings-item" onclick="toggleSound()">
                        <div><i class="fas fa-bell icon"></i> 메시지 알림음</div>
                        <div class="toggle-btn on" id="sound-toggle-btn">ON</div>
                    </div>
                </div>

                <div class="settings-group">
                    <div class="settings-item" onclick="alert('오픈소스 라이브러리:\n- Socket.io (MIT)\n- FontAwesome (Free)\n- Node.js & Express')">
                        <div><i class="fas fa-code icon"></i> 오픈소스 라이브러리</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>
                    <div class="settings-item" onclick="alert('개발자 정보:\n버전: 1.0.0\n개발: WP Secure Chat Team')">
                        <div><i class="fas fa-info-circle icon"></i> 개발자 정보</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>
                </div>

                <div class="settings-group">
                    <div class="settings-header" style="padding: 10px 15px; font-size: 12px; color: #888;">법적 공지 및 정책</div>
                    
                    <div class="settings-item" onclick="window.open('https://www.swn.kr/terms/', '_blank')">
                        <div><i class="fas fa-file-contract icon"></i> 이용약관</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>

                    <div class="settings-item" onclick="window.open('https://www.swn.kr/terms/privacy_v3/', '_blank')">
                        <div><i class="fas fa-user-shield icon"></i> 개인정보 처리방침</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>

                    <div class="settings-item" onclick="window.open('https://www.swn.kr/cs-center/youth-protection-policy/', '_blank')">
                        <div><i class="fas fa-child icon"></i> 청소년 보호 정책</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>

                    <div class="settings-item" onclick="window.open('https://www.swn.kr/terms/terms-and-conditions-of-use-of-location-based-services/', '_blank')">
                        <div><i class="fas fa-map-marker-alt icon"></i> 위치 기반 서비스 이용 약관</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>
                </div>

                <div class="settings-group">
                    <div class="settings-item" onclick="window.open('https://www.swn.kr/cs-center/opt-out-of-unauthorized-email-collection/', '_blank')">
                        <div><i class="fas fa-envelope-slash icon"></i> 이메일 수집 금지</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>

                    <div class="settings-item" onclick="window.open('https://www.swn.kr/terms/operations-policies/', '_blank')">
                        <div><i class="fas fa-ban icon" style="color: #e74c3c;"></i> 수완뉴스 운영정책</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>
                </div>

                <div class="settings-group">
                    <div class="settings-item" onclick="window.open('https://www.swn.kr/cs-center/', '_blank')">
                        <div><i class="fas fa-question-circle icon"></i> 도움말 문서</div>
                        <i class="fas fa-chevron-right" style="color:#b2b2b2;"></i>
                    </div>
                </div>

                <div class="settings-group" style="margin-bottom: 30px;">
                    <div class="settings-item" onclick="logout()" style="justify-content: center; color: #e74c3c; font-weight: bold;">
                        로그아웃
                    </div>
                </div>
            </ul>
        </div>
        
        <div class="tab-bar">
            <div class="tab-item active" data-target="friends" onclick="switchMainTab('friends')"><i class="fas fa-user"></i></div>
            <div class="tab-item" data-target="rooms" onclick="switchMainTab('rooms')"><i class="fas fa-comment"></i></div>
            <div class="tab-item" data-target="openchat" onclick="switchMainTab('openchat')"><i class="fas fa-comments"></i></div>
            <div class="tab-item" data-target="settings" onclick="switchMainTab('settings')"><i class="fas fa-cog"></i></div>
        </div>
    </div>

    <div id="chat-view" class="view">
        <div class="chat-header">
            <button onclick="closeChat()"><i class="fas fa-arrow-left"></i></button>
            <h2 id="chat-room-name" style="flex: 1; text-align: center;">채팅방</h2>
            <button onclick="openChatMenu()"><i class="fas fa-bars"></i></button> </div>
        <div class="chat-messages" id="chat-messages"></div>
        
        <div class="chat-input-area">
            <button id="chat-attach-btn" class="icon-btn"><i class="fas fa-plus"></i></button>
            
            <div class="input-wrapper">
                <input type="text" id="chat-input" placeholder="메시지 입력" autocomplete="off">
                <button id="chat-emoji-btn" class="icon-btn" style="width: auto; padding-left: 5px;"><i class="far fa-smile"></i></button>
            </div>
            
            <button id="chat-send-btn" disabled><i class="fas fa-paper-plane"></i></button>
        </div>

        <div id="chat-attach-menu" class="chat-bottom-menu">
            <div class="attach-grid">
                <div class="attach-item" onclick="alert('사진 전송 기능은 준비 중입니다!')">
                    <div class="attach-icon" style="background:#2ecc71;"><i class="fas fa-image"></i></div>
                    <span>앨범</span>
                </div>
                <div class="attach-item" onclick="alert('카메라 기능은 준비 중입니다!')">
                    <div class="attach-icon" style="background:#3498db;"><i class="fas fa-camera"></i></div>
                    <span>카메라</span>
                </div>
                <!--<div class="attach-item" onclick="alert('선물하기 기능은 준비 중입니다!')">
                    <div class="attach-icon" style="background:#e74c3c;"><i class="fas fa-gift"></i></div>
                    <span>선물하기</span>
                </div>
                <div class="attach-item" onclick="alert('송금 기능은 준비 중입니다!')">
                    <div class="attach-icon" style="background:#f1c40f;"><i class="fas fa-won-sign"></i></div>
                    <span>송금</span>
                </div>-->
            </div>
        </div>

        <div id="chat-emoji-menu" class="chat-bottom-menu">
            <div class="emoji-grid">
                <span onclick="insertEmoji('😀')">😀</span><span onclick="insertEmoji('😂')">😂</span>
                <span onclick="insertEmoji('😍')">😍</span><span onclick="insertEmoji('🥰')">🥰</span>
                <span onclick="insertEmoji('😎')">😎</span><span onclick="insertEmoji('😭')">😭</span>
                <span onclick="insertEmoji('😡')">😡</span><span onclick="insertEmoji('👍')">👍</span>
                <span onclick="insertEmoji('❤️')">❤️</span><span onclick="insertEmoji('✨')">✨</span>
                <span onclick="insertEmoji('🎉')">🎉</span><span onclick="insertEmoji('🔥')">🔥</span>
                <span onclick="insertEmoji('🤔')">🤔</span><span onclick="insertEmoji('🙏')">🙏</span>
                <span onclick="insertEmoji('👏')">👏</span><span onclick="insertEmoji('💯')">💯</span>
                <span onclick="insertEmoji('👋')">👋</span><span onclick="insertEmoji('💪')">💪</span>
            </div>
        </div>

        <div id="chat-menu-overlay" onclick="closeChatMenu()">
            <div class="chat-menu-panel" onclick="event.stopPropagation()">
                <div class="chat-menu-header">대화 상대</div>
                <div class="chat-menu-list" id="chat-participants-list">
                    </div>
                <div class="chat-menu-footer" onclick="leaveRoom()">
                    <i class="fas fa-sign-out-alt"></i> 채팅방 나가기
                </div>
            </div>
        </div>
    </div>
    <div id="profile-modal" class="modal-overlay" onclick="closeProfileModal()">
        <div class="profile-box" onclick="event.stopPropagation()">
            <button class="profile-close-btn" onclick="closeProfileModal()"><i class="fas fa-times"></i></button>
            <div class="profile-modal-avatar" id="profile-modal-avatar">?</div>
            <div class="profile-modal-name" id="profile-modal-name">이름</div>
            <div class="profile-modal-status" id="profile-modal-status">상태 메시지가 없습니다.</div>
            <div class="profile-actions" id="profile-actions"></div>
        </div>
    </div>

    <div id="input-modal" class="modal-overlay" onclick="closeInputModal()">
        <div class="profile-box" style="padding-bottom: 30px;" onclick="event.stopPropagation()">
            <div class="profile-modal-name" id="input-modal-title" style="margin-bottom: 20px;">제목</div>
            <input type="text" id="input-modal-field" class="login-input" style="margin-bottom: 20px; background: #f9f9f9;" placeholder="입력하세요" autocomplete="off">
            <div class="profile-actions">
                <button class="profile-action-btn" onclick="closeInputModal()" style="background: #e5e5e5; flex: 1;">취소</button>
                <button class="profile-action-btn" id="input-modal-submit" style="background: #FEE500; color: #3A1D1D; flex: 1;">확인</button>
            </div>
        </div>
    </div>
</div>

<?php
// 4. 푸터 불러오기 (설정값 변수도 함께 넘겨줌)
include_once 'footer.php';
?>