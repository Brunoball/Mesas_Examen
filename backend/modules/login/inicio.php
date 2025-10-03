<?php
// backend/modules/login/inicio.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db.php'; // debe definir $pdo (PDO conectado)

define('DEBUG_LOGIN', false); // ponelo true si querés ver el detalle de errores en la respuesta

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        // Mantengo 405 para métodos inválidos (esto no ocurre en login normal)
        http_response_code(405);
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido.']);
        exit;
    }

    // Acepta JSON o x-www-form-urlencoded
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = $_POST ?? [];
    }

    $nombre     = isset($data['nombre']) ? trim((string)$data['nombre']) : '';
    $contrasena = isset($data['contrasena']) ? (string)$data['contrasena'] : '';

    if ($nombre === '' || $contrasena === '') {
        // ⚠️ IMPORTANTE: devolvemos 200 + exito:false, NO 401
        echo json_encode(['exito' => false, 'mensaje' => 'Faltan datos.']);
        exit;
    }

    // Buscar usuario (sin prefijar esquema)
    $sql = "SELECT * FROM usuarios WHERE Nombre_Completo = :nombre LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':nombre' => $nombre]);
    $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

    // Alternativas comunes de columna
    if (!$usuario) {
        $sqlAlt = "SELECT * FROM usuarios WHERE usuario = :nombre OR nombre = :nombre LIMIT 1";
        $stmt   = $pdo->prepare($sqlAlt);
        $stmt->execute([':nombre' => $nombre]);
        $usuario = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    if (!$usuario) {
        // ⚠️ 200 + exito:false (evita 401 en consola)
        echo json_encode(['exito' => false, 'mensaje' => 'Credenciales incorrectas.']);
        exit;
    }

    // Detectar columnas posibles
    $idUsuario = (int)($usuario['idUsuario'] ?? $usuario['id_usuario'] ?? $usuario['id'] ?? 0);
    $display   = (string)($usuario['Nombre_Completo'] ?? $usuario['nombre'] ?? $usuario['usuario'] ?? $nombre);
    $rol       = strtolower((string)($usuario['rol'] ?? $usuario['Rol'] ?? 'vista'));

    // Columnas de contraseña
    $hashFieldCandidates  = ['Hash_Contrasena', 'hash_contrasena', 'password_hash'];
    $plainFieldCandidates = ['Contrasena', 'contrasena', 'password'];

    $hashGuardado  = null;
    foreach ($hashFieldCandidates as $c) {
        if (array_key_exists($c, $usuario) && $usuario[$c] !== null && $usuario[$c] !== '') {
            $hashGuardado = (string)$usuario[$c];
            break;
        }
    }

    $passPlano = null;
    foreach ($plainFieldCandidates as $c) {
        if (array_key_exists($c, $usuario) && $usuario[$c] !== null && $usuario[$c] !== '') {
            $passPlano = (string)$usuario[$c];
            break;
        }
    }

    $ok = false;
    if ($hashGuardado !== null) {
        $ok = password_verify($contrasena, $hashGuardado);
    }
    if (!$ok && $passPlano !== null) {
        $ok = hash_equals($passPlano, $contrasena);
    }

    if (!$ok) {
        // ⚠️ 200 + exito:false (evita 401 en consola)
        echo json_encode(['exito' => false, 'mensaje' => 'Credenciales incorrectas.']);
        exit;
    }

    // Éxito
    echo json_encode([
        'exito'   => true,
        'usuario' => [
            'idUsuario'       => $idUsuario,
            'Nombre_Completo' => $display,
            'rol'             => $rol,
        ],
        // 'token' => '...' // si luego sumás JWT
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    // Errores inesperados sí son 500
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error del servidor.',
        'detalle' => DEBUG_LOGIN ? $e->getMessage() : null,
    ], JSON_UNESCAPED_UNICODE);
}
