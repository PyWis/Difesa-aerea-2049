'use strict';
/* Parametri di gioco, gradi e tipi di aereo */
// ---------- Parametri (modificabili) ----------
const CFG = {
  startCredits: 2500,
  startRep: 90,             // reputazione iniziale (%)
  // livelli selezionabili per gli aerei di supporto (aerei attivi)
  reconLevels: [0, 1, 2, 5, 10, 20],
  reconRep: { 0: 0, 1: 1, 2: 2, 5: 3, 10: 4, 20: 5 }, // reputazione recuperata ogni giorno
  tankerLevels: [0, 1, 2, 5, 10, 20],
  tankerRepLoss: { 5: 2, 10: 3, 20: 4 },  // reputazione persa ogni giorno con questi rifornitori attivi
  // moltiplicatore del recupero di reputazione in base al livello attuale: sotto 50 triplo, da 50 a 90 doppio
  repRecovery: [{ below: 50, mult: 3 }, { below: 90, mult: 2 }],
  supportLockMin: 1440,     // dopo una modifica, ricognitori o rifornitori restano bloccati 24 ore
  medalChancePerPoint: 0.25, // probabilità di medaglia per ogni punto di reputazione oltre il 100% (max 1 al giorno)
  trainingEveryDays: 7,     // in media una missione di addestramento a settimana
  trainingWindowDays: 10,   // l'addestramento resta disponibile 10 giorni, poi scade
  trainingMedals: 1,        // medaglie assegnate dall'addestramento
  diffSpeed: 0.03,          // per ogni grado: +3% velocità delle minacce
  diffWin: 0.02,            // per ogni grado: −2% probabilità di vittoria in combattimento
  diffAttack: 0.01,         // per ogni grado: +1% probabilità oraria di attacco
  repLossCooldown: 50,      // reputazione persa quando una minaccia completa l'attacco a una base
  reconPerDay: 50,          // crediti / giorno di gioco
  tankerPerDay: 20,         // crediti / giorno di gioco
  reconSignalDays: 3,       // media di giorni di volo tra due segnalazioni (evento casuale)
  threatSpeed: 1000,        // km/h
  threatTurnChance: 0.03,   // probabilità di cambio direzione ogni ora
  upgradeStep: 100,         // km/h guadagnati per ogni giorno di potenziamento
  baseAutonomyH: 8, tankerBonusH: 4, // ore di autonomia in più per ogni rifornitore attivo
  winChance: 0.8,
  interceptRadiusKm: 15,
  killReward: 1000,         // ricompensa per minaccia eliminata
  rebuildCost: 500,         // ricostruzione dopo un bombardamento
  tacticalReward: 2000,     // premio dell'aereo tattico
  attackAfterH: 12,         // ore di volo prima che una minaccia possa attaccare
  attackChance: 0.10,       // probabilità oraria di attacco dopo attackAfterH
  cooldownMinDays: 3, cooldownMaxDays: 7,
  huntRangeKm: 1000,        // distanza entro cui una minaccia può puntare un bombardiere/tattico
  huntChance: 0.25,         // probabilità oraria che lo faccia
  strikeDefense: 0.2,       // probabilità che un bombardiere/tattico senza scorta abbatta chi lo attacca
  escortRangeKm: 1000,      // la scorta ingaggia minacce entro questa distanza dall'aereo scortato
  slotCost: { fighter: 5000, bomber: 10000 },  // posto aggiuntivo acquistabile
  slotMax: { fighter: 12, bomber: 5 },
  startFighters: 5,         // caccia già in hangar all'inizio della partita
  patrolSize: 3,            // caccia necessari per formare una pattuglia
  patrolJoinSpeed: 3,       // moltiplicatore di velocità dei caccia che raggiungono il capo pattuglia
  patrolJoinKm: 25,         // distanza entro cui un caccia è unito alla pattuglia
  patrolReturnSpeed: 2,     // moltiplicatore di velocità al rientro dopo la vittoria
  tacticalBonusAtBombers: 5, // con 5 bombardieri si sblocca il secondo aereo tattico
  killsForUpgrade: 3,       // abbattimenti di un caccia per un potenziamento istantaneo
  winsForUpgrade: 5,        // missioni vinte da bombardiere/tattico per un potenziamento istantaneo
  gear: {                   // dotazioni dei caccia: una sola per volta, si consumano all'uso
    shield:  { label: 'Difesa jet',      cost: 500 },
    missile: { label: 'Missile fotonico', cost: 500, rangeKm: 200, chance: 0.5 },
    sonic:   { label: 'Motore sonico',   cost: 500, durationMin: 1440 },
  },
  lossPenalty: { fighter: 1000, bomber: 2000, tactical: 3000 }, // penale per aereo abbattuto
  repairMin: 1440,          // bombardiere/tattico abbattuto: di nuovo disponibile dopo 1 giorno
  emergencyAmount: 2500,    // prestito fornitori di emergenza, automatico se i crediti vanno sotto zero
  emergencyInstallment: 800, emergencyInstallments: 4,
  loanAmount: 5000,         // prestito ONU
  loanInstallment: 2000,    // rata pagata a ogni mezzanotte
  loanInstallments: 3,      // numero di rate
  loanMax: 2, loanWindowDays: 7, // massimo 2 prestiti in 7 giorni
  sites: 10, minContinents: 4,
  turboSpeed: 3600,         // 1 ora di gioco al secondo
  turboMaxMin: 300,         // si disattiva da sola dopo 5 ore di gioco
  leadRecalcMin: 15,        // ricalcolo del punto d'incontro (minuti di gioco)
  // basi secondarie: si acquistano in ordine, ognuna con una nuova scelta tra 10 località casuali
  bases: [
    { kind: 'research', label: 'Base ricerca',          cost: 10000,  short: 'seconda base' },
    { kind: 'missile',  label: 'Base missilistica',     cost: 25000,  short: 'terza base' },
    { kind: 'training', label: 'Base di addestramento', cost: 50000,  short: 'quarta base' },
    { kind: 'major',    label: 'Base maggiore',         cost: 100000, short: 'quinta base' },
  ],
  researchKill: [1, 10],    // % di ricerca per ogni minaccia abbattuta in volo (casuale)
  researchBomb: 12,         // % per ogni bombardamento
  researchTactical: 20,     // % per ogni missione tattica (non di addestramento)
  artifactCost: 2500,       // crediti per attivare un artefatto
  artifactResearch: 100,    // % di ricerca consumata da ogni attivazione
  artifactCooldownDays: 3,  // lo stesso artefatto non si riattiva prima di 3 giorni
  art: {
    researchBoost: 300,     // ARTEFATTO RICERCA: % di ricerca aggiunta
    missileSpeed: 4000, missileDays: 3, missileRadiusKm: 15,
    quantumKills: 2,
    recallHours: 8,
    quakeMinDays: 2, quakeMaxDays: 5,
    pilotDays: 3, pilotBonuses: 2,
    techDays: 3, techBonus: 300,
    flightDays: 3, flightEveryH: 3, flightRadiusKm: 600, flightLifeH: 24,
    trainDays: 15,
    monumentDays: 3, monumentUp: 50, monumentDown: 20,
  },
  // dichiarazione di emergenza: solo su richiesta, mai automatica
  declaration: { days: 5, perDay: 2000, repPerDay: 10, maxCredits: 1000 },
  // caserma: piloti, accademia, gradi ed equipaggi
  pilots: {
    startSergeants: 10, startMarshals: 10, startLieutenants: 2,   // piloti disponibili a inizio partita
    crewRequired: true,                       // un aereo decolla solo con 1° e 2° pilota assegnati
    cadetsPerDay: 1,                          // nuovi cadetti a ogni mezzanotte
    deathOnLoss: true,                        // un aereo perso (abbattuto o senza carburante) porta con sé l'equipaggio
    maxWin: 0.95,                             // tetto della probabilità di vittoria con i bonus dei piloti
    patrolCaptainSpeed: 0.25,                 // pattuglia comandata da un Capitano di Volo: velocità +25% a tutti
    // grado minimo per ogni posto: 1° pilota (comandante) e 2° pilota
    slotMinRank: { fighter: { first: 5, second: 2 }, bomber: { first: 6, second: 4 }, tactical: { first: 6, second: 4 } },
    // academyDays: giorni in accademia; days/missions: giorni e missioni nel grado per la promozione;
    // win: bonus alla probabilità di vincere uno scontro; strikeSpeed: km/h in più su bombardieri e tattici
    ranks: [
      { name: 'Cadetto',              short: 'Cdt.',     academyDays: 3 },
      { name: 'Cadetto scelto',       short: 'Cdt. sc.', academyDays: 2 },
      { name: 'Sergente',             short: 'Sgt.',     days: 2, missions: 3 },
      { name: 'Sergente Scelto',      short: 'Sgt. sc.', days: 4, missions: 7,  win: 0.03 },
      { name: 'Sergente Capo',        short: 'Sgt. C.',  days: 7, missions: 10, win: 0.05 },
      { name: 'Maresciallo di Volo',  short: 'Mar.',     missions: 20, win: 0.10, strikeSpeed: 200 },
      { name: 'Luogotenente di Volo', short: 'Ltn.',     missions: 50, win: 0.10, strikeSpeed: 200 },
      { name: 'Capitano di Volo',     short: 'Cap.',     win: 0.10, strikeSpeed: 200, captain: true },
    ],
  },
  // debito: la bancarotta scatta oltre -limit crediti oppure dopo `hours` ore di gioco consecutive in negativo
  debt: { limit: 250, hours: 6 },
  // operazioni speciali (scheda Logistica)
  ops: {
    onu:       { label: 'Ricognitori ONU',        cost: 5000,  n: 50,  days: 3, repBonus: 10, medals: 1, cooldownDays: 7 },
    coalition: { label: 'Ricognitori Coalizione', cost: 20000, n: 100, days: 1, repBonus: 10, medals: 1, cooldownDays: 7 },
    fighters:  { label: 'Caccia-Ricognitori',     cost: 0,     n: 25,  days: 1, holdH: 6,    cooldownDays: 1 },
    tactical:  { label: 'Mappa Tattica',          cost: 0,     speedMult: 2, repNow: -10, repLater: 20, laterDays: 1 },
  },
  majorRepBonus: 10,        // base maggiore: reputazione guadagnata all'acquisto
};
const R_EARTH = 6371;
// Gradi: si sale con le medaglie; a 100 il gioco è vinto. Ogni grado rende le minacce un po' più pericolose.
const MEDALS_GOAL = 100;
const RANKS = [
  { at: 0, name: 'Maresciallo' }, { at: 5, name: 'Sottotenente' }, { at: 10, name: 'Tenente' },
  { at: 20, name: 'Capitano' }, { at: 40, name: 'Maggiore' }, { at: 65, name: 'Colonnello' },
  { at: 95, name: 'Generale' }, { at: MEDALS_GOAL, name: 'Generale Planetario' },
];
const rankIdx = m => RANKS.reduce((i, r, k) => m >= r.at ? k : i, 0);
// Ora 0 di gioco = 21 marzo 2049, 12:00
const START_MS = Date.UTC(2049, 2, 21, 12, 0, 0);
const DAY = 1440;

// ---------- Tipi di aereo da combattimento ----------
const TYPES = {
  fighter:  { label: 'Caccia',        prefix: 'C', max: 8, base: 1000, top: 2000, perHour: 5,  color: 'fighter' },
  bomber:   { label: 'Bombardiere',   prefix: 'B', max: 3, base: 300,  top: 700,  perHour: 10, color: 'bomber' },
  tactical: { label: 'Aereo tattico', prefix: 'A', max: 1, base: 300,  top: 700,  perHour: 15, color: 'tactical' },
};
const isStrike = p => p.type === 'bomber' || p.type === 'tactical';
const AIR_STATES = ['flight', 'escort', 'rtb'];
const isAir = p => AIR_STATES.includes(p.state);
