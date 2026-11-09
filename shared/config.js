// Configurações da casa que o admin root ajusta (aba Admin root; tabela sistema, chave config_casa).
// Campo vazio usa o padrão.

export const CONFIG_PADRAO = {
  responsavel: 'Michelle',
  dirigente: 'Mãe Vê',
  sugestao: 'Mi/Mãe Vê',
  saudacao: '*Bom dia corrente* ✨',
  saudacao2: '_Boa semana para nós_',
  encerramento: 'Contamos com vocês. Axé! 🙏',
};

// [chave, rótulo, tamanho máximo, dica]
export const CAMPOS_CONFIG = [
  ['responsavel', 'Responsável pela escala', 40, 'Aparece nos avisos da aba Gira, como “só a Michelle altera”.'],
  ['dirigente', 'Dirigente', 80, 'Igual ao nome cadastrado em Pessoas: vem primeiro na lista de médiuns e aparece no resumo do evento.'],
  ['sugestao', 'Nome do bloco Sugestão', 40, 'Aparece como “Sugestão …” na aba Gira.'],
  ['saudacao', 'Prévia Gira: primeira linha', 120, 'No WhatsApp, *asteriscos* viram negrito e _sublinhados_ viram itálico.'],
  ['saudacao2', 'Prévia Gira: segunda linha', 120, ''],
  ['encerramento', 'Prévia Gira: encerramento', 120, ''],
];

export const configCasa = (c) => Object.fromEntries(Object.entries(CONFIG_PADRAO)
  .map(([k, padrao]) => [k, typeof c?.[k] === 'string' && c[k].trim() ? c[k].trim() : padrao]));

let atual = CONFIG_PADRAO;
export const definirConfig = (c) => { atual = configCasa(c); };
export const config = () => atual;
