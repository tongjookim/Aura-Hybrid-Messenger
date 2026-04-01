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
