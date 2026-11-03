CREATE TABLE `actividad` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`entidad` text NOT NULL,
	`entidad_id` text DEFAULT '' NOT NULL,
	`accion` text NOT NULL,
	`detalle` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `banco_respuestas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoria` text DEFAULT '' NOT NULL,
	`pregunta` text NOT NULL,
	`respuesta` text DEFAULT '' NOT NULL,
	`estado` text DEFAULT 'Pendiente' NOT NULL,
	`actualizado` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `banco_cat_preg_unq` ON `banco_respuestas` (`categoria`,`pregunta`);--> statement-breakpoint
CREATE TABLE `cartas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vacante_id` integer NOT NULL,
	`texto` text DEFAULT '' NOT NULL,
	`estado` text DEFAULT 'Borrador' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`proveedor` text DEFAULT '' NOT NULL,
	`creada` text NOT NULL,
	FOREIGN KEY (`vacante_id`) REFERENCES `vacantes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ejecuciones_fuentes` (
	`fuente` text PRIMARY KEY NOT NULL,
	`fecha` text NOT NULL,
	`ok` integer DEFAULT 1 NOT NULL,
	`mensaje` text DEFAULT '' NOT NULL,
	`encontradas` integer DEFAULT 0 NOT NULL,
	`nuevas` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `filtros` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listas_github` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo` text NOT NULL,
	`rama` text DEFAULT '' NOT NULL,
	`formato` text DEFAULT 'auto' NOT NULL,
	`activa` integer DEFAULT 1 NOT NULL,
	`ultimo_sha` text,
	`ultima_lectura` text,
	`ultimo_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listas_repo_unq` ON `listas_github` (`repo`);--> statement-breakpoint
CREATE TABLE `vacantes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_externo` text,
	`fecha_encontrada` text,
	`empresa` text DEFAULT '' NOT NULL,
	`puesto` text DEFAULT '' NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`plataforma` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`tipo` text DEFAULT '' NOT NULL,
	`horas_por_dia` text DEFAULT '' NOT NULL,
	`salario` text DEFAULT '' NOT NULL,
	`enlace` text DEFAULT '' NOT NULL,
	`prioridad` integer DEFAULT 3 NOT NULL,
	`estado` text DEFAULT 'Por revisar' NOT NULL,
	`fecha_aplicacion` text,
	`fecha_seguimiento` text,
	`siguiente_paso` text DEFAULT '' NOT NULL,
	`version_cv` text DEFAULT '' NOT NULL,
	`notas` text DEFAULT '' NOT NULL,
	`motivo_descarte` text DEFAULT '' NOT NULL,
	`huella` text NOT NULL,
	`en_tablero` integer DEFAULT 1 NOT NULL,
	`ubicacion` text DEFAULT '' NOT NULL,
	`creada` text NOT NULL,
	`actualizada` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vacantes_huella_unq` ON `vacantes` (`huella`);--> statement-breakpoint
CREATE INDEX `vacantes_estado_idx` ON `vacantes` (`estado`);