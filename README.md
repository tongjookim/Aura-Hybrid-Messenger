# 💬 Aura - Hybrid Secure Messenger

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android-green.svg)
![License](https://img.shields.io/badge/license-MIT-yellow.svg)

**Aura**는 Web(Node.js)과 Android WebView를 결합하여 만든 **하이브리드 보안 메신저 앱**입니다. 
서버조차 대화 내용을 알 수 없는 종단간 암호화(E2EE)를 지원하며, 상대방이 오프라인일 경우 내 스마트폰의 요금제를 통해 **통신사 SMS 문자로 자동 우회 전송(Fallback)**하는 강력한 끊김 방지 기능을 제공합니다.

---

## ✨ 주요 기능 (Key Features)

- 🔒 **종단간 암호화 (E2EE)**: RSA와 AES 알고리즘을 혼합하여 서버를 포함한 제3자가 메시지를 열람할 수 없도록 강력한 보안을 제공합니다.
- 📡 **오프라인 SMS 자동 전환 (Fallback)**: 수신자가 오프라인이거나 앱 미가입자인 경우, Android `SmsManager`와 JS Bridge를 연동하여 실제 통신사 SMS로 대화 내용 및 알림을 우회 전송합니다.
- 📇 **네이티브 주소록 동기화**: Android 시스템의 연락처를 읽어와 서버 DB와 대조하고, 가입자와 미가입자를 분리하여 친구 목록에 자동으로 렌더링합니다.
- 🔔 **실시간 푸시 알림**: Google Firebase Cloud Messaging (FCM)을 연동하여 앱이 백그라운드에 있을 때도 즉각적인 알림을 수신합니다.
- ⚡ **Race Condition 방어**: 네트워크 지연 시 다중 클라이언트가 E2EE 보안 키를 중복 생성하여 충돌하는 현상을 방어하는 정교한 예외 처리가 적용되어 있습니다.

---

## 🛠 기술 스택 (Tech Stack)

### Frontend & Backend (Web)
* **Runtime & Package Manager:** Node.js, npm
* **Backend:** Express, Socket.io, SQLite
* **Frontend:** Vanilla JS, HTML/CSS
* **Security:** CryptoJS, JSEncrypt

### Native (Android)
* **Language:** Java
* **Core:** WebView, WebAppInterface (JavascriptBridge)
* **Services:** Google Firebase Cloud Messaging (FCM), Android SmsManager

---

## 🚀 시작하기 (Getting Started)

프로젝트를 로컬에서 실행하고 테스트하기 위한 설정 방법입니다.

### ☑️ 사전 요구 사항 (Prerequisites)
* [Node.js](https://nodejs.org/) (v14 이상 권장) 및 **npm**
* [Android Studio](https://developer.android.com/studio)
* [Google Firebase](https://console.firebase.google.com/) 프로젝트 계정

### 1️⃣ 웹 서버 설정 (Backend & Frontend)

1. 저장소를 클론합니다.
   ```bash
   git clone [https://github.com/본인계정/Aura-Hybrid-Messenger.git](https://github.com/본인계정/Aura-Hybrid-Messenger.git)
   cd Aura-Hybrid-Messenger/server

## 🏗 2. 아키텍처 및 상세 동작 원리

Aura는 웹의 유연성과 네이티브의 강력한 시스템 접근 권한을 결합한 하이브리드 구조를 가집니다.

### 🔄 JS-Android Bridge 통신 구조
웹뷰 내의 Javascript와 안드로이드 네이티브(Java)는 `AndroidBridge`라는 인터페이스를 통해 양방향으로 통신합니다.

* **Native to Web**: 안드로이드가 수신한 실제 SMS나 발급받은 FCM 토큰을 `webView.evaluateJavascript`를 통해 웹의 전역 함수(`window.onSmsReceived`, `window.setFcmToken`)로 즉시 전달합니다.
* **Web to Native**: 웹 UI에서 발생한 주소록 동기화 요청이나 SMS 발송 명령을 `@JavascriptInterface`로 등록된 `getContactList()`, `sendActualSms()` 메서드를 통해 네이티브 시스템 API로 전달합니다.

### 🔐 3. 종단간 암호화(E2EE) 및 보안 매커니즘
본 프로젝트는 **Zero-Knowledge Architecture**를 지향하며, 서버는 암호화된 메시지 스트림만 중계할 뿐 실제 내용을 복호화할 수 없습니다.

1.  **키 생성**: 앱 최초 실행 시 `JSEncrypt`를 사용하여 기기 로컬에 RSA Key Pair(공개키/개인키)를 생성합니다.
2.  **키 교환**: 채팅방 입장 시 서버에서 상대방의 공개키를 가져와 랜덤하게 생성된 AES 대칭키(Secret Key)를 암호화하여 전달합니다.
3.  **암호화 통신**: 이후 모든 대화는 해당 대칭키를 이용해 AES-256 방식으로 암호화되어 서버 DB에 저장됩니다.
4.  **Race Condition 방어**: 두 유저가 동시에 입장하여 보안 키를 중복 생성하는 현상을 막기 위해, 서버 응답 상태(404 확인 후 생성)와 클라이언트 측 타임아웃 딜레이를 조합하여 세션 안정성을 확보했습니다.

### 📱 4. 하이브리드 Fallback (오프라인 메시징) 로직
상대방의 네트워크 상태에 관계없이 대화의 연속성을 보장하는 Aura만의 핵심 로직입니다.

* **상태 감지**: 메시지 전송 시 서버의 `onlineUsersList`를 체크하여 상대방의 접속 여부를 실시간 확인합니다.
* **자동 우회**: 상대방이 오프라인일 경우, `Socket.io` 전송과 동시에 네이티브 브릿지를 호출합니다.
* **하이브리드 전송**: 사용자의 기기에서 실제 통신사 SMS 알림(`[Aura] 새로운 메시지가 도착했습니다.`)을 발송하여 상대방의 앱 접속을 유도하며, 대화 내용은 서버 DB에 안전하게 보관되어 상대방 재접속 시 동기화됩니다.

---

## ⚖️ 라이선스 (License)

이 프로젝트는 **MIT 라이선스**를 따릅니다.
