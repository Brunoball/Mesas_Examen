<?php
// backend/modules/mesas/mesa_mover_de_grupo.php
// Mueve un numero_mesa al grupo destino (incompleto). Pasos:
// 1) Detecta grupo origen (si existe) y limpia ese slot.
// 2) Si el grupo origen queda con los 4 slots en 0, se ELIMINA el registro.
// 3) Inserta el número en el primer slot libre del grupo destino.
// 4) Sincroniza fecha_mesa e id_turno de la mesa (tabla mesas) con los del grupo destino.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE);

require_once __DIR__ . '/../../../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
    http_response_code($status);
    echo json_encode(
        $ok
            ? ['exito' => true, 'data' => $payload]
            : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(false, 'Método no permitido', 405);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $numero_mesa      = (int)($input['numero_mesa'] ?? 0);
    $id_grupo_destino = (int)($input['id_grupo_destino'] ?? 0);

    if ($numero_mesa <= 0 || $id_grupo_destino <= 0) {
        respond(false, 'Parámetros inválidos.');
    }

    $pdo->beginTransaction();

    // 1) Buscar grupo ORIGEN que contenga al numero_mesa
    $sqlOrigen = "
        SELECT id_mesa_grupos AS id_grupo,
               numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4
        FROM mesas_grupos
        WHERE :nm IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4)
        FOR UPDATE
    ";
    $stO = $pdo->prepare($sqlOrigen);
    $stO->execute([':nm' => $numero_mesa]);
    $origen = $stO->fetch(PDO::FETCH_ASSOC);

    // 2) Grupo DESTINO (debe tener hueco)
    $sqlDest = "
        SELECT id_mesa_grupos AS id_grupo,
               numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4,
               fecha_mesa, id_turno
        FROM mesas_grupos
        WHERE id_mesa_grupos = :g
        FOR UPDATE
    ";
    $stD = $pdo->prepare($sqlDest);
    $stD->execute([':g' => $id_grupo_destino]);
    $dest = $stD->fetch(PDO::FETCH_ASSOC);

    if (!$dest) {
        throw new RuntimeException('Grupo destino inexistente.');
    }

    $slotsDestino = [
        (int)$dest['numero_mesa_1'],
        (int)$dest['numero_mesa_2'],
        (int)$dest['numero_mesa_3'],
        (int)$dest['numero_mesa_4'],
    ];
    $idxLibre = array_search(0, $slotsDestino, true);
    if ($idxLibre === false) {
        throw new RuntimeException('El grupo destino no tiene sitio libre.');
    }

    // 1.b) Limpiar número en el grupo ORIGEN (si existe)
    if ($origen) {
        $colsOrigen = ['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'];
        $idGrupoOrigen = (int)$origen['id_grupo'];

        $colAZero = null;
        foreach ($colsOrigen as $c) {
            if ((int)$origen[$c] === $numero_mesa) {
                $colAZero = $c;
                break;
            }
        }

        if ($colAZero) {
            // Poner a 0 ese slot
            $pdo->prepare("UPDATE mesas_grupos SET $colAZero = 0 WHERE id_mesa_grupos = :g")
                ->execute([':g' => $idGrupoOrigen]);

            // Obtener el estado del grupo origen tras limpiar
            $stCheck = $pdo->prepare("
                SELECT numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4
                FROM mesas_grupos
                WHERE id_mesa_grupos = :g
                FOR UPDATE
            ");
            $stCheck->execute([':g' => $idGrupoOrigen]);
            $origenPost = $stCheck->fetch(PDO::FETCH_ASSOC);

            if ($origenPost) {
                $slots = [
                    (int)$origenPost['numero_mesa_1'],
                    (int)$origenPost['numero_mesa_2'],
                    (int)$origenPost['numero_mesa_3'],
                    (int)$origenPost['numero_mesa_4'],
                ];

                // Si TODOS son 0, eliminar grupo
                if (!array_filter($slots)) {
                    $pdo->prepare("DELETE FROM mesas_grupos WHERE id_mesa_grupos = :g")
                        ->execute([':g' => $idGrupoOrigen]);
                }
            }
        }
    }

    // 2.b) Insertar en slot libre del destino
    $colDestino = ['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'][$idxLibre];
    $pdo->prepare("UPDATE mesas_grupos SET $colDestino = :nm WHERE id_mesa_grupos = :g")
        ->execute([
            ':nm' => $numero_mesa,
            ':g'  => $id_grupo_destino,
        ]);

    // 3) Actualizar tabla mesas
    $pdo->prepare("
        UPDATE mesas
        SET fecha_mesa = :f, id_turno = :t
        WHERE numero_mesa = :nm
    ")->execute([
        ':f'  => $dest['fecha_mesa'],
        ':t'  => (int)$dest['id_turno'],
        ':nm' => $numero_mesa,
    ]);

    $pdo->commit();

    respond(true, [
        'id_grupo_destino' => $id_grupo_destino,
        'slot'             => $colDestino,
    ]);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respond(false, 'No se pudo mover la mesa: ' . $e->getMessage(), 500);
}
