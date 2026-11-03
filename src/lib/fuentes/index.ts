import { ashby, greenhouse, lever } from "./ats";
import { isecjobs, remoteRocketship, remotive } from "./desactivadas";
import { getOnBoard } from "./getonboard";
import { github } from "./github";
import { jobgether } from "./jobgether";
import type { Fuente } from "./tipos";

/** Todas las fuentes. Cada una es independiente y se enciende o apaga en Configuración. */
export const FUENTES: Fuente[] = [getOnBoard, jobgether, greenhouse, lever, ashby, github, remotive, remoteRocketship, isecjobs];

export type { Fuente } from "./tipos";
