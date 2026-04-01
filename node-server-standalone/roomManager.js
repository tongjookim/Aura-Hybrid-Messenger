/**
 * 채팅방 관리자 (순수 메모리 기반 - DB 저장 없음)
 *
 * 모든 데이터는 Node.js 프로세스 메모리에만 존재하며,
 * 서버 재시작 시 모든 방과 데이터가 완전히 소멸됩니다.
 */

const { v4: uuidv4 } = require('uuid');

class RoomManager {

    constructor() {
        /**
         * rooms: Map<roomId, RoomData>
         * RoomData = {
         *   id: string,
         *   name: string,
         *   type: 'public' | 'private' | 'dm',
         *   createdBy: string (userId),
         *   users: Map<userId, { userId, displayName, avatarUrl, socketId }>,
         *   createdAt: number (timestamp)
         * }
         */
        this.rooms = new Map();
        this.maxRoomUsers = parseInt(process.env.MAX_ROOM_USERS) || 50;
    }

    /**
     * 기본 채팅방 생성
     */
    createDefaultRoom() {
        const defaultName = process.env.DEFAULT_ROOM_NAME || '일반 채팅';
        const roomId = 'default-lobby';

        this.rooms.set(roomId, {
            id: roomId,
            name: defaultName,
            type: 'public',
            createdBy: 'system',
            users: new Map(),
            createdAt: Date.now(),
        });

        console.log(`[RoomManager] Default room created: "${defaultName}" (${roomId})`);
        return roomId;
    }

    /**
     * 채팅방 생성
     */
    createRoom(name, type, createdBy) {
        const roomId = 'room_' + uuidv4().slice(0, 8);

        const room = {
            id: roomId,
            name: name.slice(0, 50),
            type: type || 'public',
            createdBy,
            users: new Map(),
            createdAt: Date.now(),
        };

        this.rooms.set(roomId, room);
        console.log(`[RoomManager] Room created: "${name}" (${roomId}) by ${createdBy}`);
        return room;
    }

    /**
     * 1:1 DM 방 생성 또는 기존 방 반환
     */
    findOrCreateDM(userId1, userName1, userId2, userName2) {
        // 기존 DM 방 검색
        for (const [roomId, room] of this.rooms) {
            if (room.type === 'dm' && room.dmPair) {
                const [p1, p2] = room.dmPair;
                // 🚀 [핵심 수정] 참여자 2명이 정확히 일치하는지 확인 (순서 무관)
                // 나와의 채팅(p1=나, p2=나)과 타인과의 채팅을 완벽하게 구분해냅니다.
                if ((p1 === String(userId1) && p2 === String(userId2)) || 
                    (p1 === String(userId2) && p2 === String(userId1))) {
                    return room;
                }
            }
        }

        // 새 DM 방 생성
        const roomId = 'dm_' + uuidv4().slice(0, 8);
        const isSelfChat = String(userId1) === String(userId2);
        
        // 방 이름 예쁘게 분기 처리
        const roomName = isSelfChat ? `${userName1} (나와의 채팅)` : `${userName1} ↔ ${userName2}`;

        const room = {
            id: roomId,
            name: roomName,
            type: 'dm',
            createdBy: userId1,
            dmPair: [String(userId1), String(userId2)], // 나와의 채팅이면 ['나', '나'] 로 저장됨
            users: new Map(),
            createdAt: Date.now(),
        };

        this.rooms.set(roomId, room);
        console.log(`[RoomManager] DM room created: ${roomId} (${roomName})`);
        return room;
    }

    /**
     * 방에 사용자 추가
     */
    joinRoom(roomId, user) {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        if (room.users.size >= this.maxRoomUsers) {
            return { error: '방 최대 인원을 초과했습니다.' };
        }

        room.users.set(user.userId, {
            userId: user.userId,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            socketId: user.socketId,
        });

        return room;
    }

    /**
     * 방에서 사용자 제거
     */
    leaveRoom(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        room.users.delete(userId);

        // 🚀 만약 이 부분이 주석 해제되어 있다면, 여기도 dm은 안 지우도록 방어!
        if (room.users.size === 0 && roomId !== 'default-lobby' && room.type !== 'dm') {
             this.rooms.delete(roomId);
        }

        return room;
    }

    /**
     * 특정 사용자를 모든 방에서 제거
     */
    removeUserFromAllRooms(userId) {
        const affectedRooms = [];

        for (const [roomId, room] of this.rooms) {
            if (room.users.has(userId)) {
                room.users.delete(userId);
                affectedRooms.push(roomId);

                // 🚀 [원인 발견 및 수정!] 빈 방 자동 삭제 로직
                // DM 방(1:1 채팅, 나와의 채팅)은 인원이 0명이 되어도 절대 삭제하지 않고 유지합니다!
                if (room.users.size === 0 && roomId !== 'default-lobby' && room.type !== 'dm') {
                    this.rooms.delete(roomId);
                    console.log(`[RoomManager] Empty public room deleted: ${roomId}`);
                }
            }
        }

        return affectedRooms;
    }

    /**
     * 방 정보 조회
     */
    getRoom(roomId) {
        return this.rooms.get(roomId) || null;
    }

    /**
     * 공개 방 목록 (직렬화)
     */
    getPublicRooms() {
        const result = [];
        for (const [, room] of this.rooms) {
            if (room.type !== 'dm') {
                result.push(this.serializeRoom(room));
            }
        }
        return result;
    }

    /**
     * 사용자가 참여 중인 방 목록
     */
    getUserRooms(userId) {
        const result = [];
        for (const [, room] of this.rooms) {
            if (room.type === 'public') {
                // 오픈채팅방은 무조건 목록에 포함
                result.push(this.serializeRoom(room));
            } else if (room.type === 'dm') {
                // 🚀 [수정] 현재 접속(users) 여부가 아니라, 원래 이 방의 주인이 맞는지(dmPair) 확인!
                if (room.dmPair && room.dmPair.includes(String(userId))) {
                    const serialized = this.serializeRoom(room);
                    // 프론트엔드가 상대방을 쉽게 찾을 수 있도록 otherUserId를 끼워줍니다.
                    serialized.otherUserId = room.dmPair.find(id => id !== String(userId)) || String(userId);
                    result.push(serialized);
                }
            } else if (room.users.has(userId)) {
                result.push(this.serializeRoom(room));
            }
        }
        return result;
    }

    /**
     * 방 데이터 직렬화 (클라이언트 전송용)
     */
    serializeRoom(room) {
        return {
            id: room.id,
            name: room.name,
            type: room.type,
            createdBy: room.createdBy,
            dmPair: room.dmPair || null, // 🚀 [수정] 프론트엔드 방어막을 통과하기 위해 dmPair 명단도 같이 보냅니다!
            users: Array.from(room.users.values()),
            createdAt: room.createdAt,
        };
    }
}

module.exports = RoomManager;
