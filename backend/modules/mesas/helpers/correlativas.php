<?php
declare(strict_types=1);

if (!function_exists('mesas_correlativas_curso_division_label')) {
    function mesas_correlativas_curso_division_label($curso, $division): string
    {
        $cursoTxt = trim((string)($curso ?? ''));
        $divTxt   = trim((string)($division ?? ''));

        if ($cursoTxt === '' && $divTxt === '') {
            return '-';
        }

        if ($cursoTxt !== '' && $divTxt !== '') {
            return $cursoTxt . '° ' . $divTxt;
        }

        if ($cursoTxt !== '') {
            return $cursoTxt . '°';
        }

        return $divTxt;
    }
}

if (!function_exists('mesas_correlativas_aviso_por_previa')) {
    /**
     * Devuelve las previas "siguientes" que quedan bloqueadas
     * si la previa indicada fue desaprobada (1..6).
     */
    function mesas_correlativas_aviso_por_previa(PDO $pdo, int $idPrevia): array
    {
        $sqlBase = "
            SELECT
                p.id_previa,
                p.dni,
                p.alumno,
                p.materia_id_curso,
                p.materia_id_division,
                p.id_materia,
                p.nota,
                m.materia,
                m.correlativa
            FROM previas p
            INNER JOIN materias m ON m.id_materia = p.id_materia
            WHERE p.id_previa = :id_previa
            LIMIT 1
        ";
        $stBase = $pdo->prepare($sqlBase);
        $stBase->execute([':id_previa' => $idPrevia]);
        $base = $stBase->fetch(PDO::FETCH_ASSOC);

        if (!$base) {
            return [];
        }

        $nota = isset($base['nota']) ? (int)$base['nota'] : 0;
        $correlativa = $base['correlativa'] ?? null;

        // Solo dispara aviso si desaprobó y tiene grupo correlativo
        if ($nota < 1 || $nota > 6 || $correlativa === null || $correlativa === '') {
            return [];
        }

        $cursoBase = (int)($base['materia_id_curso'] ?? 0);
        $divisionBase = (int)($base['materia_id_division'] ?? 0);

        $sql = "
            SELECT
                p2.id_previa,
                p2.dni,
                p2.alumno,
                p2.materia_id_curso,
                p2.materia_id_division,
                p2.id_materia,
                p2.nota,
                m2.materia,
                me.numero_mesa,
                me.fecha_mesa,
                me.id_turno
            FROM previas p2
            INNER JOIN materias m2 ON m2.id_materia = p2.id_materia
            LEFT JOIN mesas me ON me.id_previa = p2.id_previa
            WHERE p2.dni = :dni
              AND p2.activo = 1
              AND p2.id_previa <> :id_previa
              AND m2.correlativa = :correlativa
              AND (
                    p2.materia_id_curso > :curso_base
                 OR (
                        p2.materia_id_curso = :curso_base
                    AND COALESCE(p2.materia_id_division, 0) > :division_base
                 )
              )
            ORDER BY
                p2.materia_id_curso ASC,
                COALESCE(p2.materia_id_division, 0) ASC,
                p2.id_previa ASC
        ";

        $st = $pdo->prepare($sql);
        $st->execute([
            ':dni' => (string)$base['dni'],
            ':id_previa' => $idPrevia,
            ':correlativa' => $correlativa,
            ':curso_base' => $cursoBase,
            ':division_base' => $divisionBase,
        ]);

        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];

        foreach ($rows as $r) {
            $out[] = [
                'id_previa_bloqueada' => (int)$r['id_previa'],
                'alumno' => (string)$base['alumno'],
                'dni' => (string)$base['dni'],
                'materia_desaprobada' => (string)$base['materia'],
                'curso_desaprobado' => mesas_correlativas_curso_division_label(
                    $base['materia_id_curso'] ?? null,
                    $base['materia_id_division'] ?? null
                ),
                'materia_bloqueada' => (string)$r['materia'],
                'curso_bloqueado' => mesas_correlativas_curso_division_label(
                    $r['materia_id_curso'] ?? null,
                    $r['materia_id_division'] ?? null
                ),
                'numero_mesa_bloqueada' => isset($r['numero_mesa']) ? (int)$r['numero_mesa'] : null,
                'fecha_mesa_bloqueada' => $r['fecha_mesa'] ?? null,
                'motivo' => 'Correlativa anterior desaprobada',
            ];
        }

        return $out;
    }
}

if (!function_exists('mesas_correlativas_bloqueos_por_numeros')) {
    /**
     * Devuelve un mapa id_previa => info de bloqueo para las mesas visibles.
     */
    function mesas_correlativas_bloqueos_por_numeros(PDO $pdo, array $numerosMesa): array
    {
        $numerosMesa = array_values(array_unique(array_filter(array_map('intval', $numerosMesa), function ($n) {
            return $n > 0;
        })));

        if (!$numerosMesa) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($numerosMesa), '?'));

        $sql = "
            SELECT
                me.numero_mesa,
                p.id_previa,
                p.dni,
                p.alumno,
                p.materia_id_curso,
                p.materia_id_division,
                p.nota,
                p.id_materia,
                m.materia,
                m.correlativa
            FROM mesas me
            INNER JOIN previas p ON p.id_previa = me.id_previa
            INNER JOIN materias m ON m.id_materia = p.id_materia
            WHERE me.numero_mesa IN ($placeholders)
              AND p.activo = 1
            ORDER BY
                p.dni ASC,
                m.correlativa ASC,
                p.materia_id_curso ASC,
                COALESCE(p.materia_id_division, 0) ASC,
                p.id_previa ASC
        ";

        $st = $pdo->prepare($sql);
        $st->execute($numerosMesa);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $grupos = [];
        foreach ($rows as $r) {
            $corr = $r['correlativa'] ?? null;
            if ($corr === null || $corr === '') {
                continue;
            }
            $key = (string)$r['dni'] . '|' . (string)$corr;
            if (!isset($grupos[$key])) {
                $grupos[$key] = [];
            }
            $grupos[$key][] = $r;
        }

        $bloqueos = [];

        foreach ($grupos as $items) {
            usort($items, function ($a, $b) {
                $ca = (int)($a['materia_id_curso'] ?? 0);
                $cb = (int)($b['materia_id_curso'] ?? 0);
                if ($ca !== $cb) return $ca <=> $cb;

                $da = (int)($a['materia_id_division'] ?? 0);
                $db = (int)($b['materia_id_division'] ?? 0);
                if ($da !== $db) return $da <=> $db;

                return ((int)$a['id_previa']) <=> ((int)$b['id_previa']);
            });

            $desaprobadasPrevias = [];

            foreach ($items as $it) {
                $nota = isset($it['nota']) && $it['nota'] !== null && $it['nota'] !== ''
                    ? (int)$it['nota']
                    : null;

                if ($nota !== null && $nota >= 1 && $nota <= 6) {
                    $desaprobadasPrevias[] = $it;
                    continue;
                }

                if (!$desaprobadasPrevias) {
                    continue;
                }

                // Busca la última desaprobada anterior con menor curso
                $causa = null;
                foreach ($desaprobadasPrevias as $des) {
                    $cursoDes = (int)($des['materia_id_curso'] ?? 0);
                    $cursoAct = (int)($it['materia_id_curso'] ?? 0);

                    if ($cursoDes < $cursoAct) {
                        $causa = $des;
                    }
                }

                if ($causa) {
                    $bloqueos[(string)$it['id_previa']] = [
                        'id_previa_bloqueada' => (int)$it['id_previa'],
                        'alumno' => (string)$it['alumno'],
                        'dni' => (string)$it['dni'],
                        'materia_desaprobada' => (string)$causa['materia'],
                        'curso_desaprobado' => mesas_correlativas_curso_division_label(
                            $causa['materia_id_curso'] ?? null,
                            $causa['materia_id_division'] ?? null
                        ),
                        'materia_bloqueada' => (string)$it['materia'],
                        'curso_bloqueado' => mesas_correlativas_curso_division_label(
                            $it['materia_id_curso'] ?? null,
                            $it['materia_id_division'] ?? null
                        ),
                        'numero_mesa_bloqueada' => isset($it['numero_mesa']) ? (int)$it['numero_mesa'] : null,
                        'motivo' => 'Correlativa anterior desaprobada',
                    ];
                }
            }
        }

        return $bloqueos;
    }
}