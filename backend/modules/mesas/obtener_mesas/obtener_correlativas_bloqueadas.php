<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        $dbPath = dirname(__DIR__, 3) . '/config/db.php';
        if (is_file($dbPath)) {
            require_once $dbPath;
        }
    }

    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('No hay conexión PDO disponible.');
    }

    require_once dirname(__DIR__) . '/helpers/correlativas.php';

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '[]', true);

    if (!is_array($data)) {
        throw new RuntimeException('JSON inválido.');
    }

    $numerosMesa = [];
    if (isset($data['numeros_mesa']) && is_array($data['numeros_mesa'])) {
        foreach ($data['numeros_mesa'] as $n) {
            $n = (int)$n;
            if ($n > 0) {
                $numerosMesa[] = $n;
            }
        }
    }

    $numerosMesa = array_values(array_unique($numerosMesa));

    $bloqueos = mesas_correlativas_bloqueos_por_numeros($pdo, $numerosMesa);

    echo json_encode([
        'exito' => true,
        'data' => $bloqueos,
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error obteniendo correlativas bloqueadas: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}