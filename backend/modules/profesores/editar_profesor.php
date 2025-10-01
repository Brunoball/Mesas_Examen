<?php
// backend/modules/profesores/editar_profesor.php
require_once __DIR__ . '/../../config/db.php'; // crea $pdo (PDO)

header('Content-Type: application/json; charset=utf-8');

try {
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Traer profesor
        $sqlP = "
            SELECT d.id_docente   AS id_profesor,
                   d.docente      AS nombre_completo,
                   d.id_cargo,
                   c.cargo        AS cargo_nombre
            FROM mesas_examen.docentes d
            LEFT JOIN mesas_examen.cargos c ON c.id_cargo = d.id_cargo
            WHERE d.id_docente = :id
            LIMIT 1
        ";
        $st = $pdo->prepare($sqlP);
        $st->execute([':id' => $id]);
        $prof = $st->fetch(PDO::FETCH_ASSOC);

        if (!$prof) {
            echo json_encode(['exito' => false, 'mensaje' => 'Profesor no encontrado'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Lista de cargos
        $sqlC = "SELECT id_cargo, cargo FROM mesas_examen.cargos ORDER BY cargo ASC";
        $cargos = $pdo->query($sqlC)->fetchAll(PDO::FETCH_ASSOC) ?: [];

        echo json_encode([
            'exito'    => true,
            'profesor' => [
                'id_profesor'     => (int)$prof['id_profesor'],
                'nombre_completo' => $prof['nombre_completo'],
                'id_cargo'        => isset($prof['id_cargo']) ? (int)$prof['id_cargo'] : null,
                'cargo_nombre'    => $prof['cargo_nombre'] ?? null,
            ],
            'cargos'   => $cargos,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // POST: actualizar
    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $in  = json_decode($raw, true);

        $id_profesor = isset($in['id_profesor']) ? (int)$in['id_profesor'] : 0;
        $apellido    = isset($in['apellido']) ? trim($in['apellido']) : '';
        $nombre      = isset($in['nombre'])   ? trim((string)$in['nombre']) : '';
        $id_cargo    = isset($in['id_cargo']) ? (int)$in['id_cargo'] : 0;

        if ($id_profesor <= 0) {
            echo json_encode(['exito' => false, 'mensaje' => 'ID profesor inválido'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($apellido === '') {
            echo json_encode(['exito' => false, 'mensaje' => 'El apellido es obligatorio'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($id_cargo <= 0) {
            echo json_encode(['exito' => false, 'mensaje' => 'Debe seleccionar un cargo'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Armamos "APELLIDO, NOMBRE" (nombre puede ir vacío)
        $docente = $apellido;
        if ($nombre !== '') $docente .= ', ' . $nombre;

        $sqlU = "
            UPDATE mesas_examen.docentes
               SET docente = :docente,
                   id_cargo = :id_cargo
             WHERE id_docente = :id
            ";
        $st = $pdo->prepare($sqlU);
        $ok = $st->execute([
            ':docente'  => $docente,
            ':id_cargo' => $id_cargo,
            ':id'       => $id_profesor,
        ]);

        if (!$ok) {
            echo json_encode(['exito' => false, 'mensaje' => 'No se pudo actualizar'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        echo json_encode(['exito' => true, 'mensaje' => 'Actualizado'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido'], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
