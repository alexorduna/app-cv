ALTER TABLE `vacantes` ADD `descartada_por` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `vacantes` ADD `fecha_descarte` text;--> statement-breakpoint
-- Descartes previos: lo que nunca llegó al tablero lo descartaron los filtros; lo demás, Alex.
UPDATE `vacantes` SET `descartada_por` = CASE WHEN `en_tablero` = 0 THEN 'filtros' ELSE 'alex' END WHERE `estado` = 'Descartada';
--> statement-breakpoint
-- Las vacantes cerradas (🔒) de las listas de GitHub ya no se guardan.
DELETE FROM `vacantes` WHERE `estado` = 'Descartada' AND `en_tablero` = 0 AND `motivo_descarte` LIKE 'Cerrada (%';
