<?php
// update_user.php
header('Content-Type: application/json');
// session_start(); // 세션이 필요하면 활성화
// include "db_conn.php"; // DB 연결 파일

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $phone = $_POST['phone'] ?? '';

    if (empty($phone)) {
        echo json_encode(['success' => false, 'message' => '번호가 비어있습니다.']);
        exit;
    }

    // DB 업데이트 예시 (실제 쿼리에 맞춰 수정하세요)
    // $sql = "UPDATE users SET phone = ? WHERE user_id = ?";
    // $stmt = $pdo->prepare($sql);
    // $result = $stmt->execute([$phone, $_SESSION['user_id']]);

    // 성공했다고 가정
    echo json_encode(['success' => true]);
}
?>
