// Tipos del dominio. Solo los usa el chequeo de tipos (npm run type-check);
// la app sigue siendo JavaScript sin build y los importa con JSDoc:
//   /** @typedef {import('./types').Ruta} Ruta */

export type Muni = 'barranquilla' | 'soledad' | 'malambo';
export type PerfilId = 'caminar' | 'transbordos';
export type DiaKey = 'lv' | 'sab' | 'dom_fest';

/** Un punto en la cuadrícula de calles y carreras de un municipio. */
export interface PuntoGrid {
  muni?: Muni;
  calle?: number | null;
  carrera?: number | null;
}

export interface Estacion {
  id: string;
  name: string;
  muni: Muni;
  calle: number;
  carrera: number;
  ubicacion?: string;
  alias?: string[];
}

export type Parada =
  | { station: string }
  | { label: string; muni: Muni; calle: number | null; carrera: number | null; approx?: boolean };

export interface Ruta {
  id: string;
  code: string;
  name: string;
  type: 'troncal' | 'alimentadora';
  tipo?: string;
  activa: boolean;
  estado?: string;
  horario?: Partial<Record<DiaKey, string>>;
  nota?: string;
  fuente: string;
  stops: Parada[];
}

export interface Anclas {
  lat0: number;
  lon0: number;
  escala: number;
  fuente?: string;
  /** [lat, lon, calle, carrera] en unidades locales, por municipio. */
  puntos: Partial<Record<Muni, [number, number, number, number][]>>;
}

/** Contenido de data/transmetro.json. */
export interface Datos {
  version: string;
  fuente: string;
  generado: string;
  reglas: Record<string, string>;
  stations: Estacion[];
  routes: Ruta[];
  anclas: Anclas;
}

/** Nodo del grafo: una estación o un paradero de una ruta. */
export interface Nodo extends PuntoGrid {
  id: string;
  label: string;
  muni: Muni;
  station?: string;
  approx?: boolean;
}

export interface RutaIndexada extends Ruta {
  /** Ids de nodo en el orden del recorrido. */
  seq: string[];
}

export interface LugarBuscable {
  kind: 'estacion' | 'lugar';
  name: string;
  keys: string[];
  node: string;
  label?: string;
}

export interface Indice {
  data: Datos;
  stations: Record<string, Estacion>;
  nodes: Map<string, Nodo>;
  routes: RutaIndexada[];
  /** nodo -> [[índice de ruta, posición en la ruta]] */
  servedBy: Map<string, [number, number][]>;
  /** nodo -> [[nodo vecino, cuadras]] */
  walks: Map<string, [string, number][]>;
  places: LugarBuscable[];
}

/** Lo que elige o escribe la persona como origen o destino. */
export type Lugar =
  | { kind: 'direccion'; text: string; name?: string; muni?: Muni }
  | { kind: 'gps'; lat: number; lon: number; name?: string; detalle?: string; muni?: Muni }
  | { kind: 'estacion' | 'lugar'; node: string; name: string; label?: string; muni?: Muni };

/** Lugar listo para el planificador: con nodo o con punto en la cuadrícula. */
export type LugarResuelto = Lugar & { point?: PuntoGrid & { muni: Muni }; node?: string; text?: string };

export interface OpcionesViaje {
  perfil?: PerfilId;
  date?: Date | null;
  excluir?: Set<string>;
}

export interface TramoCaminata {
  type: 'walk';
  from: Nodo | null;
  to: Nodo | null;
  blocks: number;
  minutes: number;
}

export interface TramoBus {
  type: 'ride';
  route: RutaIndexada;
  routeCode: string;
  from: Nodo;
  to: Nodo;
  fromPos: number;
  stops: number;
}

export type Tramo = TramoCaminata | TramoBus;

export type ResultadoViaje =
  | { error: 'origen' | 'destino' | 'sin-ruta'; cost?: undefined; legs?: undefined }
  | { error?: undefined; cost: number; legs: Tramo[] };
