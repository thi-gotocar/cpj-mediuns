// Escala (sorteio) ainda não publicada: só quem edita a gira vê as duplas.
import { pode } from '../../shared/permissoes.js';

export function ocultarSorteio(eu, g) {
  if (!g || g.publicada || pode(eu, 'giras:editar')) return g;
  return { ...g, pares: [], passes: [] };
}
export const ocultarSorteios = (eu, lista) => (lista || []).map((g) => ocultarSorteio(eu, g));
