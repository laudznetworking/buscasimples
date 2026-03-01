/**
 * ============================================================
 * BuscaFIERGS — Lógica Principal da Aplicação
 * app.js · Carregado exclusivamente por index.html
 * ============================================================
 */

// ── Configuração do Supabase ──────────────────────────────────────────────────
// ATENÇÃO: A chave "anon" é pública por design do Supabase (row-level security),
// mas não a exponha em repositórios públicos sem RLS configurado.
const URL_BANCO = 'https://dxezyhrzlzvwraozsgen.supabase.co';
const KEY_BANCO = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4ZXp5aHJ6bHp2d3Jhb3pzZ2VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNTEzNzIsImV4cCI6MjA4NzYyNzM3Mn0.8197orNkpw616BzlYq3BUK_zqp8MwFCmGnVkUDGH3L0';
const _supabase = supabase.createClient(URL_BANCO, KEY_BANCO);

// ── Lista de e-mails com acesso administrativo ────────────────────────────────
// Adicione ou remova e-mails conforme necessário
const EMAILS_ADMIN = [
    'endrewlterra@gmail.com',
    'endrew.terra@vetorial.com',
    'eli.correa@vetorial.com',
    'ivo.neto@vetorial.com',
    'felipe.bica@vetorial.com',
    'pablo.freitas@vetorial.com',
];

/** Verifica se um e-mail tem privilégios de administrador (case-insensitive) */
const isAdminEmail = (email) =>
    EMAILS_ADMIN.map(e => e.toLowerCase()).includes((email || '').toLowerCase());

// ── Estado global da aplicação ────────────────────────────────────────────────
let usuarioLogadoEmail = '';   // E-mail da sessão ativa
let paginaAtiva        = 'clientes'; // 'clientes' | 'mikrotik'
let listaAtual         = [];   // Dados carregados do banco
let idEdicaoAtiva      = null; // ID do registro em edição (null = novo registro)
let canalChat;                 // Canal Supabase Realtime para o chat
let contagemStatus     = { online: 0, offline: 0 }; // Contadores do dashboard NOC
let statusAnterior     = {};   // Rastreia status anterior de cada card por ID
let modoNocAtivo       = false; // Modo AUTO NOC ativo
let loopNoc            = null; // setInterval do modo NOC
let filtroAtual        = 'todos'; // Filtro ativo do painel

// ── Configurações do painel admin ─────────────────────────────────────────────
let abaAtiva          = 'logs';
let intervaloNoc      = 30000; // 30 segundos (em ms)
let limiteVerdePing   = 80;    // ms — abaixo disso: indicador verde
let limiteAmareloPing = 150;   // ms — abaixo disso: indicador amarelo; acima: vermelho
let dadosCSVPreview   = [];    // Dados carregados para pré-visualização do CSV

// Mapa de painéis admin por aba
const PAINEIS = ['painelLogs','painelRanking','painelUsuarios','painelAuditoria','painelDados','painelSistema'];
const ABA_MAP = {
    logs:'painelLogs', ranking:'painelRanking', usuarios:'painelUsuarios',
    auditoria:'painelAuditoria', dados:'painelDados', sistema:'painelSistema'
};

// Mensagens do terminal fictício decorativo
const logsTecnicos = [
    'INITIALIZING VETORIAL_OS v1.0.4...',
    'CONNECTING TO SUPABASE_NODE_01... [OK]',
    'ENCRYPTING SESSION HANDSHAKE... [AES-256]',
    'FETCHING MPLS_ROUTING_TABLES...',
    'HANDSHAKE PROTOCOL: SECURE',
    'BYPASSING PROXY_FILTER... SUCCESS',
    'LOADING INTERFACE_MODULES... 100%',
    'TUNNEL_ESTABLISHED: PORT 4443',
    'PINGING FORTIGATE_CLUSTER... [12ms]',
    'DATABASE_SYNC: COMPLETE',
    'MONITORING TRAFFIC: ACTIVE',
    'ALGORITHM_LOAD: NEURAL_SEARCH_v2',
    'SYSTEM_STATUS: NOMINAL',
];

// ══════════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', async () => {
    iniciarTerminalFicticio();

    // Tenta recuperar sessão ativa via token JWT
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        entrarNoSistema(session.user.email);
    } else {
        // Sem sessão: redireciona para o login
        window.location.href = 'login.html';
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// ENTRADA NO SISTEMA
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Carrega o sistema principal após autenticação bem-sucedida.
 * Mostra loading, busca dados e revela a tela principal.
 */
async function entrarNoSistema(email) {
    const loadingScreen = document.getElementById('loadingScreen');

    // Só exibe loading se ainda não estiver visível (evita flash duplo)
    if (loadingScreen.style.display === 'none' || loadingScreen.style.display === '') {
        document.getElementById('loadingText').innerText = 'RESTAURANDO SESSÃO';
        document.getElementById('loadingLogs').innerHTML = '';
        loadingScreen.style.display = 'flex';
        adicionarLogCarregamento('Sessão ativa detectada em cache. Restaurando...', 'text-slate-400');
        await new Promise(r => setTimeout(r, 400));
    }

    usuarioLogadoEmail = email;
    document.getElementById('userBadge').innerText = email;

    // Exibe botões restritos a admins
    if (isAdminEmail(email)) {
        document.getElementById('addBtn').classList.remove('hidden');
        document.getElementById('adminBtn').classList.remove('hidden');
        adicionarLogCarregamento('Privilégios de Administrador concedidos (Level 0).', 'text-blue-400');
        await new Promise(r => setTimeout(r, 300));
    }

    adicionarLogCarregamento('Estabelecendo canal de Presence (Usuários Suporte)...', 'text-slate-400');
    monitorarUsuariosAtivos();

    adicionarLogCarregamento('Sincronizando chat global (Broadcast WebSocket)...', 'text-slate-400');
    configurarChat();

    adicionarLogCarregamento('Montando matriz de rede e buscando clientes...', 'text-slate-400');
    await buscarNoBanco();

    adicionarLogCarregamento('Sincronização concluída. Iniciando Vetorial OS...', 'text-emerald-400 font-bold');

    setTimeout(() => {
        loadingScreen.style.display = 'none';
        document.getElementById('mainScreen').classList.remove('hidden');
    }, 800);
}

/**
 * Faz logout e redireciona para a tela de login.
 */
async function fazerLogout() {
    await _supabase.auth.signOut();
    window.location.href = 'login.html';
}

// ══════════════════════════════════════════════════════════════════════════════
// BUSCA E RENDERIZAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Consulta o Supabase com base no termo digitado e renderiza os cards.
 * Também registra a busca na tabela de logs.
 */
async function buscarNoBanco() {
    // Reseta contadores do dashboard antes de cada busca completa
    contagemStatus = { online: 0, offline: 0 };
    statusAnterior = {};

    if (paginaAtiva === 'clientes') {
        ['statOnline','statOffline'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = '0';
        });
        const elUptime = document.getElementById('statUptime');
        if (elUptime) elUptime.innerText = '--%';
    }

    const termo  = document.getElementById('searchBox').value.trim();
    const grid   = document.getElementById('resultsGrid');
    const tabela = paginaAtiva === 'clientes' ? 'clientes' : 'mikrotik';

    // Monta a query com filtros dinâmicos por modo
    let query = _supabase.from(tabela).select('*');
    if (termo) {
        if (paginaAtiva === 'clientes') {
            query = query.or(
                `nome.ilike.%${termo}%,numero_contrato.ilike.%${termo}%,ip_mpls.ilike.%${termo}%,ip_fortigate.ilike.%${termo}%`
            );
        } else {
            query = query.or(
                `nome.ilike.%${termo}%,numero_contrato.ilike.%${termo}%,ip_mikrotik.ilike.%${termo}%`
            );
        }
    }

    const { data } = await query.order('nome', { ascending: true });
    listaAtual = data || [];

    // Registra a busca nos logs (apenas quando há termo digitado)
    if (termo) {
        const { error: errInsert } = await _supabase.from('logs_consulta').insert([{
            termo_buscado: termo,
            usuario:       usuarioLogadoEmail,
            pagina:        paginaAtiva,
            data_hora:     new Date().toISOString()
        }]);

        if (errInsert) {
            console.warn('[LOG] Falha no insert completo:', errInsert.message);
            // Fallback: tenta salvar somente o termo (estrutura mínima da tabela)
            const { error: errFallback } = await _supabase.from('logs_consulta').insert([{
                termo_buscado: termo,
                data_hora:     new Date().toISOString()
            }]);
            if (errFallback) {
                console.error('[LOG] Falha total ao salvar log:', errFallback.message);
            } else {
                console.warn('[LOG] Log salvo sem usuario/pagina. Adicione as colunas na tabela logs_consulta.');
            }
        }
    }

    document.getElementById('totalClientes').innerText = `[ ${listaAtual.length} REGISTROS ]`;

    // Renderiza os cards na grade
    grid.innerHTML = listaAtual
        .map(item => paginaAtiva === 'clientes' ? renderCardFiergs(item) : renderCardMikrotik(item))
        .join('');

    aplicarFiltroStatus(filtroAtual);

    // Inicia verificação de status para cards FIERGS
    if (paginaAtiva === 'clientes') {
        listaAtual.forEach(c => {
            if (c.ip_fortigate) checarStatus(c.ip_fortigate, c.id);
        });
    }
}

// ── Renderização dos Cards ────────────────────────────────────────────────────

/**
 * Gera o HTML de um card no modo FIERGS (Fortigate).
 */
function renderCardFiergs(c) {
    const isAdmin          = isAdminEmail(usuarioLogadoEmail);
    const emManutencao     = !!c.em_manutencao;
    const classeManutencao = emManutencao ? 'card-manutencao' : '';
    const statusCard       = statusAnterior[c.id] || 'checking';
    const urlForti         = c.ip_fortigate?.startsWith('http') ? c.ip_fortigate : 'https://' + c.ip_fortigate;

    const editBtn = isAdmin
        ? `<button onclick="prepararEdicao('${c.id}')"
               class="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white w-10 h-10
                      flex items-center justify-center rounded-sm border border-white/10 transition-all shadow-lg">
               <i class="fas fa-pen text-xs"></i>
           </button>`
        : '';

    const badgeManutencao = emManutencao
        ? `<div class="inline-flex items-center gap-2 bg-amber-500/20 px-3 py-1 rounded-md border border-amber-500/40">
               <i class="fas fa-tools text-amber-400 text-[10px]"></i>
               <span class="text-amber-400 text-[10px] font-black tracking-widest uppercase">Em Manutenção</span>
           </div>`
        : '';

    const btnManutencao = isAdmin
        ? `<button onclick="toggleManutencao('${c.id}', ${emManutencao})"
               title="${emManutencao ? 'Remover manutenção' : 'Colocar em manutenção'}"
               class="btn-modern ${emManutencao ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-slate-500 border-white/10'}
                      hover:bg-amber-500/30 hover:text-amber-300 w-10 h-10 flex items-center
                      justify-center rounded-sm border transition-all shadow-lg">
               <i class="fas fa-tools text-xs"></i>
           </button>`
        : '';

    return `
        <div id="card-${c.id}" data-status="${statusCard}" data-manutencao="${emManutencao}"
             class="glass-card card-fiergs ${classeManutencao} p-6 md:p-8 rounded-lg flex flex-col gap-6 relative animate-[fadeIn_0.5s_ease-out]">
            <div class="flex justify-between items-start border-b border-white/5 pb-5">
                <div class="min-w-0 flex-1 pr-4">
                    <h3 class="text-xl md:text-2xl font-black text-white uppercase truncate tracking-tight">${c.nome}</h3>
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <div class="inline-flex items-center gap-2 bg-red-900/30 px-3 py-1 rounded-md border border-red-500/20">
                            <i class="fas fa-file-contract text-red-500 text-[10px]"></i>
                            <p class="text-red-400 text-[10px] font-ip tracking-widest uppercase">CTR: ${c.numero_contrato || 'N/A'}</p>
                        </div>
                        ${badgeManutencao}
                    </div>
                </div>
                <div class="flex gap-2 shrink-0">${btnManutencao}${editBtn}</div>
            </div>
            <div class="space-y-4">
                <!-- Rota MPLS -->
                <div class="bg-gradient-to-r from-black/60 to-black/30 p-4 rounded border border-white/5
                            flex justify-between items-center gap-3 relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-slate-600"></div>
                    <div class="min-w-0 pl-2">
                        <label class="text-[9px] uppercase text-slate-500 font-black tracking-widest block mb-1">Rota MPLS</label>
                        <span class="font-ip text-sm md:text-base truncate block text-slate-300 font-medium">${c.ip_mpls || '---'}</span>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="copiarComandoMpls('${c.ip_mpls}', this)" title="Copiar comandos para Fortigate"
                                class="btn-modern bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400
                                       hover:text-white p-3 rounded-sm border border-emerald-500/20 transition-all shadow-lg">
                            <i class="fas fa-terminal"></i>
                        </button>
                        <button onclick="copiarTexto('${c.ip_mpls}', this)" title="Copiar apenas o IP"
                                class="btn-modern bg-white/5 hover:bg-white/10 text-slate-400
                                       hover:text-white p-3 rounded-sm border border-white/5 transition-all">
                            <i class="far fa-copy"></i>
                        </button>
                    </div>
                </div>
                <!-- Node Fortigate -->
                <div class="bg-gradient-to-r from-black/60 to-black/30 p-4 md:p-5 rounded border border-white/5
                            relative overflow-hidden shadow-inner">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-red-600 shadow-[0_0_10px_#ef4444]"></div>
                    <div class="flex justify-between items-center mb-3 pl-2">
                        <label class="text-[10px] uppercase text-white font-black flex items-center gap-3 tracking-widest">
                            <span id="status-${c.id}" class="status-pulse"></span> Node Fortigate
                            <span id="ping-ms-${c.id}" class="text-slate-600 font-ip text-[10px] ml-2 font-bold tracking-tighter opacity-0 transition-opacity duration-300">-- ms</span>
                        </label>
                        <button onclick="checarStatus('${c.ip_fortigate}', '${c.id}')"
                                class="text-slate-500 hover:text-red-400 transition-colors p-1 bg-white/5 rounded-md px-2 text-[10px] font-ip uppercase">
                            <i id="btn-status-${c.id}" class="fas fa-sync-alt mr-1"></i> Ping
                        </button>
                    </div>
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-2">
                        <span class="font-ip text-sm md:text-base truncate flex-1 text-white font-bold tracking-tight">${c.ip_fortigate || '---'}</span>
                        <div class="flex gap-2">
                            <button onclick="window.open('${urlForti}', '_blank')"
                                    class="btn-modern bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400
                                           hover:text-white w-12 h-12 flex items-center justify-center
                                           rounded-sm border border-emerald-500/20 transition-all">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                            <button onclick="copiarTexto('${c.ip_fortigate}', this)"
                                    class="btn-modern bg-red-500/10 hover:bg-red-500 text-red-400
                                           hover:text-white w-12 h-12 flex items-center justify-center
                                           rounded-sm border border-red-500/20 transition-all">
                                <i class="far fa-copy"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
}

/**
 * Gera o HTML de um card no modo Mikrotik.
 */
function renderCardMikrotik(m) {
    const isAdmin          = isAdminEmail(usuarioLogadoEmail);
    const emManutencao     = !!m.em_manutencao;
    const classeManutencao = emManutencao ? 'card-manutencao' : '';

    const editBtn = isAdmin
        ? `<button onclick="prepararEdicao('${m.id}')"
               class="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white w-10 h-10
                      flex items-center justify-center rounded-sm border border-white/10 transition-all shadow-lg">
               <i class="fas fa-pen text-xs"></i>
           </button>`
        : '';

    const badgeManutencao = emManutencao
        ? `<div class="inline-flex items-center gap-2 bg-amber-500/20 px-3 py-1 rounded-md border border-amber-500/40">
               <i class="fas fa-tools text-amber-400 text-[10px]"></i>
               <span class="text-amber-400 text-[10px] font-black tracking-widest uppercase">Em Manutenção</span>
           </div>`
        : '';

    const btnManutencao = isAdmin
        ? `<button onclick="toggleManutencao('${m.id}', ${emManutencao})"
               title="${emManutencao ? 'Remover manutenção' : 'Colocar em manutenção'}"
               class="btn-modern ${emManutencao ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-slate-500 border-white/10'}
                      hover:bg-amber-500/30 hover:text-amber-300 w-10 h-10 flex items-center
                      justify-center rounded-sm border transition-all shadow-lg">
               <i class="fas fa-tools text-xs"></i>
           </button>`
        : '';

    return `
        <div id="card-${m.id}" data-manutencao="${emManutencao}"
             class="glass-card card-mikrotik ${classeManutencao} p-6 md:p-8 rounded-lg flex flex-col gap-6 relative animate-[fadeIn_0.5s_ease-out]">
            <div class="flex justify-between items-start border-b border-white/5 pb-5">
                <div class="min-w-0 flex-1 pr-4">
                    <h3 class="text-xl md:text-2xl font-black text-white uppercase truncate tracking-tight">${m.nome}</h3>
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <div class="inline-flex items-center gap-2 bg-blue-900/30 px-3 py-1 rounded-md border border-blue-500/20">
                            <i class="fas fa-file-contract text-blue-500 text-[10px]"></i>
                            <p class="text-blue-400 text-[10px] font-ip tracking-widest uppercase">Contrato: ${m.numero_contrato || 'N/A'}</p>
                        </div>
                        ${badgeManutencao}
                    </div>
                </div>
                <div class="flex gap-2 shrink-0">${btnManutencao}${editBtn}</div>
            </div>
            <div class="bg-gradient-to-r from-black/60 to-black/30 p-6 rounded border border-white/5 relative overflow-hidden shadow-inner">
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_10px_#3b82f6]"></div>
                <div class="text-[10px] uppercase text-blue-400 font-black tracking-widest mb-4 pl-2 flex items-center gap-2">
                    <i class="fas fa-network-wired"></i> Terminal Mikrotik
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-2">
                    <span class="font-ip text-lg md:text-xl text-white font-bold tracking-tight">${m.ip_mikrotik || '---'}</span>
                    <div class="flex gap-2">
                        <button onclick="window.location.href='winbox://${m.ip_mikrotik}'"
                                class="btn-modern bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white
                                       w-12 h-12 flex items-center justify-center rounded-sm border border-blue-500/30 transition-all shadow-lg">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                        <button onclick="copiarTexto('${m.ip_mikrotik}', this)"
                                class="btn-modern bg-white/5 hover:bg-white/10 text-slate-300
                                       w-12 h-12 flex items-center justify-center rounded-sm border border-white/10 transition-all">
                            <i class="far fa-copy"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ALTERNÂNCIA DE MODO (FIERGS ↔ MIKROTIK)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Alterna entre os modos FIERGS e Mikrotik, atualizando
 * cores, textos, e buscando os dados do banco correspondente.
 *
 * BUG CORRIGIDO: O código original usava filtroBox.style.display='none/flex'.
 * Inline styles sobrescrevem classes Tailwind, gerando inconsistências visuais.
 * SOLUÇÃO: Usar classList.add/remove('hidden') consistentemente.
 */
async function alternarPagina() {
    const telaLoading   = document.getElementById('loadingScreen');
    const filtroBox     = document.getElementById('filtroStatusNoc');
    const body          = document.body;
    const btnNavText    = document.getElementById('btnNavText');
    const titulo        = document.getElementById('mainTitle');
    const nocBar        = document.getElementById('nocDashboard');
    const searchBox     = document.getElementById('searchBox');
    const searchIcon    = document.getElementById('searchIcon');
    const headerIcon    = document.getElementById('headerIconBg');
    const barraProgress = document.getElementById('scrollProgressBar');
    const btnTopo       = document.getElementById('btnVoltarTopo');

    document.getElementById('loadingText').innerText = 'ALTERANDO DATACENTER';
    document.getElementById('loadingLogs').innerHTML = '';
    telaLoading.style.display = 'flex';

    adicionarLogCarregamento('Desconectando cluster atual de visualização...', 'text-slate-400');
    await new Promise(r => setTimeout(r, 300));

    if (paginaAtiva === 'clientes') {
        // Muda para Mikrotik
        paginaAtiva = 'mikrotik';
        body.classList.add('mode-mikrotik');
        nocBar?.classList.add('hidden');
        filtroBox?.classList.add('hidden');
        btnNavText.innerText  = 'MODO FIERGS';
        titulo.innerHTML      = 'BUSCAR<span class="text-blue-500 font-light">MIKROTIK</span>';
        searchBox.placeholder = 'Localizar terminal Mikrotik...';
        searchBox.classList.replace('red-glow-input', 'blue-glow-input');
        searchIcon.classList.replace('text-red-500',  'text-blue-500');
        headerIcon.classList.replace('from-red-600',  'from-blue-600');
        headerIcon.classList.replace('to-red-800',    'to-blue-800');
        headerIcon.classList.replace(
            'shadow-[0_5px_20px_rgba(239,68,68,0.3)]',
            'shadow-[0_5px_20px_rgba(59,130,246,0.3)]'
        );
        if (barraProgress) barraProgress.className =
            'fixed top-0 left-0 w-1 bg-blue-600 shadow-[0_0_15px_rgba(59,130,246,0.8)] z-[1000] transition-all duration-150';
        btnTopo?.classList.replace('hover:border-red-500', 'hover:border-blue-500');
    } else {
        // Muda para FIERGS
        paginaAtiva = 'clientes';
        body.classList.remove('mode-mikrotik');
        nocBar?.classList.remove('hidden');
        filtroBox?.classList.remove('hidden');
        btnNavText.innerText  = 'MODO MIKROTIK';
        titulo.innerHTML      = 'BUSCAR<span class="text-red-500 font-light">FIERGS</span>';
        searchBox.placeholder = 'Localizar ativo na rede (Nome ou Contrato)...';
        searchBox.classList.replace('blue-glow-input', 'red-glow-input');
        searchIcon.classList.replace('text-blue-500',  'text-red-500');
        headerIcon.classList.replace('from-blue-600',  'from-red-600');
        headerIcon.classList.replace('to-blue-800',    'to-red-800');
        headerIcon.classList.replace(
            'shadow-[0_5px_20px_rgba(59,130,246,0.3)]',
            'shadow-[0_5px_20px_rgba(239,68,68,0.3)]'
        );
        if (barraProgress) barraProgress.className =
            'fixed top-0 left-0 w-1 bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.8)] z-[1000] transition-all duration-150';
        btnTopo?.classList.replace('hover:border-blue-500', 'hover:border-red-500');
    }

    filtroAtual = 'todos';
    adicionarLogCarregamento('Estabelecendo handshake com o novo banco de dados...', 'text-slate-400');
    await buscarNoBanco();

    adicionarLogCarregamento('Renderização de painel concluída com sucesso.', 'text-emerald-400 font-bold');
    setTimeout(() => { telaLoading.style.display = 'none'; }, 600);
}

// ══════════════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO DE STATUS (PING SIMULADO)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Converte o tempo de resposta do navegador para uma estimativa de latência ICMP.
 * Browsers adicionam overhead de conexão que não existe no ping real.
 */
function aproximarPingICMP(msNavegador) {
    return Math.max(1, Math.round(msNavegador / 3.5));
}

/**
 * Verifica o status de um host via fetch (modo no-cors).
 * Atualiza o indicador visual do card e os contadores do dashboard.
 *
 * BUG CORRIGIDO: O código original incrementava os contadores a cada chamada
 * sem decrementar o estado anterior, causando crescimento infinito dos contadores.
 * SOLUÇÃO: Rastreamos o status anterior por card ID e ajustamos os contadores
 * corretamente antes de atribuir o novo estado.
 */
async function checarStatus(url, id) {
    const indicador = document.getElementById(`status-${id}`);
    const cardBox   = document.getElementById(`card-${id}`);
    const msLabel   = document.getElementById(`ping-ms-${id}`);

    if (!url || !indicador) return;

    const statusPrevio = statusAnterior[id]; // undefined | 'online' | 'offline'

    indicador.className = 'status-pulse checking';
    cardBox?.setAttribute('data-status', 'checking');

    if (msLabel) {
        msLabel.style.opacity = '1';
        msLabel.innerText     = 'pinging...';
        msLabel.className     = 'text-slate-500 font-ip text-[9px] ml-2 animate-pulse tracking-widest';
    }

    const tempoInicio   = performance.now();
    const limiteVerde   = limiteVerdePing;
    const limiteAmarelo = limiteAmareloPing;

    /** Retorna a classe de cor Tailwind baseada na latência */
    const corLatencia = (ms) => {
        if (ms < limiteVerde)   return 'text-emerald-400';
        if (ms < limiteAmarelo) return 'text-yellow-400';
        return 'text-orange-500';
    };

    /** Atualiza contadores de forma segura, decrementando o estado anterior */
    const atualizarContador = (novoStatus) => {
        if (statusPrevio === 'online')  contagemStatus.online  = Math.max(0, contagemStatus.online  - 1);
        if (statusPrevio === 'offline') contagemStatus.offline = Math.max(0, contagemStatus.offline - 1);
        if (novoStatus === 'online')  contagemStatus.online++;
        if (novoStatus === 'offline') contagemStatus.offline++;
        statusAnterior[id] = novoStatus;
        cardBox?.setAttribute('data-status', novoStatus);
    };

    try {
        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), 4000);
        await fetch(url.startsWith('http') ? url : 'https://' + url, {
            mode: 'no-cors', signal: controller.signal
        });
        clearTimeout(timer);

        const latencia = aproximarPingICMP(Math.round(performance.now() - tempoInicio));
        indicador.className = 'status-pulse online';
        atualizarContador('online');

        if (msLabel) {
            msLabel.innerText = `${latencia} ms`;
            msLabel.className = `font-ip text-[10px] ml-2 font-black tracking-tight ${corLatencia(latencia)}`;
        }

    } catch (e) {
        const tempoBruto = Math.round(performance.now() - tempoInicio);

        if (e.name === 'AbortError') {
            // Timeout real: host inacessível
            indicador.className = 'status-pulse offline';
            if (statusPrevio === 'online') tocarAlarmeSonoro(); // Alerta de mudança de estado
            atualizarContador('offline');
            if (msLabel) {
                msLabel.innerText = 'TIMEOUT';
                msLabel.className = 'text-red-500 font-ip text-[10px] ml-2 font-black tracking-widest';
            }
        } else {
            // Erro não-timeout (CORS, rede): host respondeu de alguma forma → online
            const latencia = aproximarPingICMP(tempoBruto);
            indicador.className = 'status-pulse online';
            atualizarContador('online');
            if (msLabel) {
                msLabel.innerText = `${latencia} ms`;
                msLabel.className = `font-ip text-[10px] ml-2 font-black tracking-tight ${corLatencia(latencia)}`;
            }
        }
    }

    atualizarNocDashboard();
    aplicarFiltroStatus(filtroAtual);
}

/** Atualiza os números do dashboard NOC */
function atualizarNocDashboard() {
    const total = listaAtual.length;
    document.getElementById('statTotal').innerText   = total;
    document.getElementById('statOnline').innerText  = contagemStatus.online;
    document.getElementById('statOffline').innerText = contagemStatus.offline;
    if (total > 0) {
        const percent = ((contagemStatus.online / total) * 100).toFixed(1);
        document.getElementById('statUptime').innerText = percent + '%';
    }
}

// ── Alarme sonoro (singleton AudioContext) ────────────────────────────────────
/**
 * BUG CORRIGIDO: Criar um novo AudioContext a cada chamada geraria vazamento
 * de recursos de áudio. Reutilizamos um único contexto global de forma lazy.
 */
let _audioCtx = null;
function obterAudioContext() {
    if (!_audioCtx || _audioCtx.state === 'closed') {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
}

/** Toca um bip de alerta quando um host vai de online para offline */
function tocarAlarmeSonoro() {
    const ctx  = obterAudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    setTimeout(() => osc.stop(), 300);
}

// ── Modo AUTO NOC ─────────────────────────────────────────────────────────────
/** Liga/desliga o monitoramento automático periódico de todos os hosts */
function toggleModoNoc() {
    modoNocAtivo = !modoNocAtivo;
    const btn = document.getElementById('btnNoc');

    if (modoNocAtivo) {
        btn.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/50', 'shadow-[0_0_15px_rgba(16,185,129,0.3)]');
        btn.classList.remove('bg-black/40', 'text-slate-300', 'border-white/5');
        btn.innerHTML = '<i class="fas fa-satellite-dish animate-pulse"></i> AUTO: ON';

        loopNoc = setInterval(() => {
            // Reseta contadores antes de cada varredura completa
            contagemStatus = { online: 0, offline: 0 };
            statusAnterior = {};
            listaAtual.forEach(c => {
                if (c.ip_fortigate) checarStatus(c.ip_fortigate, c.id);
            });
        }, intervaloNoc);
    } else {
        btn.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/50', 'shadow-[0_0_15px_rgba(16,185,129,0.3)]');
        btn.classList.add('bg-black/40', 'text-slate-300', 'border-white/5');
        btn.innerHTML = '<i class="fas fa-satellite-dish"></i> AUTO: OFF';
        clearInterval(loopNoc);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// FILTROS DE STATUS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Aplica o filtro visual de status nos cards renderizados.
 * Não faz nova busca no banco — apenas mostra/esconde cards existentes.
 */
function aplicarFiltroStatus(status) {
    filtroAtual = status;

    const IDs = ['btnFiltroTodos','btnFiltroOnline','btnFiltroOffline','btnFiltroManutencao'];
    const base = 'btn-modern bg-black/40 hover:bg-white/10 text-slate-500 hover:text-white px-5 py-2 rounded-sm text-[10px] font-black tracking-widest uppercase border border-white/5 transition-all';

    IDs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = base;
    });

    const ATIVO = {
        todos:      'btn-modern bg-white/10 text-white px-5 py-2 rounded-sm text-[10px] font-black tracking-widest uppercase border border-white/20 transition-all shadow-lg',
        online:     'btn-modern bg-emerald-500/20 text-emerald-400 px-5 py-2 rounded-sm text-[10px] font-black tracking-widest uppercase border border-emerald-500/50 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]',
        offline:    'btn-modern bg-red-500/20 text-red-400 px-5 py-2 rounded-sm text-[10px] font-black tracking-widest uppercase border border-red-500/50 transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)]',
        manutencao: 'btn-modern bg-amber-500/20 text-amber-400 px-5 py-2 rounded-sm text-[10px] font-black tracking-widest uppercase border border-amber-500/50 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]',
    };

    const mapa = { todos: 'btnFiltroTodos', online: 'btnFiltroOnline', offline: 'btnFiltroOffline', manutencao: 'btnFiltroManutencao' };
    const btnAlvo = document.getElementById(mapa[status]);
    if (btnAlvo && ATIVO[status]) btnAlvo.className = ATIVO[status];

    document.querySelectorAll('.card-fiergs, .card-mikrotik').forEach(card => {
        if (status === 'todos') {
            card.style.display = '';
            return;
        }
        if (status === 'manutencao') {
            card.style.display = card.dataset.manutencao === 'true' ? '' : 'none';
            return;
        }
        const bolinha = card.querySelector('.status-pulse');
        if (!bolinha) { card.style.display = ''; return; }
        let cardStatus = 'checking';
        if (bolinha.classList.contains('online'))  cardStatus = 'online';
        if (bolinha.classList.contains('offline')) cardStatus = 'offline';
        card.style.display = cardStatus === status ? '' : 'none';
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL DE CADASTRO / EDIÇÃO DE REGISTROS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Abre o modal de cadastro configurado para o modo atual (clientes/mikrotik).
 *
 * BUG CORRIGIDO: O original usava .replace() encadeado para trocar classes de cor
 * do botão, que falha silenciosamente se a classe não existia.
 * SOLUÇÃO: Define className completa diretamente baseada no modo atual.
 */
function abrirModal(modo) {
    const campos = document.getElementById('camposDinamicos');
    const border = document.getElementById('modalBorder');
    const btn    = document.getElementById('btnSubmitModal');
    const titulo = document.getElementById('modalTitle');

    const classeBaseBtn = 'btn-modern w-full py-5 rounded font-black text-white transition-all uppercase tracking-widest text-sm shadow-[0_10px_20px_rgba(0,0,0,0.3)] mt-8';

    titulo.textContent = modo === 'editar' ? 'Editar Registro' : 'Registro Firewall';

    if (paginaAtiva === 'clientes') {
        border.style.borderColor = '#ef4444';
        btn.className = `${classeBaseBtn} bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500`;
        campos.innerHTML = `
            <div class="relative">
                <label class="absolute -top-3 left-4 bg-[#0d121c] px-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">IP MPLS</label>
                <input type="text" id="cadMpls" placeholder="Ex: 10.0.0.1"
                       class="w-full bg-black/30 border border-white/10 p-5 rounded outline-none text-white focus:border-red-500 transition-colors font-ip text-sm">
            </div>
            <div class="relative mt-6">
                <label class="absolute -top-3 left-4 bg-[#0d121c] px-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">URL / IP Fortigate</label>
                <input type="text" id="cadFortigate" placeholder="Ex: 192.168.1.1:4443"
                       class="w-full bg-black/30 border border-white/10 p-5 rounded outline-none text-white focus:border-red-500 transition-colors font-ip text-sm">
            </div>
            <label class="flex items-center gap-4 mt-2 cursor-pointer group">
                <div class="relative">
                    <input type="checkbox" id="cadManutencao" class="sr-only peer">
                    <div class="w-11 h-6 bg-black/50 border border-white/10 rounded-full peer-checked:bg-amber-500/30 peer-checked:border-amber-500/50 transition-all"></div>
                    <div class="absolute top-1 left-1 w-4 h-4 bg-slate-500 rounded-full peer-checked:translate-x-5 peer-checked:bg-amber-400 transition-all group-hover:bg-slate-400"></div>
                </div>
                <span class="text-[11px] font-black tracking-widest uppercase text-slate-400 group-hover:text-amber-400 transition-colors"><i class="fas fa-tools mr-2"></i>Em Manutenção</span>
            </label>`;
    } else {
        border.style.borderColor = '#3b82f6';
        btn.className = `${classeBaseBtn} bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500`;
        campos.innerHTML = `
            <div class="relative">
                <label class="absolute -top-3 left-4 bg-[#0d121c] px-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">IP Mikrotik</label>
                <input type="text" id="cadMikrotik" placeholder="Ex: 172.16.0.1"
                       class="w-full bg-black/30 border border-white/10 p-5 rounded outline-none text-white focus:border-blue-500 transition-colors font-ip text-sm">
            </div>
            <label class="flex items-center gap-4 mt-2 cursor-pointer group">
                <div class="relative">
                    <input type="checkbox" id="cadManutencao" class="sr-only peer">
                    <div class="w-11 h-6 bg-black/50 border border-white/10 rounded-full peer-checked:bg-amber-500/30 peer-checked:border-amber-500/50 transition-all"></div>
                    <div class="absolute top-1 left-1 w-4 h-4 bg-slate-500 rounded-full peer-checked:translate-x-5 peer-checked:bg-amber-400 transition-all group-hover:bg-slate-400"></div>
                </div>
                <span class="text-[11px] font-black tracking-widest uppercase text-slate-400 group-hover:text-amber-400 transition-colors"><i class="fas fa-tools mr-2"></i>Em Manutenção</span>
            </label>`;
    }

    document.getElementById('modalCadastro').classList.remove('hidden');
}

function fecharModal() {
    document.getElementById('modalCadastro').classList.add('hidden');
    idEdicaoAtiva = null;
    document.getElementById('formGeral').reset();
}

/** Pré-preenche o modal com os dados existentes para edição */
function prepararEdicao(id) {
    const item = listaAtual.find(i => i.id == id);
    if (!item) return;
    idEdicaoAtiva = id;
    abrirModal('editar');

    document.getElementById('cadNome').value     = item.nome;
    document.getElementById('cadContrato').value = item.numero_contrato || '';

    if (paginaAtiva === 'clientes') {
        document.getElementById('cadMpls').value      = item.ip_mpls || '';
        document.getElementById('cadFortigate').value = item.ip_fortigate || '';
    } else {
        document.getElementById('cadMikrotik').value = item.ip_mikrotik || '';
    }

    const chk = document.getElementById('cadManutencao');
    if (chk) chk.checked = !!item.em_manutencao;
}

// ── Submit do formulário de cadastro/edição ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('formGeral')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tabela = paginaAtiva === 'clientes' ? 'clientes' : 'mikrotik';
        const dados  = {
            nome:            document.getElementById('cadNome').value.toUpperCase(),
            numero_contrato: document.getElementById('cadContrato').value.toUpperCase(),
            em_manutencao:   document.getElementById('cadManutencao')?.checked ?? false,
        };

        if (paginaAtiva === 'clientes') {
            dados.ip_mpls      = document.getElementById('cadMpls').value;
            dados.ip_fortigate = document.getElementById('cadFortigate').value;
        } else {
            dados.ip_mikrotik = document.getElementById('cadMikrotik').value;
        }

        const query = idEdicaoAtiva
            ? _supabase.from(tabela).update(dados).eq('id', idEdicaoAtiva)
            : _supabase.from(tabela).insert([dados]);

        const { error } = await query;
        if (!error) {
            await registrarAuditoria(idEdicaoAtiva ? 'UPDATE' : 'INSERT', tabela, dados.nome);
            fecharModal();
            buscarNoBanco();
        }
    });
});

// ── Toggle de Manutenção ──────────────────────────────────────────────────────
async function toggleManutencao(id, estadoAtual) {
    const tabela    = paginaAtiva === 'clientes' ? 'clientes' : 'mikrotik';
    const novoValor = !estadoAtual;

    const { error } = await _supabase.from(tabela).update({ em_manutencao: novoValor }).eq('id', id);
    if (error) { console.error('Erro ao atualizar manutenção:', error); return; }

    const idx = listaAtual.findIndex(i => i.id == id);
    if (idx !== -1) {
        listaAtual[idx].em_manutencao = novoValor;
        const nomeRegistro = listaAtual[idx]?.nome || `ID: ${id}`;
        await registrarAuditoria(novoValor ? 'MANUTENCAO_ON' : 'MANUTENCAO_OFF', tabela, nomeRegistro);

        const cardAntigo = document.getElementById(`card-${id}`);
        if (cardAntigo) {
            const htmlNovo = paginaAtiva === 'clientes'
                ? renderCardFiergs(listaAtual[idx])
                : renderCardMikrotik(listaAtual[idx]);
            const temp = document.createElement('div');
            temp.innerHTML = htmlNovo;
            cardAntigo.replaceWith(temp.firstElementChild);
            if (paginaAtiva === 'clientes' && listaAtual[idx].ip_fortigate) {
                checarStatus(listaAtual[idx].ip_fortigate, id);
            }
        }
    }

    aplicarFiltroStatus(filtroAtual);
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS DE CÓPIA
// ══════════════════════════════════════════════════════════════════════════════

/** Copia texto para a área de transferência e dá feedback visual no botão */
function copiarTexto(texto, elemento) {
    if (!texto || texto === '---') return;
    navigator.clipboard.writeText(texto).then(() => {
        const icone = elemento.querySelector('i');
        icone.className = 'fas fa-check text-emerald-400';
        setTimeout(() => icone.className = 'far fa-copy', 2000);
    });
}

/**
 * Gera e copia os comandos de ping do Fortigate para a área de transferência.
 * Usa o sistema de feedback do modal de cadastro como feedback global.
 */
function copiarComandoMpls(ipMpls, elemento) {
    if (!ipMpls || ipMpls === '---') return;
    const comandos = `execute ping-options source 10.165.112.250\nexecute ping ${ipMpls}\n`;
    navigator.clipboard.writeText(comandos).then(() => {
        const icone = elemento.querySelector('i');
        const classeOriginal = icone.className;
        icone.className = 'fas fa-check text-white';
        setTimeout(() => icone.className = classeOriginal, 2000);
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// TERMINAL DE PING
// ══════════════════════════════════════════════════════════════════════════════

let pingInterval = null;
let pingsCount   = 0;

/** Abre o modal do terminal e opcionalmente preenche o IP */
function abrirTerminal(ip = '') {
    const modal  = document.getElementById('modalTerminal');
    const janela = document.getElementById('terminalJanela');
    const input  = document.getElementById('ipTerminal');

    modal.classList.remove('hidden');
    setTimeout(() => {
        janela.classList.remove('scale-95', 'opacity-0');
        janela.classList.add('scale-100', 'opacity-100');
    }, 10);

    if (ip) {
        input.value = ip;
        input.focus();
    }
}

function fecharTerminal() {
    const modal  = document.getElementById('modalTerminal');
    const janela = document.getElementById('terminalJanela');

    janela.classList.remove('scale-100', 'opacity-100');
    janela.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
        if (pingInterval) clearInterval(pingInterval);
    }, 300);
}

function adicionarLinhaTerminal(texto, cor = 'text-slate-300') {
    const tela  = document.getElementById('telaTerminal');
    const linha = document.createElement('div');
    linha.className = cor;
    linha.innerText = texto;
    tela.appendChild(linha);
    tela.scrollTop = tela.scrollHeight;
}

/**
 * Mede latência com múltiplas amostras, descartando a primeira
 * (que inclui overhead de warm-up de conexão TCP).
 */
async function medirLatenciaReal(urlAlvo, totalAmostras = 4) {
    const urlFinal = urlAlvo.startsWith('http') ? urlAlvo : 'https://' + urlAlvo;
    const amostras = [];

    for (let i = 0; i < totalAmostras; i++) {
        const t0 = performance.now();
        try {
            const controller = new AbortController();
            const timer      = setTimeout(() => controller.abort(), 4000);
            await fetch(urlFinal, { mode: 'no-cors', signal: controller.signal });
            clearTimeout(timer);
            const msBruto = Math.round(performance.now() - t0);
            if (i > 0) amostras.push(aproximarPingICMP(msBruto)); // Descarta warmup
        } catch (e) {
            if (e.name === 'AbortError') return null;
            const msBruto = Math.round(performance.now() - t0);
            if (i > 0) amostras.push(aproximarPingICMP(msBruto));
        }
    }

    if (!amostras.length) return null;
    amostras.sort((a, b) => a - b);
    return amostras[Math.floor(amostras.length / 2)]; // Retorna a mediana
}

/**
 * Executa 4 pings sequenciais e exibe as estatísticas no terminal.
 *
 * BUG CORRIGIDO: O original limpava o campo de IP imediatamente ao iniciar o ping.
 * SOLUÇÃO: O campo só é limpo após a conclusão de todos os pings,
 * mantendo o IP visível durante o processo.
 */
async function rodarPing() {
    const ipInput = document.getElementById('ipTerminal');
    const ip      = ipInput.value.trim();
    const tela    = document.getElementById('telaTerminal');

    if (!ip) return;

    if (pingInterval) clearInterval(pingInterval);
    tela.innerHTML = '';
    pingsCount     = 0;

    adicionarLinhaTerminal(`PING ${ip} (${ip}) 56(84) bytes of data.`, 'text-white font-bold mb-2');
    adicionarLinhaTerminal('Aquecendo conexão...', 'text-slate-500 text-[10px] italic mb-1');

    // Warmup da conexão TCP para reduzir overhead na primeira amostra
    const urlFinal = ip.startsWith('http') ? ip : 'https://' + ip;
    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 3000);
        await fetch(urlFinal, { mode: 'no-cors', signal: ctrl.signal });
    } catch (_) { /* ignorado intencionalmente */ }

    // Remove a mensagem de aquecimento
    if (tela.lastChild) tela.removeChild(tela.lastChild);

    let perdidos = 0;

    pingInterval = setInterval(async () => {
        if (pingsCount >= 4) {
            clearInterval(pingInterval);
            const recebidos = 4 - perdidos;
            const perda     = Math.round((perdidos / 4) * 100);
            adicionarLinhaTerminal(`--- ${ip} ping statistics ---`, 'text-white mt-4');
            adicionarLinhaTerminal(
                `4 packets transmitted, ${recebidos} received, ${perda}% packet loss`,
                perda > 0 ? 'text-red-400' : 'text-white'
            );
            adicionarLinhaTerminal('root@vetorial-suporte:~# ', 'text-emerald-500 mt-2');
            // Só limpa o input APÓS o ping terminar (correção do bug)
            ipInput.value = '';
            return;
        }

        pingsCount++;
        const ms = await medirLatenciaReal(ip, 3);

        if (ms !== null) {
            adicionarLinhaTerminal(
                `64 bytes from ${ip}: icmp_seq=${pingsCount} ttl=64 time=${ms} ms`,
                'text-emerald-400'
            );
        } else {
            perdidos++;
            adicionarLinhaTerminal(
                `From ${ip} icmp_seq=${pingsCount} Destination Host Unreachable`,
                'text-red-500'
            );
        }
    }, 1200);
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT E BROADCAST
// ══════════════════════════════════════════════════════════════════════════════

/** Configura os canais Realtime do Supabase para chat e avisos globais */
function configurarChat() {
    canalChat = _supabase.channel('chat-global');
    canalChat
        .on('broadcast', { event: 'msg' }, ({ payload }) => {
            exibirMensagemNoChat(payload.user, payload.text, false);
        })
        .on('broadcast', { event: 'aviso-global' }, ({ payload }) => {
            exibirAvisoGlobal(payload.texto, payload.de);
        })
        .subscribe();

    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') enviarMensagem();
    });
}

async function enviarMensagem() {
    const input = document.getElementById('chatInput');
    const texto = input.value.trim();
    if (!texto) return;

    await canalChat.send({
        type:    'broadcast',
        event:   'msg',
        payload: { user: usuarioLogadoEmail.split('@')[0], text: texto }
    });

    exibirMensagemNoChat('Eu', texto, true);
    input.value = '';
}

/**
 * Renderiza uma mensagem no chat.
 *
 * BUG CORRIGIDO: O original injetava `text` diretamente em innerHTML,
 * criando vulnerabilidade XSS. Um usuário malicioso poderia enviar
 * HTML com <script> e executar código no navegador de outros usuários.
 * SOLUÇÃO: Usar .textContent para inserir texto (nunca interpreta HTML).
 */
function exibirMensagemNoChat(user, text, isMe) {
    const container = document.getElementById('chatMessages');
    const msgDiv    = document.createElement('div');
    msgDiv.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-[fadeIn_0.3s_ease-out]`;

    const spanUser = document.createElement('span');
    spanUser.className = 'text-[9px] text-slate-500 mb-1 font-bold tracking-widest uppercase';
    spanUser.textContent = user; // textContent: seguro contra XSS

    const divBubble = document.createElement('div');
    divBubble.className = `${isMe ? 'bg-gradient-to-br from-red-600 to-red-800 text-white' : 'bg-slate-800 text-slate-200'} p-3 px-4 rounded ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'} max-w-[90%] break-words shadow-lg border border-white/5`;
    divBubble.textContent = text; // textContent: seguro contra XSS

    msgDiv.appendChild(spanUser);
    msgDiv.appendChild(divBubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function toggleChat() {
    const win = document.getElementById('chatWindow');
    win.classList.toggle('hidden');
    if (!win.classList.contains('hidden')) {
        document.getElementById('chatInput').focus();
    }
}

async function enviarBroadcast() {
    const input = document.getElementById('inputBroadcast');
    const msg   = input.value.trim();
    if (!msg) return;
    await canalChat.send({
        type: 'broadcast', event: 'aviso-global',
        payload: { texto: msg, de: usuarioLogadoEmail.split('@')[0] }
    });
    exibirAvisoGlobal(msg, usuarioLogadoEmail.split('@')[0]);
    input.value = '';
}

/** Exibe um banner de aviso global no topo da tela */
function exibirAvisoGlobal(texto, de) {
    const banner = document.createElement('div');
    banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[999] bg-red-600 text-white px-6 py-3 rounded-sm shadow-[0_0_30px_rgba(239,68,68,0.5)] flex items-center gap-4 animate-[fadeIn_0.3s_ease-out] border border-red-400/30 max-w-xl w-full mx-4';

    const p     = document.createElement('p');
    p.className = 'text-sm font-bold flex-1';

    const label = document.createElement('span');
    label.className   = 'block text-[10px] uppercase tracking-widest font-black opacity-70';
    label.textContent = 'Aviso de ' + de;

    const msg = document.createElement('span');
    msg.textContent = texto; // textContent: seguro contra XSS

    const icon     = document.createElement('i');
    icon.className = 'fas fa-broadcast-tower animate-pulse';

    const closeBtn      = document.createElement('button');
    closeBtn.innerHTML  = '<i class="fas fa-times"></i>';
    closeBtn.className  = 'text-white/70 hover:text-white ml-2';
    closeBtn.onclick    = () => banner.remove();

    p.appendChild(label);
    p.appendChild(msg);
    banner.appendChild(icon);
    banner.appendChild(p);
    banner.appendChild(closeBtn);
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 8000);
}

// ── Presença de usuários ──────────────────────────────────────────────────────
function monitorarUsuariosAtivos() {
    const canal = _supabase.channel('online-users', {
        config: { presence: { key: usuarioLogadoEmail } }
    });
    canal
        .on('presence', { event: 'sync' }, () => {
            const total = Object.keys(canal.presenceState()).length;
            const el    = document.getElementById('statUsuarios');
            if (el) el.innerText = total;
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await canal.track({ online_at: new Date().toISOString() });
            }
        });
}

// ══════════════════════════════════════════════════════════════════════════════
// PAINEL ADMINISTRATIVO
// ══════════════════════════════════════════════════════════════════════════════

/** Abre o painel admin e carrega os logs */
async function verLogs() {
    document.getElementById('modalLogs').classList.remove('hidden');
    trocarAba('logs');
    diagnosticarTabelaLogs();
}

function fecharModalLogs() {
    document.getElementById('modalLogs').classList.add('hidden');
    document.getElementById('avisoMigracao')?.remove();
}

function mostrarLoading(show) {
    const el = document.getElementById('logsLoading');
    if (!el) return;
    el.classList.toggle('hidden', !show);
    el.classList.toggle('flex', show);
}

/** Alterna entre as abas do painel admin */
function trocarAba(aba) {
    abaAtiva = aba;
    PAINEIS.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(ABA_MAP[aba])?.classList.remove('hidden');

    document.querySelectorAll('.admin-aba').forEach(btn => {
        btn.classList.remove('ativa');
        btn.classList.add('inativa');
    });

    const abaId = 'aba' + aba.charAt(0).toUpperCase() + aba.slice(1);
    const abaEl = document.getElementById(abaId);
    if (abaEl) { abaEl.classList.remove('inativa'); abaEl.classList.add('ativa'); }

    const carregadores = {
        logs: carregarLogs, ranking: carregarRanking, usuarios: carregarUsuarios,
        auditoria: carregarAuditoria, dados: () => {}, sistema: carregarSistema,
    };
    carregadores[aba]?.();
}

// ── Diagnóstico de tabela de logs ─────────────────────────────────────────────
async function diagnosticarTabelaLogs() {
    const { data, error } = await _supabase.from('logs_consulta').select('*').limit(1);
    if (error) return;
    const amostra = data?.[0] || {};
    const faltando = [
        !('usuario'   in amostra) && '"usuario" (text)',
        !('pagina'    in amostra) && '"pagina" (text)',
        !('data_hora' in amostra) && '"data_hora" (timestamptz)',
    ].filter(Boolean).join(', ');
    if (faltando) mostrarAvisoMigracaoLogs(faltando);
}

function mostrarAvisoMigracaoLogs(colunasFaltando) {
    if (document.getElementById('avisoMigracao')) return;
    const aviso = document.createElement('div');
    aviso.id = 'avisoMigracao';
    aviso.className = 'mx-6 mt-4 p-4 bg-amber-500/10 border border-amber-500/40 rounded-sm text-[11px] font-ip shrink-0';
    aviso.innerHTML = `
        <p class="text-amber-400 font-black uppercase tracking-widest mb-2">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            Colunas faltando em <span class="text-white">logs_consulta</span>
        </p>
        <div class="bg-black/60 border border-white/10 rounded-sm p-3 text-emerald-400 leading-relaxed select-all cursor-text font-ip text-xs">
ALTER TABLE logs_consulta<br>&nbsp;&nbsp;ADD COLUMN IF NOT EXISTS usuario TEXT,<br>&nbsp;&nbsp;ADD COLUMN IF NOT EXISTS pagina TEXT,<br>&nbsp;&nbsp;ADD COLUMN IF NOT EXISTS data_hora TIMESTAMPTZ DEFAULT now();
        </div>
        <p class="text-slate-600 mt-2">Faltando: <span class="text-amber-400">${colunasFaltando}</span></p>`;
    document.querySelector('#modalLogs .flex.border-b')?.insertAdjacentElement('afterend', aviso);
}

// ── ABA: Logs ─────────────────────────────────────────────────────────────────
async function carregarLogs() {
    const tabela = document.getElementById('tabelaLogs');
    tabela.innerHTML = '';
    mostrarLoading(true);
    const { data: logs, error } = await _supabase
        .from('logs_consulta').select('*')
        .order('data_hora', { ascending: false }).limit(50);
    mostrarLoading(false);
    if (error) {
        tabela.innerHTML = `<tr><td colspan="4" class="text-center text-red-400 py-6 font-ip text-xs">Erro: ${error.message}</td></tr>`;
        return;
    }
    if (!logs?.length) {
        tabela.innerHTML = `<tr><td colspan="4" class="text-center text-slate-500 py-6 font-ip text-xs">Nenhum log encontrado.</td></tr>`;
        return;
    }
    tabela.innerHTML = logs.map(l => `
        <tr class="border-b border-white/5 hover:bg-white/3 transition-colors">
            <td class="py-3 px-4 font-ip text-[11px] text-slate-400">${new Date(l.data_hora).toLocaleString('pt-BR')}</td>
            <td class="py-3 px-4 font-ip text-[11px] text-white font-bold">${l.termo_buscado || '---'}</td>
            <td class="py-3 px-4 font-ip text-[11px] text-slate-400">${(l.usuario||'---').split('@')[0]}</td>
            <td class="py-3 px-4"><span class="text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded-sm border ${l.pagina==='clientes'?'text-red-400 border-red-500/30 bg-red-500/10':'text-blue-400 border-blue-500/30 bg-blue-500/10'}">${l.pagina||'N/A'}</span></td>
        </tr>`).join('');
}

// ── ABA: Ranking ──────────────────────────────────────────────────────────────
async function carregarRanking() {
    const container = document.getElementById('conteudoRanking');
    container.innerHTML = '';
    mostrarLoading(true);
    const { data: logs, error } = await _supabase.from('logs_consulta').select('usuario, data_hora');
    mostrarLoading(false);
    if (error || !logs?.length) {
        container.innerHTML = `<p class="text-center text-slate-500 font-ip text-xs py-12">Nenhum dado disponível.</p>`;
        return;
    }

    const mapa = {};
    logs.forEach(l => {
        const u = l.usuario || 'desconhecido';
        if (!mapa[u]) mapa[u] = { total: 0, ultima: l.data_hora };
        mapa[u].total++;
        if (l.data_hora > mapa[u].ultima) mapa[u].ultima = l.data_hora;
    });
    const ranking  = Object.entries(mapa).map(([email,v])=>({email,...v})).sort((a,b)=>b.total-a.total);
    const maxTotal = ranking[0]?.total || 1;
    const coresBarra = [
        'bg-gradient-to-r from-yellow-500 to-yellow-400',
        'bg-gradient-to-r from-slate-400 to-slate-300',
        'bg-gradient-to-r from-orange-700 to-orange-500'
    ];
    const medalhas = ['🥇','🥈','🥉'];

    container.innerHTML = `
        <div class="grid grid-cols-2 gap-4 mb-8">
            <div class="bg-black/40 border border-white/5 rounded-sm p-4 flex items-center gap-4">
                <i class="fas fa-search text-red-500 text-xl"></i>
                <div><p class="text-[10px] uppercase text-slate-500 font-black tracking-widest">Total de Buscas</p>
                <p class="text-3xl font-black font-ip text-white">${logs.length}</p></div>
            </div>
            <div class="bg-black/40 border border-white/5 rounded-sm p-4 flex items-center gap-4">
                <i class="fas fa-users text-blue-400 text-xl"></i>
                <div><p class="text-[10px] uppercase text-slate-500 font-black tracking-widest">Usuários Ativos</p>
                <p class="text-3xl font-black font-ip text-white">${ranking.length}</p></div>
            </div>
        </div>
        <p class="text-[10px] font-black tracking-widest uppercase text-slate-500 mb-3"><i class="fas fa-list mr-2 text-slate-600"></i>Classificação Geral</p>
        <div class="space-y-3">
            ${ranking.map((u,i)=>`
            <div class="bg-black/30 border border-white/5 rounded-sm p-4 hover:border-white/10 transition-colors">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-3">
                        <span class="font-ip text-xs text-slate-500 w-6 text-right">#${i+1}</span>
                        <span class="text-[1.5em]">${medalhas[i]||''}</span>
                        <span class="text-sm font-black text-white uppercase">${u.email.split('@')[0]}</span>
                        ${i===0?'<span class="text-[10px] font-black text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 rounded-sm tracking-widest uppercase">TOP</span>':''}
                    </div>
                    <div class="text-right"><span class="font-ip text-lg font-black text-white">${u.total}</span><span class="text-[10px] text-slate-500 ml-1">buscas</span></div>
                </div>
                <div class="w-full bg-white/5 rounded-sm h-1.5 overflow-hidden">
                    <div class="${i<3?coresBarra[i]:'bg-gradient-to-r from-slate-700 to-slate-600'} h-full rounded-sm" style="width:${Math.round((u.total/maxTotal)*100)}%"></div>
                </div>
                <p class="text-[10px] text-slate-600 font-ip mt-1.5">Última atividade: ${new Date(u.ultima).toLocaleDateString('pt-BR')}</p>
            </div>`).join('')}
        </div>`;
}

// ── ABA: Usuários ─────────────────────────────────────────────────────────────
async function carregarUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    lista.innerHTML = '<p class="text-slate-600 font-ip text-xs py-4 text-center"><i class="fas fa-sync-alt animate-spin mr-2"></i>Carregando...</p>';
    const { data, error } = await _supabase.from('logs_consulta').select('usuario').not('usuario','is',null);
    if (error || !data?.length) {
        lista.innerHTML = `<div class="bg-black/40 border border-amber-500/20 rounded-sm p-4 text-[11px] font-ip text-amber-400"><i class="fas fa-info-circle mr-2"></i>Usuários ativos aparecem aqui conforme realizam buscas. Para gerenciar contas, acesse o <strong>Supabase → Authentication → Users</strong>.</div>`;
        return;
    }
    const mapa = {};
    data.forEach(r => { const u = r.usuario; if(u) mapa[u] = (mapa[u]||0)+1; });
    const usuarios = Object.entries(mapa).sort((a,b)=>b[1]-a[1]);
    lista.innerHTML = usuarios.map(([email, buscas]) => `
        <div class="flex items-center justify-between bg-black/30 border border-white/5 rounded-sm px-4 py-3 hover:border-white/10 transition-colors">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-sm bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center border border-white/5">
                    <span class="text-xs font-black text-slate-300 uppercase">${email[0]}</span>
                </div>
                <div>
                    <p class="text-sm font-black text-white">${email.split('@')[0]}</p>
                    <p class="font-ip text-[10px] text-slate-500">${email}</p>
                </div>
                ${isAdminEmail(email) ? '<span class="text-[10px] font-black text-red-400 border border-red-500/30 bg-red-500/10 px-2 py-0.5 rounded-sm tracking-widest uppercase">Admin</span>' : ''}
            </div>
            <div class="text-right"><p class="font-ip text-sm font-black text-white">${buscas}</p><p class="text-[10px] text-slate-500">buscas</p></div>
        </div>`).join('');
}

// ── ABA: Auditoria ────────────────────────────────────────────────────────────
async function carregarAuditoria() {
    const tbody = document.getElementById('tabelaAuditoria');
    tbody.innerHTML = '';
    mostrarLoading(true);
    const { data, error } = await _supabase.from('auditoria').select('*').order('criado_em', { ascending: false }).limit(100);
    mostrarLoading(false);
    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 px-4 font-ip text-xs text-amber-400">
            <i class="fas fa-info-circle mr-2"></i>Tabela "auditoria" não encontrada. Crie-a no Supabase:<br><br>
            <code class="block bg-black/60 p-3 rounded-sm text-emerald-400 mt-2 select-all font-ip text-xs">
CREATE TABLE auditoria (id BIGSERIAL PRIMARY KEY, acao TEXT, tabela TEXT, registro_nome TEXT, usuario TEXT, criado_em TIMESTAMPTZ DEFAULT now());
            </code>
        </td></tr>`;
        ['statEdicoes','statInsercoes','statAtualizacoes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        return;
    }
    document.getElementById('statEdicoes').textContent      = data?.length || 0;
    document.getElementById('statInsercoes').textContent    = data?.filter(r=>r.acao==='INSERT').length || 0;
    document.getElementById('statAtualizacoes').textContent = data?.filter(r=>r.acao==='UPDATE').length || 0;
    if (!data?.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-slate-500 py-6 font-ip text-xs">Nenhuma edição registrada.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(r => `
        <tr class="border-b border-white/5 hover:bg-white/3 transition-colors">
            <td class="py-3 px-4 font-ip text-[11px] text-slate-400">${new Date(r.criado_em).toLocaleString('pt-BR')}</td>
            <td class="py-3 px-4"><span class="text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded-sm border ${r.acao==='INSERT'?'text-emerald-400 border-emerald-500/30 bg-emerald-500/10':'text-amber-400 border-amber-500/30 bg-amber-500/10'}">${r.acao||'—'}</span></td>
            <td class="py-3 px-4 font-ip text-[11px] text-white">${r.registro_nome||'—'}</td>
            <td class="py-3 px-4 font-ip text-[11px] text-slate-400">${(r.usuario||'—').split('@')[0]}</td>
        </tr>`).join('');
}

// ── ABA: Dados — Exportar CSV ─────────────────────────────────────────────────
async function exportarCSV(tabela) {
    const { data, error } = await _supabase.from(tabela).select('*').order('nome');
    if (error || !data?.length) { alert('Nenhum dado para exportar.'); return; }
    const cols   = Object.keys(data[0]);
    const linhas = [
        cols.join(','),
        ...data.map(r => cols.map(c => `"${(r[c]??'').toString().replace(/"/g,'""')}"`).join(','))
    ];
    const blob = new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${tabela}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── ABA: Dados — Importar CSV ─────────────────────────────────────────────────
function preVisualizarCSV() {
    const file = document.getElementById('inputCSV').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const linhas  = e.target.result.trim().split('\n');
        const headers = linhas[0].split(',').map(h => h.trim().replace(/"/g,''));
        dadosCSVPreview = linhas.slice(1).map(linha => {
            const vals = linha.split(',').map(v => v.trim().replace(/^"|"$/g,''));
            const obj  = {};
            headers.forEach((h, i) => obj[h] = vals[i] || '');
            return obj;
        }).filter(r => Object.values(r).some(v => v));

        document.getElementById('previewInfo').textContent     = dadosCSVPreview.length + ' registros encontrados';
        document.getElementById('previewHeader').innerHTML     = headers.map(h=>`<th class="py-2 px-3 text-[10px] font-black tracking-widest uppercase text-slate-500">${h}</th>`).join('');
        document.getElementById('previewBody').innerHTML       = dadosCSVPreview.slice(0,5).map(r=>`<tr class="border-b border-white/5">${headers.map(h=>`<td class="py-2 px-3 text-white text-xs font-ip">${r[h]||'—'}</td>`).join('')}</tr>`).join('')
            + (dadosCSVPreview.length>5 ? `<tr><td colspan="${headers.length}" class="py-2 px-3 text-slate-500 text-xs font-ip">... e mais ${dadosCSVPreview.length-5} registros</td></tr>` : '');
        document.getElementById('previewCSV').classList.remove('hidden');
        document.getElementById('resultadoImportacao').classList.add('hidden');
    };
    reader.readAsText(file);
}

async function confirmarImportacao() {
    if (!dadosCSVPreview.length) return;
    const tabela  = document.getElementById('importarModulo').value;
    const res     = document.getElementById('resultadoImportacao');
    const payload = dadosCSVPreview.map(r => ({ ...r, em_manutencao: false }));
    const { error } = await _supabase.from(tabela).insert(payload);
    res.classList.remove('hidden');
    if (error) {
        res.className = 'mt-3 text-[11px] font-ip px-4 py-3 rounded-sm border text-red-400 border-red-500/30 bg-red-500/10';
        res.textContent = 'Erro: ' + error.message;
    } else {
        res.className = 'mt-3 text-[11px] font-ip px-4 py-3 rounded-sm border text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
        res.textContent = '✓ ' + dadosCSVPreview.length + ' registros importados com sucesso!';
        await registrarAuditoria('INSERT', tabela, `Importação CSV (${dadosCSVPreview.length} registros)`);
        dadosCSVPreview = [];
        document.getElementById('previewCSV').classList.add('hidden');
        buscarNoBanco();
    }
}

// ── ABA: Dados — Detectar Duplicatas ─────────────────────────────────────────
async function detectarDuplicatas() {
    const container = document.getElementById('resultadoDuplicatas');
    container.innerHTML = '<p class="text-slate-500 font-ip text-xs"><i class="fas fa-sync-alt animate-spin mr-2"></i>Analisando...</p>';

    const [{ data: clientes }, { data: mikrotik }] = await Promise.all([
        _supabase.from('clientes').select('id, nome, ip_fortigate, numero_contrato'),
        _supabase.from('mikrotik').select('id, nome, ip_mikrotik, numero_contrato'),
    ]);

    const duplicatas = [];
    const mapaIp = {};
    (clientes||[]).forEach(c => {
        if (!c.ip_fortigate) return;
        if (mapaIp[c.ip_fortigate]) duplicatas.push({ tipo: 'IP Fortigate duplicado', valor: c.ip_fortigate, nomes: [mapaIp[c.ip_fortigate], c.nome] });
        else mapaIp[c.ip_fortigate] = c.nome;
    });
    const mapaCtr = {};
    [...(clientes||[]), ...(mikrotik||[])].forEach(c => {
        if (!c.numero_contrato) return;
        const key = c.numero_contrato.toUpperCase();
        if (mapaCtr[key]) duplicatas.push({ tipo: 'Contrato duplicado', valor: key, nomes: [mapaCtr[key], c.nome] });
        else mapaCtr[key] = c.nome;
    });

    if (!duplicatas.length) {
        container.innerHTML = '<div class="bg-emerald-500/10 border border-emerald-500/20 rounded-sm p-4 text-emerald-400 font-ip text-xs"><i class="fas fa-check-circle mr-2"></i>Nenhuma duplicata encontrada. Base de dados limpa.</div>';
        return;
    }
    container.innerHTML = duplicatas.map(d=>`
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-sm p-4">
            <p class="text-amber-400 font-black text-xs uppercase tracking-widest mb-1"><i class="fas fa-exclamation-triangle mr-2"></i>${d.tipo}</p>
            <p class="font-ip text-sm text-white">${d.valor}</p>
            <p class="text-slate-400 text-xs font-ip mt-1">Afeta: ${d.nomes.join(' · ')}</p>
        </div>`).join('');
}

// ── ABA: Sistema ──────────────────────────────────────────────────────────────
function carregarSistema() {
    const slider = document.getElementById('sliderNoc');
    if (slider) {
        slider.value = intervaloNoc / 1000;
        document.getElementById('valorNoc').textContent = (intervaloNoc/1000) + 's';
    }
    const verde   = document.getElementById('limiteVerde');
    const amarelo = document.getElementById('limiteAmarelo');
    if (verde)   verde.value   = limiteVerdePing;
    if (amarelo) amarelo.value = limiteAmareloPing;
}

function salvarIntervaloNoc() {
    const val    = parseInt(document.getElementById('sliderNoc').value);
    intervaloNoc = val * 1000;
    if (modoNocAtivo) {
        clearInterval(loopNoc);
        loopNoc = setInterval(() => {
            contagemStatus = { online: 0, offline: 0 };
            statusAnterior = {};
            listaAtual.forEach(c => { if (c.ip_fortigate) checarStatus(c.ip_fortigate, c.id); });
        }, intervaloNoc);
    }
    const el = document.getElementById('valorNoc');
    el.textContent = val + 's ✓';
    setTimeout(() => el.textContent = val + 's', 1500);
}

function salvarLimitesLatencia() {
    limiteVerdePing   = parseInt(document.getElementById('limiteVerde').value)   || 80;
    limiteAmareloPing = parseInt(document.getElementById('limiteAmarelo').value) || 150;
    const fb = document.getElementById('feedbackLatencia');
    fb.classList.remove('hidden');
    setTimeout(() => fb.classList.add('hidden'), 2000);
}

function limparHistoricoChat() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    msgs.innerHTML = '<div class="text-slate-500 text-center uppercase tracking-widest text-[9px] font-bold my-4 border-b border-white/5 pb-4">Histórico limpo pelo administrador</div>';
}

// ── Auditoria de ações ────────────────────────────────────────────────────────
/**
 * BUG CORRIGIDO: O original misturava await com .then() na mesma expressão,
 * fazendo o await resolver a Promise do .then(), não a do insert.
 * Erros podiam ser silenciosamente engolidos.
 * SOLUÇÃO: Usar apenas async/await sem .then() encadeado.
 */
async function registrarAuditoria(acao, tabela, nomeRegistro) {
    const { error } = await _supabase.from('auditoria').insert([{
        acao,
        tabela,
        registro_nome: nomeRegistro,
        usuario:       usuarioLogadoEmail,
        criado_em:     new Date().toISOString()
    }]);
    if (error) console.warn('[Auditoria] Falha ao registrar:', error.message);
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS DE UI
// ══════════════════════════════════════════════════════════════════════════════

/** Adiciona uma linha colorida na janela de logs de loading */
function adicionarLogCarregamento(texto, cor = 'text-emerald-500') {
    const container = document.getElementById('loadingLogs');
    const linha     = document.createElement('div');
    linha.className = `${cor} animate-[fadeInTerm_0.2s_ease-out]`;
    linha.innerHTML = `<span class="text-slate-600 mr-2">[${new Date().toLocaleTimeString()}]</span> ${texto}`;
    container.appendChild(linha);
    while (container.childNodes.length > 4) container.removeChild(container.firstChild);
}

/** Anima o terminal fictício decorativo do fundo */
function iniciarTerminalFicticio() {
    const bg = document.getElementById('terminal-bg');
    if (!bg) return;
    setInterval(() => {
        const line     = document.createElement('span');
        line.className = 'term-line';
        line.innerText = `[${new Date().toLocaleTimeString()}] ${logsTecnicos[Math.floor(Math.random() * logsTecnicos.length)]}`;
        bg.appendChild(line);
        if (bg.childNodes.length > 50) bg.removeChild(bg.childNodes[0]);
        bg.scrollTop = bg.scrollHeight;
    }, 600);
}

/** Scrolls smooth para o topo */
function voltarAoTopo() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Barra de progresso de scroll ─────────────────────────────────────────────
window.addEventListener('scroll', () => {
    const scrollTotal = document.documentElement.scrollHeight - window.innerHeight;
    const percentual  = scrollTotal > 0 ? (window.scrollY / scrollTotal) * 100 : 0;

    const barra = document.getElementById('scrollProgressBar');
    if (barra) barra.style.height = `${percentual}%`;

    const btn = document.getElementById('btnVoltarTopo');
    if (btn) {
        if (window.scrollY > 300) {
            btn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
            btn.classList.add('opacity-100', 'translate-y-0');
        } else {
            btn.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
            btn.classList.remove('opacity-100', 'translate-y-0');
        }
    }
});
