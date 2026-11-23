// Fila digital de senhas da gira (a mesma regra no app e no backend).
// Preferencial é chamada antes de atendimento e fica fora do limite; quando o atendimento lota, sobra o passe (sem limite).

export const TIPOS_FILA = [
  { k: 'preferencial', nome: 'Preferencial', prefixo: 'P' },
  { k: 'atendimento', nome: 'Atendimento', prefixo: 'A' },
  { k: 'passe', nome: 'Passe', prefixo: 'PS' },
];
export const TIPO_KEYS = TIPOS_FILA.map((t) => t.k);
export const tipoFila = (k) => TIPOS_FILA.find((t) => t.k === k);

// O painel chama em duas filas: atendimento (preferenciais primeiro) e passe.
export const FILAS_CHAMADA = ['atendimento', 'passe'];
// O que quem controla a fila pode marcar numa senha.
export const STATUS_MARCAR = ['chamada', 'ausente', 'aguardando', 'cancelada'];

// P01, A12, PS03
export const rotuloSenha = (tipo, numero) => `${tipoFila(tipo)?.prefixo || ''}${String(numero).padStart(2, '0')}`;

export const LIMITE_MAX = 1000;
// Chamar várias de uma vez (botão Chamar próximas 10): o servidor aceita até 20.
export const CHAMAR_LOTE = 10;
export const CHAMAR_MAX = 20;
// Balões de valor da doação (cartão de doação das Compras e o bloco da fila na Geral).
export const VALORES_DOACAO = [10, 30, 100];
