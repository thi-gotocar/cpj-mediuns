// Ervas de banho de cada orixá e de cada linha de guias (das apostilas de Orixás e de Guias da Casa do Pai João).
// Usado no card da gira (aba Gira): "Banho orixá" pelo orixá do dia e "Banho guia" pela linha da gira.
// Só os nomes das ervas e os cuidados que as apostilas pedem; o texto completo fica nas apostilas.

import { linhaDaEntidade, orixaDaGira, LINHA_LABEL } from './regras.js';

const CANELA = 'Canela é alergênica: teste antes num pedacinho da pele.';

// Chave: o nome do orixá como no app (ORIXAS). Logunã ainda não está na lista do app.
export const BANHO_ORIXA = {
  'Oxalá': { ervas: ['boldo', 'hortelã', 'manjericão', 'alecrim', 'sálvia', 'rosas brancas', 'mão de Deus', 'cipó cruz', 'alfazema', 'anis estrelado', 'macela', 'camomila', 'malva', 'abre caminho'],
    obs: 'Também: banho de água de coco.' },
  'Logunã': { ervas: ['eucalipto', 'folhas de bambu', 'picão branco', 'hortelã', 'catinga de mulata', 'carqueja', 'macela', 'flores do campo coloridas'],
    obs: 'De preferência pela manhã.' },
  'Oxum': { ervas: ['oriri (erva de jabuti)', 'erva doce', 'alfazema blue', 'camomila', 'manjericão', 'jasmim', 'macela', 'melissa', 'rosas cor de rosa', 'pitanga', 'calêndula', 'hibisco', 'rosas amarelas', 'louro', 'folha da fortuna'],
    obs: 'Também: pétalas de 7 rosas de cores diferentes.' },
  'Oxumaré': { ervas: ['confrei', 'cavalinha', 'guiné', 'folha de manga', 'folha de café', 'espinheira santa', 'flores coloridas', 'sálvia', 'pitanga', 'picão branco', 'pata de vaca', 'anis estrelado', 'semente de guaraná'],
    obs: 'Melhor banho: pétalas de 7 flores coloridas.' },
  'Oxóssi': { ervas: ['samambaia', 'jurema preta', 'guiné', 'arruda', 'arnica', 'quebra demanda', 'erva de bicho', 'espada de Santa Bárbara', 'espada de São Jorge', 'abre caminho', 'alecrim', 'folha de café', 'cipó caboclo', 'levante'],
    aviso: 'Comigo-ninguém-pode: não usar no banho (é tóxica).' },
  'Obá': { ervas: ['hortelã', 'jurema preta (casca)', 'peregum roxo', 'alfavaca', 'folha de pitanga', 'folha de laranjeira', 'manjericão roxo', 'alecrim'] },
  'Ogum': { ervas: ['guiné', 'folha de pitanga', 'folha de manga', 'eucalipto', 'espada de São Jorge', 'anis estrelado', 'hortelã', 'bardana', 'abre caminho', 'levante'] },
  'Iansã': { ervas: ['espada de Santa Bárbara', 'folha de pitanga', 'calêndula', 'hibisco', 'rosa vermelha', 'rosa amarela', 'catinga de mulata', 'canela em pau', 'espinheira santa', 'artemísia', 'arnica', 'flores vermelhas'],
    aviso: CANELA },
  'Xangô': { ervas: ['erva de São João', 'hibisco', 'para-raio', 'calêndula', 'jurema preta', 'canela em pau'], obs: 'De manhã.', aviso: CANELA },
  'Oroiná': { ervas: ['folha ou talo de cenoura', 'calêndula', 'folha de laranjeira', 'pitanga', 'mexerica', 'hibisco', 'carqueja', 'macela', 'canela em pau', 'rosa vermelha'],
    obs: 'De manhã.', aviso: CANELA },
  'Obaluaê': { ervas: ['folha de beterraba', 'sálvia', 'capim-limão', 'capim-cidreira', 'pinhão roxo', 'sete sangrias', 'cipó cruz', 'macassá', 'alcachofra', 'manjericão roxo', 'folha de rabanete'],
    obs: 'Também: banho de pipoca.' },
  'Nanã': { ervas: ['tanchagem', 'pinhão roxo', 'hortelã', 'cipó cruz', 'crisântemo', 'picão branco', 'sálvia', 'jurema'] },
  'Iemanjá': { ervas: ['alfazema blue', 'anis estrelado', 'rosas brancas', 'camomila', 'alecrim', 'crisântemo branco', 'erva de bicho', 'sálvia', 'capim-cidreira', 'malva', 'manjericão'],
    obs: 'À noite.' },
  'Omulu': { ervas: ['manjericão roxo', 'zimbro', 'pinhão roxo', 'picão preto', 'dandá', 'casca de ipê roxo', 'folha de café', 'casca de jurema preta'] },
};

// Chave: a linha (LINHAS). A gira "Encontro das Linhas" não tem lista própria.
export const BANHO_GUIA = {
  caboclo: { ervas: ['samambaia', 'levante', 'hortelã', 'jurema preta', 'abre caminho', 'arruda'], obs: 'Somadas às ervas de Oxóssi e do orixá que rege o caboclo.' },
  boiadeiro: { ervas: ['hortelã', 'abre caminho', 'espada de Santa Bárbara ou de São Jorge', 'levante', 'eucalipto', 'arruda', 'chapéu de couro'], obs: 'Ervas de Logunã, Iansã e Ogum.' },
  eres: { ervas: ['rosas ou flores coloridas (3 a 7)', 'manjericão', 'malva', 'erva doce', 'camomila', 'alfazema blue', 'anis estrelado', 'alecrim'] },
  'preto-velho': { ervas: ['arruda', 'dracena ou peregum roxo', 'pinhão roxo', 'guiné', 'espada de Ogum', 'folha de mamona', 'carqueja', 'eucalipto', 'hortelã', 'sálvia', 'rosa branca', 'alecrim', 'manjericão', 'samambaia', 'folha de pitanga', 'jurema preta', 'casca de romã', 'manjericão roxo', 'confrei', 'folha de beterraba'] },
  baiano: { ervas: ['pinhão roxo', 'guiné', 'arruda', 'espada de São Jorge', 'levante', 'folha de pitanga', 'espada de Iansã', 'eucalipto', 'jurema', 'calêndula', 'quebra demanda', 'folha de fumo'],
    obs: 'Também: banho de água de coco.' },
  marinheiro: { ervas: ['alfazema', 'rosas brancas', 'anis estrelado', 'manjericão', 'camomila'], obs: 'Também: banho de água do mar.' },
  cigano: { ervas: ['louro', 'canela', 'hibisco', 'rosas vermelhas'], aviso: CANELA },
  malandro: { ervas: ['quebra demanda', 'arruda', 'guiné', 'levante', 'espada de São Jorge', 'folha de pitanga', 'folha de limão', 'folhas de laranja'] },
  exu: { ervas: ['dandá', 'fava de aridan', 'folha da fortuna', 'zimbro', 'jurema', 'casca de cebola', 'casca de alho', 'folha de mamona', 'peregum roxo', 'folha de limão'] },
  'pomba-gira': { ervas: ['hibisco', 'canela em pau', 'cravo', 'folha de amora', 'calêndula', 'rosas vermelhas'], aviso: CANELA },
  'exu-mirim': { ervas: ['casca de alho', 'casca de cebola', 'casca de laranja seca', 'casca de limão', 'dandá', 'pinhão roxo', 'açoita-cavalo'] },
};
// Giras que juntam linhas (Exus & Pombagira): as ervas das linhas juntas, sem repetir.
const JUNTAS_BANHO = { 'exus-pombagira': ['exu', 'pomba-gira'] };

// { orixa: { nome, ervas, obs?, aviso? } | null, guia: { nome, ervas, obs?, aviso? } | null } para a gira.
export function banhosDaGira(g) {
  const o = orixaDaGira(g);
  const orixa = o && BANHO_ORIXA[o] ? { nome: o, ...BANHO_ORIXA[o] } : null;
  const l = linhaDaEntidade(g?.entidade);
  let guia = null;
  if (l && BANHO_GUIA[l]) guia = { nome: LINHA_LABEL[l], ...BANHO_GUIA[l] };
  else if (l && JUNTAS_BANHO[l]) {
    const partes = JUNTAS_BANHO[l].map((k) => BANHO_GUIA[k]);
    guia = { nome: LINHA_LABEL[l], ervas: [...new Set(partes.flatMap((x) => x.ervas))], aviso: partes.find((x) => x.aviso)?.aviso };
  }
  return { orixa, guia };
}
