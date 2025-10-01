<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once(__DIR__ . '/../../config/db.php');

// OJO: nombre totalmente calificado (schema.table)
define('USUARIOS_TABLA', 'usuarios');

try {
    $raw = file_get_contents("php://input");
    $data = json_decode($raw, true);

    $nombre = isset($data['nombre']) ? trim((string)$data['nombre']) : '';
    $contrasena = isset($data['contrasena']) ? (string)$data['contrasena'] : '';
    $rol = isset($data['rol']) ? strtolower(trim((string)$data['rol'])) : ''; // ⬅️ rol desde el front

    // Validaciones básicas
    if ($nombre === '' || $contrasena === '' || $rol === '') {
        echo json_encode(['exito' => false, 'mensaje' => 'Faltan datos.']);
        exit;
    }
    if (mb_strlen($nombre) < 4 || mb_strlen($nombre) > 100) {
        echo json_encode(['exito' => false, 'mensaje' => 'El nombre debe tener entre 4 y 100 caracteres.']);
        exit;
    }
    if (strlen($contrasena) < 6) {
        echo json_encode(['exito' => false, 'mensaje' => 'La contraseña debe tener al menos 6 caracteres.']);
        exit;
    }

    // Validar rol (solo 'vista' o 'admin')
    $rolesValidos = ['vista', 'admin'];
    if (!in_array($rol, $rolesValidos, true)) {
        echo json_encode(['exito' => false, 'mensaje' => 'Rol inválido.']);
        exit;
    }

    // Verificar existencia (case-insensitive)
    $sqlExiste = "SELECT COUNT(*) FROM " . USUARIOS_TABLA . " WHERE UPPER(Nombre_Completo) = UPPER(:nombre)";
    $stmt = $pdo->prepare($sqlExiste);
    $stmt->execute(['nombre' => $nombre]);
    if ((int)$stmt->fetchColumn() > 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'El usuario ya existe.']);
        exit;
    }

    // Hash de contraseña
    $hash = password_hash($contrasena, PASSWORD_BCRYPT);

    // Insert con rol
    $sqlInsert = "INSERT INTO " . USUARIOS_TABLA . " (Nombre_Completo, Hash_Contrasena, rol)
                  VALUES (:nombre, :hash, :rol)";
    $stmtInsert = $pdo->prepare($sqlInsert);
    $ok = $stmtInsert->execute([
        'nombre' => $nombre,
        'hash'   => $hash,
        'rol'    => $rol
    ]);

    if ($ok) {
        $id = $pdo->lastInsertId();
        echo json_encode([
            'exito' => true,
            'usuario' => [
                'idUsuario'       => (int)$id,
                'Nombre_Completo' => $nombre,
                'rol'             => $rol
            ]
        ]);
    } else {
        echo json_encode(['exito' => false, 'mensaje' => 'Error al registrar usuario.']);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error del servidor.',
        'detalle' => $e->getMessage()
    ]);
}
