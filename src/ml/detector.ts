/**
 * Clasificador de texto genérico — inferencia en TypeScript puro, sin dependencias.
 * Reproduce exactamente el TF-IDF + regresión logística de scikit-learn (ver train.py).
 * Cada `model/<modulo>.json` es un módulo independiente (team_search, participation, ...).
 *
 *   const set = DetectorSet.fromDir("model");           // carga todos los módulos
 *   set.predict("team_search", "busco gente para ranked");
 *
 *   const det = TextDetector.fromFile("model/participation.json");
 *   det.predict("me apunto al torneo");                  // -> { score, decision }
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Terms = Record<string, [idf: number, coef: number]>;

interface RawBlock {
  ngramRange: [number, number];
  terms: Terms;
}

export interface SplitMetrics {
  n: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  error_abs: number;
  error_rel: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface ModelMetrics {
  date: string;
  n_examples: number;
  validation: SplitMetrics;
  test: SplitMetrics;
  test_real_only?: SplitMetrics;
}

export interface RawModel {
  version: number;
  module: string;
  labels: string[];
  negative: string;
  positive: string;
  threshold: number;
  intercept: number;
  smooth?: number; // suavizado L2: evita que una sola palabra genérica dispare el score
  data_hash?: string; // huella de los CSV usados al entrenar (para detectar modelos viejos)
  metrics?: ModelMetrics;
  words: RawBlock;
  chars: RawBlock;
}

export interface Prediction {
  score: number; // probabilidad de la clase positiva (no está calibrada)
  decision: string; // etiqueta positiva o negativa
}

interface Block {
  range: [number, number];
  terms: Map<string, [number, number]>;
}

const COMBINING = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;
const WORD = /[\p{L}\p{N}_]{2,}/gu;

// Muletillas y palabras funcionales que por sí solas no expresan intención: si el mensaje
// es solo esto, no decide positivo (evita falsos positivos con "ok", "vale", "en", "aqui"...).
// Igual que en train.py.
const FILLERS = new Set([
  "ok", "okey", "oki", "vale", "si", "sii", "no", "ya", "yo", "me", "vamos", "eh", "uh",
  "xd", "jaja", "jeje", "bueno", "genial", "perfecto", "dale", "eso", "que", "tambien",
  "tamb", "tb", "tmb", "y", "a", "gracias", "buenas", "hola", "hey", "epa", "wep",
  "en", "aqui", "aca",
]);

// Unidades de tiempo: "en 30 min", "5 minutos" o "1 hora" no expresan intención por sí solos.
const TIME_UNITS = new Set([
  "seg", "segs", "segundo", "segundos", "min", "mins", "minuto", "minutos",
  "hora", "horas", "rato", "momento", "dia", "dias", "semana", "semanas",
  "mes", "meses", "ano", "anos",
]);

const NUMBER = /^\d+$/;

function isNonIntent(word: string): boolean {
  return FILLERS.has(word) || TIME_UNITS.has(word) || NUMBER.test(word);
}


// Igual que TfidfVectorizer(lowercase=True, strip_accents="unicode")
function preprocess(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(COMBINING, "");
}

// Igual que analyzer="word" (token_pattern \b\w\w+\b)
function wordNgrams(text: string, [minN, maxN]: [number, number]): string[] {
  const tokens = text.match(WORD) ?? [];
  const out: string[] = [];
  for (let n = minN; n <= Math.min(maxN, tokens.length); n++) {
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

// Igual que analyzer="char_wb": n-gramas de caracteres dentro de cada palabra rodeada de espacios
function charWbNgrams(text: string, [minN, maxN]: [number, number]): string[] {
  const out: string[] = [];
  for (const word of text.replace(/\s\s+/g, " ").split(/\s+/).filter(Boolean)) {
    const w = Array.from(` ${word} `); // por puntos de código, como Python
    for (let n = minN; n <= maxN; n++) {
      let offset = 0;
      out.push(w.slice(offset, offset + n).join(""));
      while (offset + n < w.length) {
        offset++;
        out.push(w.slice(offset, offset + n).join(""));
      }
      if (offset === 0) break; // palabra más corta que n: se cuenta una sola vez
    }
  }
  return out;
}

// TF sublineal (1 + ln tf) · idf, normalizado L2, producto con los coeficientes.
// El suavizado `smooth` evita que una sola palabra genérica dispare el score: con poco
// término conocido la contribución se atenúa; con varias señales reales, apenas cambia.
function contribution(block: Block, grams: string[], smooth: number): number {
  const tf = new Map<string, number>();
  for (const g of grams) if (block.terms.has(g)) tf.set(g, (tf.get(g) ?? 0) + 1);
  let dot = 0;
  let sq = 0;
  for (const [g, count] of tf) {
    const [idf, coef] = block.terms.get(g)!;
    const v = (1 + Math.log(count)) * idf;
    dot += v * coef;
    sq += v * v;
  }
  return sq > 0 ? dot / Math.sqrt(sq + smooth) : 0;
}

function toBlock(raw: RawBlock): Block {
  return { range: raw.ngramRange, terms: new Map(Object.entries(raw.terms)) };
}

export class TextDetector {
  readonly module: string;
  readonly positive: string;
  readonly negative: string;
  readonly threshold: number;
  readonly dataHash?: string;
  readonly metrics?: ModelMetrics;
  private readonly intercept: number;
  private readonly smooth: number;
  private readonly words: Block;
  private readonly chars: Block;

  constructor(raw: RawModel) {
    this.module = raw.module;
    this.positive = raw.positive;
    this.negative = raw.negative;
    this.threshold = raw.threshold;
    this.dataHash = raw.data_hash;
    this.metrics = raw.metrics;
    this.intercept = raw.intercept;
    this.smooth = raw.smooth ?? 0;
    this.words = toBlock(raw.words);
    this.chars = toBlock(raw.chars);
  }

  static fromFile(path: string | URL): TextDetector {
    return new TextDetector(JSON.parse(readFileSync(path, "utf8")) as RawModel);
  }

  score(text: string): number {
    const t = preprocess(text);
    // Si el mensaje es solo muletillas, palabras funcionales, números o unidades de tiempo
    // ("ok", "en 30 min", "aqui"...), no hay intención: score 0.
    const words = t.match(WORD) ?? [];
    if (words.length > 0 && words.every(isNonIntent)) return 0;
    const wordContrib = contribution(this.words, wordNgrams(t, this.words.range), this.smooth);
    const charContrib = contribution(this.chars, charWbNgrams(t, this.chars.range), this.smooth);
    const z = this.intercept + wordContrib + charContrib;
    return 1 / (1 + Math.exp(-z));
  }

  /** `threshold` opcional: sobrescribe el del modelo (p. ej. desde una variable de entorno). */
  predict(text: string, threshold: number = this.threshold): Prediction {
    const score = this.score(text);
    return { score, decision: score >= threshold ? this.positive : this.negative };
  }
}

export interface SetPrediction extends Prediction {
  module: string;
  threshold: number;
}

/** Colección de módulos cargados desde un directorio (los `*.json` con campo `module`). */
export class DetectorSet {
  private readonly detectors: Map<string, TextDetector>;

  constructor(detectors: TextDetector[]) {
    this.detectors = new Map(detectors.map((d) => [d.module, d]));
  }

  static fromDir(dir: string | URL): DetectorSet {
    const detectors: TextDetector[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const raw = JSON.parse(readFileSync(join(dir.toString(), file), "utf8")) as Partial<RawModel>;
      if (!raw.module || !raw.words || !raw.chars) continue; // ignora JSON que no sean un modelo
      detectors.push(new TextDetector(raw as RawModel));
    }
    detectors.sort((a, b) => a.module.localeCompare(b.module));
    return new DetectorSet(detectors);
  }

  names(): string[] {
    return [...this.detectors.keys()];
  }

  get(name: string): TextDetector | undefined {
    return this.detectors.get(name);
  }

  predict(module: string, text: string, threshold?: number): SetPrediction {
    const detector = this.detectors.get(module);
    if (!detector) throw new Error(`Módulo desconocido: ${module}`);
    const thr = threshold ?? detector.threshold;
    return { module, threshold: thr, ...detector.predict(text, thr) };
  }

  predictAll(text: string, threshold?: number): SetPrediction[] {
    return this.names().map((name) => this.predict(name, text, threshold));
  }
}
