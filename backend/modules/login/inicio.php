<?php
// backend/routes/inicio.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db.php'; // debe definir $pdo (PDO conectado)

define('DEBUG_LOGIN', false); // ponelo true si querés ver el detalle de errores en la respuesta

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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
        echo json_encode(['exito' => false, 'mensaje' => 'Faltan datos.']);
        exit;
    }

    // 🔑 Importante: NO prefijar esquema. Usamos la DB actual de la conexión ($pdo).
    // Como los nombres de columnas pueden variar, traemos todo y resolvemos en PHP.
    $sql = "SELECT * FROM usuarios WHERE Nombre_Completo = :nombre LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':nombre' => $nombre]);
    $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

    // Si no se encontró por Nombre_Completo, probamos alternativas comunes (opcional)
    if (!$usuario) {
        $sqlAlt = "SELECT * FROM usuarios WHERE usuario = :nombre OR nombre = :nombre LIMIT 1";
        $stmt   = $pdo->prepare($sqlAlt);
        $stmt->execute([':nombre' => $nombre]);
        $usuario = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    if (!$usuario) {
        http_response_code(401);
        echo json_encode(['exito' => false, 'mensaje' => 'Credenciales incorrectas.']);
        exit;
    }

    // Detectar columnas posibles
    $idUsuario = (int)($usuario['idUsuario'] ?? $usuario['id_usuario'] ?? $usuario['id'] ?? 0);
    $display   = (string)($usuario['Nombre_Completo'] ?? $usuario['nombre'] ?? $usuario['usuario'] ?? $nombre);
    $rol       = strtolower((string)($usuario['rol'] ?? $usuario['Rol'] ?? 'vista'));

    // Columnas de contraseña posibles
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
        // Verifica bcrypt/argon/etc.
        $ok = password_verify($contrasena, $hashGuardado);
    }
    // Fallback si se guarda en texto plano (no recomendado, pero compatible)
    if (!$ok && $passPlano !== null) {
        $ok = hash_equals($passPlano, $contrasena);
    }

    if (!$ok) {
        http_response_code(401);
        echo json_encode(['exito' => false, 'mensaje' => 'Credenciales incorrectas.']);
        exit;
    }

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
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error del servidor.',
        'detalle' => DEBUG_LOGIN ? $e->getMessage() : null,
    ], JSON_UNESCAPED_UNICODE);
}
