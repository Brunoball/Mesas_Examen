<?php
// backend/modules/profesores/editar_profesor.php
require_once __DIR__ . '/../../config/db.php'; // crea $pdo (PDO)

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Traer profesor con turnos/fechas y fecha_carga (sin prefijo de BD)
        $sqlP = "
            SELECT
                d.id_docente   AS id_profesor,
                d.docente      AS nombre_completo,
                d.id_cargo,
                c.cargo        AS cargo_nombre,

                d.id_turno_si,
                ts.turno       AS turno_si_nombre,
                d.fecha_si,

                d.id_turno_no,
                tn.turno       AS turno_no_nombre,
                d.fecha_no,

                d.fecha_carga
            FROM docentes d
            LEFT JOIN cargos  c  ON c.id_cargo  = d.id_cargo
            LEFT JOIN turnos  ts ON ts.id_turno = d.id_turno_si
            LEFT JOIN turnos  tn ON tn.id_turno = d.id_turno_no
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

        // Listas
        $sqlC = "SELECT id_cargo, cargo FROM cargos ORDER BY cargo ASC";
        $cargos = $pdo->query($sqlC)->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $sqlT = "SELECT id_turno, turno FROM turnos ORDER BY turno ASC";
        $turnos = $pdo->query($sqlT)->fetchAll(PDO::FETCH_ASSOC) ?: [];

        echo json_encode([
            'exito'    => true,
            'profesor' => [
                'id_profesor'      => (int)$prof['id_profesor'],
                'nombre_completo'  => $prof['nombre_completo'],
                'id_cargo'         => isset($prof['id_cargo']) ? (int)$prof['id_cargo'] : null,
                'cargo_nombre'     => $prof['cargo_nombre'] ?? null,

                'id_turno_si'      => isset($prof['id_turno_si']) ? (int)$prof['id_turno_si'] : null,
                'turno_si_nombre'  => $prof['turno_si_nombre'] ?? null,
                'fecha_si'         => $prof['fecha_si'] ?? null,

                'id_turno_no'      => isset($prof['id_turno_no']) ? (int)$prof['id_turno_no'] : null,
                'turno_no_nombre'  => $prof['turno_no_nombre'] ?? null,
                'fecha_no'         => $prof['fecha_no'] ?? null,

                'fecha_carga'      => $prof['fecha_carga'] ?? null,
            ],
            'cargos'   => $cargos,
            'turnos'   => $turnos,
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

        // 🔹 Nuevos campos (permiten NULL)
        $id_turno_si = array_key_exists('id_turno_si', $in) ? $in['id_turno_si'] : null;
        $id_turno_no = array_key_exists('id_turno_no', $in) ? $in['id_turno_no'] : null;
        $fecha_si    = array_key_exists('fecha_si', $in)    ? $in['fecha_si']    : null;
        $fecha_no    = array_key_exists('fecha_no', $in)    ? $in['fecha_no']    : null;

        // 🔹 fecha_carga editable
        $fecha_carga = array_key_exists('fecha_carga', $in) ? $in['fecha_carga'] : null;

        // Normalizar: '' => NULL ; números válidos => int
        $id_turno_si = ($id_turno_si === '' || is_null($id_turno_si)) ? null : (int)$id_turno_si;
        $id_turno_no = ($id_turno_no === '' || is_null($id_turno_no)) ? null : (int)$id_turno_no;
        $fecha_si    = ($fecha_si === '' || is_null($fecha_si)) ? null : $fecha_si;
        $fecha_no    = ($fecha_no === '' || is_null($fecha_no)) ? null : $fecha_no;
        $fecha_carga = ($fecha_carga === '' || is_null($fecha_carga)) ? null : $fecha_carga;

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

        // Validación básica de fecha (YYYY-MM-DD)
        $isDate = function($d) {
            if ($d === null) return true;
            return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d);
        };
        if (!$isDate($fecha_si) || !$isDate($fecha_no) || !$isDate($fecha_carga)) {
            echo json_encode(['exito' => false, 'mensaje' => 'Formato de fecha inválido (use YYYY-MM-DD)'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // (Opcional) validar que los turnos existan si vienen informados (sin prefijo de BD)
        if ($id_turno_si !== null) {
            $chk = $pdo->prepare("SELECT 1 FROM turnos WHERE id_turno = ?");
            $chk->execute([$id_turno_si]);
            if (!$chk->fetchColumn()) $id_turno_si = null;
        }
        if ($id_turno_no !== null) {
            $chk = $pdo->prepare("SELECT 1 FROM turnos WHERE id_turno = ?");
            $chk->execute([$id_turno_no]);
            if (!$chk->fetchColumn()) $id_turno_no = null;
        }

        // Armamos "APELLIDO, NOMBRE" (nombre puede ir vacío)
        $docente = $apellido;
        if ($nombre !== '') $docente .= ', ' . $nombre;

        $sqlU = "
            UPDATE docentes
               SET docente     = :docente,
                   id_cargo    = :id_cargo,
                   id_turno_si = :id_turno_si,
                   id_turno_no = :id_turno_no,
                   fecha_si    = :fecha_si,
                   fecha_no    = :fecha_no,
                   fecha_carga = :fecha_carga
             WHERE id_docente  = :id
        ";
        $st = $pdo->prepare($sqlU);
        $ok = $st->execute([
            ':docente'     => $docente,
            ':id_cargo'    => $id_cargo,
            ':id_turno_si' => $id_turno_si,
            ':id_turno_no' => $id_turno_no,
            ':fecha_si'    => $fecha_si,
            ':fecha_no'    => $fecha_no,
            ':fecha_carga' => $fecha_carga,
            ':id'          => $id_profesor,
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
