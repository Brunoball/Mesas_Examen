<?php
// ✅ REEMPLAZAR COMPLETO
// backend/modules/mesas/editar_mesas/mesa_actualizar.php
// -----------------------------------------------------------------------------
// Actualiza fecha_mesa / id_turno / hora de una mesa identificada por numero_mesa.
// Si la mesa pertenece a un grupo, sincroniza TODAS las submesas del grupo.
// Si no pertenece a grupo, actualiza solo ese numero.
//
// La actualización se hace en:
//   1) tabla `mesas`              (todas las filas de los numeros objetivo)
//   2) tabla `mesas_grupos`       (si existe grupo)
//   3) tabla `mesas_no_agrupadas` (si existe alguno de esos numeros)
//
// Entrada (POST JSON o x-www-form-urlencoded):
//   {
//     "numero_mesa": 61,
//     "fecha_mesa": "YYYY-MM-DD",
//     "id_turno": 2,
//     "hora": "HH:MM"   // opcional; si viene vacío se deja en NULL
//   }
// -----------------------------------------------------------------------------

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../../config/db.php';

function out(bool $ok, $payload = null, int $code = 200): void
{
    http_response_code($code);
    echo json_encode(
        $ok
            ? ['exito' => true, 'data' => $payload]
            : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function validar_fecha(string $s): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return false;
    }

    [$y, $m, $d] = explode('-', $s);
    return checkdate((int)$m, (int)$d, (int)$y);
}

function es_dia_habil(string $fecha): bool
{
    $dt = DateTime::createFromFormat('Y-m-d', $fecha);
    if (!$dt) {
        return false;
    }

    $dow = (int)$dt->format('N'); // 1=lunes ... 7=domingo
    return $dow >= 1 && $dow <= 5;
}

function sql_placeholders(int $count): string
{
    return implode(',', array_fill(0, $count, '?'));
}

try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        out(false, 'Conexión PDO no disponible.', 500);
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // -------------------------
    // Parseo de entrada
    // -------------------------
    $raw = file_get_contents('php://input') ?: '';
    $in  = json_decode($raw, true);

    if (!is_array($in)) {
        $in = $_POST;
    }

    $numero_mesa = isset($in['numero_mesa']) ? (int)$in['numero_mesa'] : 0;
    $fecha_mesa  = isset($in['fecha_mesa']) ? trim((string)$in['fecha_mesa']) : '';
    $id_turno    = isset($in['id_turno']) ? (int)$in['id_turno'] : 0;
    $hora        = array_key_exists('hora', $in) ? trim((string)$in['hora']) : '';

    if ($numero_mesa <= 0) {
        out(false, 'numero_mesa inválido.', 400);
    }

    if ($fecha_mesa === '' || !validar_fecha($fecha_mesa)) {
        out(false, 'fecha_mesa debe ser YYYY-MM-DD.', 400);
    }

    if (!es_dia_habil($fecha_mesa)) {
        out(false, 'No se permiten mesas en sábados ni domingos.', 400);
    }

    if ($id_turno <= 0) {
        out(false, 'id_turno inválido.', 400);
    }

    if ($hora !== '') {
        if (!preg_match('/^\d{2}:\d{2}$/', $hora)) {
            out(false, 'Hora inválida. Use formato HH:MM.', 400);
        }
    } else {
        $hora = null;
    }

    // Verificar existencia del numero_mesa en `mesas`
    $stChk = $pdo->prepare("SELECT COUNT(*) FROM mesas WHERE numero_mesa = ?");
    $stChk->execute([$numero_mesa]);

    if ((int)$stChk->fetchColumn() === 0) {
        out(false, 'Mesa no encontrada (numero_mesa inexistente).', 404);
    }

    $pdo->beginTransaction();

    // -------------------------
    // 1) Detectar grupo
    // -------------------------
    $stGrupo = $pdo->prepare("
        SELECT
            id_mesa_grupos,
            numero_mesa_1,
            numero_mesa_2,
            numero_mesa_3,
            numero_mesa_4
        FROM mesas_grupos
        WHERE numero_mesa_1 = :n
           OR numero_mesa_2 = :n
           OR numero_mesa_3 = :n
           OR numero_mesa_4 = :n
        LIMIT 1
        FOR UPDATE
    ");
    $stGrupo->execute([':n' => $numero_mesa]);
    $grupo = $stGrupo->fetch(PDO::FETCH_ASSOC);

    // Si pertenece a grupo, actualizamos TODOS los numeros del grupo.
    // Si no, solo el numero editado.
    $numerosObjetivo = [];

    if ($grupo) {
        foreach (['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'] as $campo) {
            $n = (int)($grupo[$campo] ?? 0);
            if ($n > 0) {
                $numerosObjetivo[] = $n;
            }
        }
    } else {
        $numerosObjetivo[] = $numero_mesa;
    }

    $numerosObjetivo = array_values(array_unique(array_map('intval', $numerosObjetivo)));

    if (!$numerosObjetivo) {
        throw new RuntimeException('No se pudieron resolver los números de mesa a actualizar.');
    }

    // -------------------------
    // 2) Actualizar `mesas`
    // -------------------------
    $phMesas = sql_placeholders(count($numerosObjetivo));

    $sqlMesas = "
        UPDATE mesas
           SET fecha_mesa = ?,
               id_turno   = ?
         WHERE numero_mesa IN ($phMesas)
    ";

    $stMesas = $pdo->prepare($sqlMesas);
    $stMesas->execute(array_merge([$fecha_mesa, $id_turno], $numerosObjetivo));
    $afectadasMesas = $stMesas->rowCount();

    // -------------------------
    // 3) Actualizar `mesas_grupos`
    // -------------------------
    $afectadasGrupo = 0;

    if ($grupo) {
        $stUpdG = $pdo->prepare("
            UPDATE mesas_grupos
               SET fecha_mesa = :fecha_mesa,
                   id_turno   = :id_turno,
                   hora       = :hora
             WHERE id_mesa_grupos = :idg
        ");
        $stUpdG->execute([
            ':fecha_mesa' => $fecha_mesa,
            ':id_turno'   => $id_turno,
            ':hora'       => $hora,
            ':idg'        => (int)$grupo['id_mesa_grupos'],
        ]);
        $afectadasGrupo = $stUpdG->rowCount();
    }

    // -------------------------
    // 4) Sincronizar `mesas_no_agrupadas`
    // -------------------------
    $phNo = sql_placeholders(count($numerosObjetivo));

    $sqlNo = "
        UPDATE mesas_no_agrupadas
           SET fecha_mesa = ?,
               id_turno   = ?,
               hora       = ?
         WHERE numero_mesa IN ($phNo)
    ";

    $stUpdNo = $pdo->prepare($sqlNo);
    $stUpdNo->execute(array_merge([$fecha_mesa, $id_turno, $hora], $numerosObjetivo));
    $afectadasNoAgr = $stUpdNo->rowCount();

    $pdo->commit();

    out(true, [
        'numero_mesa_editada' => $numero_mesa,
        'numeros_actualizados' => $numerosObjetivo,
        'id_mesa_grupos' => $grupo ? (int)$grupo['id_mesa_grupos'] : null,
        'fecha_mesa' => $fecha_mesa,
        'id_turno' => $id_turno,
        'hora' => $hora,
        'afectadas' => [
            'mesas' => $afectadasMesas,
            'grupos' => $afectadasGrupo,
            'no_agrupadas' => $afectadasNoAgr,
        ],
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('[mesa_actualizar] ' . $e->getMessage());
    out(false, 'Error interno: ' . $e->getMessage(), 500);
}