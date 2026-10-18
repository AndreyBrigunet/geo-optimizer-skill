import type { AuditReport, CategoryScore, Recommendation } from './mockData';

/**
 * Stima del punteggio raggiungibile con i fix gratuiti mostrati nel report.
 *
 * Il calcolo è solo aritmetica sui dati dell'audit, nessun coefficiente
 * inventato: per ogni categoria visibile (non bloccata dal gate) si prendono i
 * punti che mancano al massimo della rubrica. Sommati al punteggio attuale
 * danno un tetto ("fino a"), non una previsione: vale se ogni fix di quelle
 * categorie va a buon fine e se il resto del sito non cambia.
 *
 * Le categorie bloccate restano fuori dalla stima: i loro punti mancanti sono
 * riportati a parte (`lockedGain`), perché i fix relativi non sono sulla pagina.
 */

/** Prefisso delle righe teaser che il gate del SaaS aggiunge alle raccomandazioni. */
export const PRO_TEASER_PREFIX = '[Pro]';

export interface CategoryGain {
  slug: string;
  name: string;
  /** Punti mancanti al massimo della categoria (sempre > 0). */
  points: number;
}

export interface ScoreEstimate {
  /** Punteggio attuale dell'audit. */
  baseline: number;
  /** Tetto raggiungibile con i fix gratuiti, limitato a 100. */
  ceiling: number;
  /** Punti recuperabili nelle categorie visibili, dal più grande al più piccolo. */
  freeGains: CategoryGain[];
  /** Punti mancanti nelle categorie bloccate (dettagli non mostrati). */
  lockedGain: number;
  /** Numero di fix gratuiti elencati (esclusi i teaser [Pro]). */
  freeFixCount: number;
}

/** True per le righe teaser "[Pro] ..." del gate, che non sono fix applicabili. */
export function isProTeaser(rec: Recommendation): boolean {
  return rec.title.trimStart().startsWith(PRO_TEASER_PREFIX);
}

function gapOf(category: CategoryScore): number {
  return Math.max(0, Math.round(category.maxScore - category.score));
}

/** Calcola baseline, tetto e ripartizione dei punti recuperabili. */
export function estimateAfterFreeFixes(report: AuditReport): ScoreEstimate {
  const baseline = Math.max(0, Math.round(report.geoScore));

  const freeGains: CategoryGain[] = report.categories
    .filter((c) => !c.locked)
    .map((c) => ({ slug: c.slug, name: c.name, points: gapOf(c) }))
    .filter((g) => g.points > 0)
    // Ordine stabile: punti decrescenti, poi nome
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const lockedGain = report.categories.filter((c) => c.locked).reduce((sum, c) => sum + gapOf(c), 0);
  const freeTotal = freeGains.reduce((sum, g) => sum + g.points, 0);

  return {
    baseline,
    ceiling: Math.min(100, baseline + freeTotal),
    freeGains,
    lockedGain,
    freeFixCount: report.recommendations.filter((r) => !isProTeaser(r)).length,
  };
}
