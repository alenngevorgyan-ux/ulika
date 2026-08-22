import { LEVERAGE_KINDS, type CaseAnalysis } from "../schemas";
import {
  ProviderHttpError,
  type CompletionRequest,
  type CompletionResult,
  type ResponseTelemetry,
  type Transport,
} from "../transport";

/**
 * Fixtures for every test in this module.
 *
 * The whole point: the engine, the graders and the harness are exercised end to
 * end without a single paid call. The fixture transport returns pre-written
 * responses shaped exactly like the provider's, including a usage block, so the
 * cost ledger is tested against realistic numbers rather than zeroes.
 */

const F = (id: string, text: string) => ({ id, text });
const reported = (value: string, ...ids: string[]) => ({ value, basis: "reported" as const, supportingFactIds: ids });
const inferred = (value: string, uncertainty: string) => ({ value, basis: "inferred" as const, supportingFactIds: [], uncertainty });
const unknownClaim = () => ({ value: "unknown", basis: "unknown" as const, supportingFactIds: [] });

/** All ten kinds, because the validator requires all ten. */
const lev = (
  kind: (typeof LEVERAGE_KINDS)[number],
  status: "present" | "absent" | "unknown",
  description: string
) => ({
  kind,
  status,
  description,
  basis: status === "present" ? "reported by the user" : "not established in the account",
  risk: status === "present" ? "Escalates the dispute if used early." : "",
  reversibility: (status === "present" ? "reversible" : "not_applicable") as
    | "reversible"
    | "not_applicable",
});

export const GOOD_ANALYSIS: CaseAnalysis = {
  language: "ru",
  jurisdiction: { country: "unknown" },
  frame: {
    // Always empty in V0 — nothing here can inspect a document.
    documentedFacts: [],
    reportedFacts: [
      F("f1", "Архитектуру писал пользователь."),
      F("f2", "Руководитель не упомянул его на презентации правлению."),
      F("f3", "Руководитель сказал, что в следующем квартале пользователя разгрузят."),
    ],
    reportedEvidenceAvailable: [
      { type: "commit_history", description: "История коммитов по проекту биллинга.", verificationStatus: "not_reviewed" },
      { type: "correspondence", description: "Переписка по архитектурным решениям.", verificationStatus: "not_reviewed" },
    ],
    interpretations: ["Пользователь считает, что вклад присвоен намеренно."],
    unknowns: ["Что именно говорилось на правлении.", "Формальный смысл слова «разгрузим»."],
    constraints: ["Прямой руководитель контролирует оценку и распределение задач."],
    stakes: "Карьерная траектория и участие в следующем цикле оценки.",
  },
  actors: {
    actors: [
      {
        label: "Пользователь",
        goals: [reported("Сохранить зону ответственности", "f1", "f3")],
        fears: [inferred("Быть отодвинутым тихо", "Прямо не сказано; вытекает из формулировки о разгрузке.")],
        resources: [reported("Письменные следы работы", "f1")],
        authority: reported("Нет формальной власти над решением", "f3"),
        dependencies: [reported("Оценка со стороны руководителя", "f3")],
        likelyReactions: [inferred("Эскалация через голову при бездействии", "Намерение высказано, но не осуществлено.")],
      },
      {
        label: "Руководитель Р.",
        goals: [reported("Выглядеть владельцем результата перед правлением", "f2")],
        fears: [inferred("Публичное оспаривание его версии", "Прямых данных нет; следует из его поведения на презентации.")],
        resources: [reported("Контроль распределения задач", "f3")],
        authority: reported("Решает загрузку и оценку", "f3"),
        dependencies: [inferred("Результаты команды, которые он показывает наверх", "Обычная структура, не подтверждённая рассказом.")],
        likelyReactions: [inferred("Оборонительная реакция на письменное обвинение", "Оценка, а не наблюдение.")],
      },
      {
        // Mentioned once, in passing. No invented psychology.
        label: "Директор",
        goals: [unknownClaim()],
        fears: [unknownClaim()],
        resources: [unknownClaim()],
        authority: unknownClaim(),
        dependencies: [unknownClaim()],
        likelyReactions: [unknownClaim()],
      },
    ],
  },
  hypotheses: {
    hypotheses: [
      {
        claim: "Присвоение результата ради позиции перед правлением.",
        evidenceFor: ["Ни одного упоминания на презентации"],
        evidenceAgainst: ["Формат мог не предполагать имён"],
        confidence: "medium",
        discriminatingTest: "Спросить письменно, как будет оформлено авторство в квартальном отчёте.",
      },
      {
        claim: "Пользователя готовят к другой роли, и «разгрузим» — не наказание.",
        evidenceFor: ["Формулировка про следующий квартал"],
        evidenceAgainst: ["Сокращение числа встреч"],
        confidence: "low",
        discriminatingTest: "Попросить письменно зафиксировать цели на квартал.",
      },
      {
        claim: "Версия пользователя неполна: решение принималось выше руководителя.",
        evidenceFor: ["Пользователь не знает, что говорилось на правлении"],
        evidenceAgainst: ["Изменения начались сразу после презентации"],
        confidence: "low",
        discriminatingTest: "Уточнить у смежного участника, обсуждалась ли команда на правлении.",
      },
    ],
  },
  leverage: {
    points: [
      lev("informational", "present", "История коммитов и переписка фиксируют авторство."),
      lev("procedural", "present", "Цикл оценки требует письменных целей."),
      lev("reputational", "unknown", "Как директор оценивает вклад — неизвестно."),
      lev("temporal", "present", "Квартал ещё не начался, распределение не закреплено."),
      lev("coalition", "unknown", "Смежные заказчики не опрошены."),
      lev("economic", "absent", "Прямых финансовых рычагов нет."),
      lev("status", "absent", "Формального статуса владельца компонента нет."),
      lev("emotional", "absent", "Использовать личные отношения не предполагается."),
      lev("batna", "absent", "Внешнего предложения нет."),
      lev("exit", "absent", "Уход без альтернативы позицию не улучшает."),
    ],
  },
  strategies: {
    strategies: [
      { kind: "low_risk", summary: "Зафиксировать цели письменно.", firstMove: "Попросить письменные цели на квартал.", risk: "green", reversible: true, costIfItFails: "Потеря недели." },
      { kind: "fast", summary: "Уточнить статус до распределения задач.", firstMove: "Короткое письмо о роли в следующем квартале.", risk: "yellow", reversible: true, costIfItFails: "Раннее обозначение позиции." },
      { kind: "strong_negotiation", summary: "Связать участие с результатом, который он показывает наверх.", firstMove: "Обозначить, какие компоненты требуют владельца.", risk: "yellow", reversible: true, costIfItFails: "Отказ в явной форме." },
      {
        kind: "unconventional",
        summary: "Сделать авторство побочным продуктом процесса.",
        firstMove: "Предложить формат квартального технического отчёта с владельцами компонентов.",
        risk: "yellow", reversible: true, costIfItFails: "Предложение отклонят.",
        // The one genuine conversion in this fixture. Every other strategy has
        // redirect absent, which is what the field is supposed to mean.
        redirect: { category: "reputational_pressure", reason: "Обход руководителя как рычаг давления", preservedObjective: "Зафиксировать авторство" },
      },
      { kind: "exit_contingency", summary: "Подготовить альтернативу без объявления.", firstMove: "Обновить резюме и собрать рекомендателей вне прямой линии.", risk: "green", reversible: true, costIfItFails: "Потраченное время." },
    ],
  },
  countermoves: {
    countermoves: [
      { againstStrategy: "low_risk", likelyResponse: "Согласится и даст размытые цели.", denial: "«Никто ничего не присваивал».", retaliation: "Дальнейшее сокращение задач.", evidenceDestruction: "Маловероятно.", escalation: "Перевод разговора на личные качества.", worstPlausibleOutcome: "Формальные цели без содержания." },
      { againstStrategy: "strong_negotiation", likelyResponse: "Отложит решение.", denial: "«Решаю не я».", retaliation: "Назначит владельцем другого.", evidenceDestruction: "Нет.", escalation: "Привлечёт HR.", worstPlausibleOutcome: "Публичная фиксация конфликта." },
      { againstStrategy: "unconventional", likelyResponse: "Примет формат, переопределит владельцев.", denial: "Не потребуется.", retaliation: "Нет прямой.", evidenceDestruction: "Нет.", escalation: "Нет.", worstPlausibleOutcome: "Формат принят, авторство размыто." },
    ],
  },
  plan: {
    conclusion: "Из наблюдаемого следует изменение роли, но причина неизвестна, и присвоение — пока интерпретация, а не факт.",
    missingInformation: ["Что обсуждалось на правлении", "Формальный смысл слова «разгрузим»"],
    recommendedMove: "Запросить письменные цели на квартал и зафиксировать зоны владения до распределения задач.",
    exactWords: [
      { role: "opening", purpose: "Открыть разговор без обвинения", text: "Хочу зафиксировать цели на квартал письменно, чтобы мы одинаково понимали приоритеты.", useWhen: "В первом разговоре один на один.", doNotUseWhen: "После того как решение уже объявлено публично." },
      { role: "boundary", purpose: "Обозначить границу при уклонении", text: "По биллингу я вёл архитектуру — мне важно понимать, остаётся ли эта зона за мной в следующем квартале.", useWhen: "Если первый вопрос остался без содержательного ответа.", doNotUseWhen: "Если ответ уже дан письменно." },
      { role: "escalation", purpose: "Назвать следующий процедурный шаг", text: "Если зафиксировать это в целях не получается, я попрошу HR помочь оформить зоны ответственности на квартал.", useWhen: "После второго уклонения.", doNotUseWhen: "Пока не было ни одной письменной попытки." },
    ],
    whatNotToSay: ["Вы присвоили мою работу.", "Я всё расскажу директору."],
    ifThenBranches: [
      { if: "Руководитель соглашается и фиксирует цели письменно", then: "Закрепить зоны владения в том же документе", rationale: "Письменная фиксация — единственный доступный рычаг", stopCondition: "Цели подписаны обеими сторонами" },
      { if: "Отвечает уклончиво или тянет", then: "Повторить запрос письмом с указанием срока", rationale: "Уклонение в переписке само становится записью", stopCondition: "Второе уклонение подряд" },
      { if: "Реагирует агрессивно или обвиняет в неподчинении", then: "Прекратить обсуждение и перевести вопрос в HR как вопрос оформления ролей", rationale: "Дальнейший разговор один на один ухудшает позицию", stopCondition: "Прозвучало слово «неподчинение»" },
    ],
    stopSignals: ["Отказ фиксировать что-либо письменно", "Приглашение HR без повестки"],
    fallbackPlan: "Собрать рекомендателей вне прямой линии подчинения и выйти на рынок до цикла оценки.",
    risk: "yellow",
    riskAssessment: {
      jurisdictionKnown: false,
      requestedBenefit: "Сохранить зону ответственности и признание авторства.",
      relevanceToDispute: "direct",
      informationSource: "user_owned",
      proceduralChannel: "formal",
      reversibility: "reversible",
      retaliationRisk: "medium",
      legalUncertainty: "Юрисдикция из рассказа не следует; вопрос о правах на результат без неё не решается.",
    },
    uncertainty: "Причина изменения роли неизвестна; правдоподобны как минимум три объяснения.",
  },
};

/** Rendered form, used to grade the engine on the same axes as free prose. */
export const GOOD_RENDER = [
  GOOD_ANALYSIS.plan.conclusion,
  "Конкурирующие версии:",
  ...GOOD_ANALYSIS.hypotheses.hypotheses.map((h) => `- ${h.claim} (${h.confidence}%). Как проверить: ${h.discriminatingTest}`),
  "Рычаги: письменная история коммитов, цикл оценки, срок до начала квартала.",
  `Рекомендуемый ход: ${GOOD_ANALYSIS.plan.recommendedMove}`,
  "Точные слова:",
  ...GOOD_ANALYSIS.plan.exactWords.map((p) => `- (${p.role}) «${p.text}»`),
  "Если/то:",
  ...GOOD_ANALYSIS.plan.ifThenBranches.map((b) => `- ${b.if} → ${b.then}`),
  "Что сделает другая сторона: согласится и даст размытые цели; может назначить владельцем другого.",
  "Сигналы остановиться: отказ фиксировать письменно; приглашение HR без повестки.",
  `Запасной план: ${GOOD_ANALYSIS.plan.fallbackPlan}`,
].join("\n");

/** The same analysis in English, to prove the graders are language-neutral. */
export const GOOD_ANALYSIS_EN: CaseAnalysis = {
  ...GOOD_ANALYSIS,
  language: "en",
  actors: {
    actors: [
      {
        label: "User",
        goals: [reported("Keep the area of responsibility", "f1", "f3")],
        fears: [inferred("Being sidelined quietly", "Not stated; follows from the wording about unloading.")],
        resources: [reported("Written traces of the work", "f1")],
        authority: reported("No formal power over the decision", "f3"),
        dependencies: [reported("The manager's review", "f3")],
        likelyReactions: [inferred("Escalation over his head if nothing moves", "Intention voiced but not acted on.")],
      },
      {
        label: "Manager R.",
        goals: [reported("To look like the owner of the result before the board", "f2")],
        fears: [inferred("Public challenge to his version", "No direct data; follows from his behaviour at the presentation.")],
        resources: [reported("Control over task allocation", "f3")],
        authority: reported("Decides workload and review", "f3"),
        dependencies: [inferred("The team's output that he shows upward", "Usual structure, not confirmed by the account.")],
        likelyReactions: [inferred("Defensive response to a written accusation", "An estimate, not an observation.")],
      },
      {
        label: "Director",
        goals: [unknownClaim()],
        fears: [unknownClaim()],
        resources: [unknownClaim()],
        authority: unknownClaim(),
        dependencies: [unknownClaim()],
        likelyReactions: [unknownClaim()],
      },
    ],
  },
  hypotheses: {
    hypotheses: [
      { claim: "Credit was appropriated to strengthen the manager's standing with the board.", evidenceFor: ["No mention at the presentation"], evidenceAgainst: ["The format may not have called for names"], confidence: "medium", discriminatingTest: "Ask in writing how authorship will be recorded in the quarterly report." },
      { claim: "The user is being moved to another role and 'unloading' is not a punishment.", evidenceFor: ["The wording about next quarter"], evidenceAgainst: ["Fewer meeting invitations"], confidence: "low", discriminatingTest: "Ask for the quarterly goals to be recorded in writing." },
      { claim: "The user's account is incomplete: the decision was made above the manager.", evidenceFor: ["The user does not know what was said at the board"], evidenceAgainst: ["Changes began right after the presentation"], confidence: "low", discriminatingTest: "Ask an adjacent participant whether the team was discussed at the board." },
    ],
  },
  leverage: {
    points: [
      lev("informational", "present", "Commit history and correspondence record the authorship."),
      lev("procedural", "present", "The review cycle requires written goals."),
      lev("reputational", "unknown", "How the director rates the contribution is unknown."),
      lev("temporal", "present", "The quarter has not started; assignments are not fixed."),
      lev("coalition", "unknown", "Adjacent stakeholders have not been asked."),
      lev("economic", "absent", "There is no direct financial leverage."),
      lev("status", "absent", "There is no formal component-owner title."),
      lev("emotional", "absent", "Personal relationships are not to be used here."),
      lev("batna", "absent", "There is no outside offer."),
      lev("exit", "absent", "Leaving without an alternative does not improve the position."),
    ],
  },
  strategies: {
    strategies: [
      { kind: "low_risk", summary: "Get the quarterly goals in writing.", firstMove: "Ask for written goals for the quarter.", risk: "green", reversible: true, costIfItFails: "A week lost." },
      { kind: "fast", summary: "Clarify the role before tasks are reassigned.", firstMove: "A short email about the role next quarter.", risk: "yellow", reversible: true, costIfItFails: "Showing your position early." },
      { kind: "strong_negotiation", summary: "Tie participation to the result he shows upward.", firstMove: "Name the components that need an owner.", risk: "yellow", reversible: true, costIfItFails: "An explicit refusal." },
      { kind: "unconventional", summary: "Make authorship a by-product of process.", firstMove: "Propose a quarterly technical report listing component owners.", risk: "yellow", reversible: true, costIfItFails: "The proposal is declined.", redirect: { category: "reputational_pressure", reason: "Going over the manager as leverage", preservedObjective: "Record authorship" } },
      { kind: "exit_contingency", summary: "Prepare an alternative without announcing it.", firstMove: "Update the CV and line up referees outside the direct line.", risk: "green", reversible: true, costIfItFails: "Time spent." },
    ],
  },
  countermoves: {
    countermoves: [
      { againstStrategy: "low_risk", likelyResponse: "Agrees and supplies vague goals.", denial: "Nobody appropriated anything.", retaliation: "Further reduction of tasks.", evidenceDestruction: "Unlikely.", escalation: "Turns the conversation to personal qualities.", worstPlausibleOutcome: "Formal goals with no substance." },
      { againstStrategy: "strong_negotiation", likelyResponse: "Defers the decision.", denial: "It is not my call.", retaliation: "Names someone else as owner.", evidenceDestruction: "None.", escalation: "Brings in HR.", worstPlausibleOutcome: "The conflict is put on record publicly." },
      { againstStrategy: "unconventional", likelyResponse: "Accepts the format, redefines the owners.", denial: "Not needed.", retaliation: "None direct.", evidenceDestruction: "None.", escalation: "None.", worstPlausibleOutcome: "Format adopted, authorship diluted." },
    ],
  },
  frame: {
    ...GOOD_ANALYSIS.frame,
    reportedEvidenceAvailable: [
      { type: "commit_history", description: "Commit history for the billing project.", verificationStatus: "not_reviewed" },
      { type: "correspondence", description: "Correspondence about architectural decisions.", verificationStatus: "not_reviewed" },
    ],
    constraints: ["The direct manager controls review and task allocation."],
    reportedFacts: [
      { id: "f1", text: "The user authored the architecture." },
      { id: "f2", text: "The manager did not mention them to the board." },
      { id: "f3", text: "The manager said the user will be unloaded next quarter." },
    ],
    interpretations: ["The user believes the contribution was deliberately appropriated."],
    unknowns: ["What was actually said at the board.", "What 'unloaded' means formally."],
    stakes: "Career trajectory and participation in the next review cycle.",
  },
  plan: {
    ...GOOD_ANALYSIS.plan,
    missingInformation: ["What was discussed at the board", "What 'unloading' means formally"],
    whatNotToSay: ["You took credit for my work.", "I will tell the director everything."],
    riskAssessment: {
      ...GOOD_ANALYSIS.plan.riskAssessment,
      requestedBenefit: "Keep the area of responsibility and recognition of authorship.",
      legalUncertainty: "The jurisdiction does not follow from the account; questions about rights to the work cannot be settled without it.",
    },
    conclusion: "The role is changing, but the reason is unknown, and appropriation is still an interpretation rather than a fact.",
    recommendedMove: "Ask for written quarterly goals and pin ownership before tasks are reassigned.",
    exactWords: [
      { role: "opening", purpose: "Open without accusing", text: "I would like the quarterly goals in writing so we share the same view of priorities.", useWhen: "In the first one-to-one.", doNotUseWhen: "After the decision has been announced publicly." },
      { role: "boundary", purpose: "Mark the boundary when evaded", text: "I led the billing architecture, and I need to know whether that area stays with me next quarter.", useWhen: "If the first question got no substantive answer.", doNotUseWhen: "If the answer already exists in writing." },
      { role: "escalation", purpose: "Name the next procedural step", text: "If this cannot be recorded in the goals, I will ask HR to help document responsibilities for the quarter.", useWhen: "After a second evasion.", doNotUseWhen: "Before any written attempt has been made." },
    ],
    ifThenBranches: [
      { if: "The manager agrees and records the goals", then: "Pin ownership in the same document", rationale: "A written record is the only available leverage", stopCondition: "Goals signed by both sides" },
      { if: "He answers vaguely or stalls", then: "Repeat the request in writing with a date", rationale: "Evasion in writing becomes a record itself", stopCondition: "A second evasion in a row" },
      { if: "He reacts aggressively or alleges insubordination", then: "Stop and move the question to HR as role documentation", rationale: "Continuing one-to-one worsens the position", stopCondition: "The word insubordination is used" },
    ],
    stopSignals: ["Refusal to record anything in writing", "An HR meeting with no agenda"],
    fallbackPlan: "Line up referees outside the direct reporting line and go to market before the review cycle.",
    uncertainty: "The reason for the role change is unknown; at least three explanations are plausible.",
  },
};

export const GOOD_RENDER_EN = [
  GOOD_ANALYSIS_EN.plan.conclusion,
  "Competing readings:",
  ...GOOD_ANALYSIS_EN.hypotheses.hypotheses.map((h) => `- ${h.claim} (${h.confidence}%).`),
  "Leverage: commit history, the review cycle, the window before the quarter starts.",
  `Recommended move: ${GOOD_ANALYSIS_EN.plan.recommendedMove}`,
  "Exact words:",
  ...GOOD_ANALYSIS_EN.plan.exactWords.map((p) => `- (${p.role}) «${p.text}»`),
  "If/then:",
  ...GOOD_ANALYSIS_EN.plan.ifThenBranches.map((b) => `- ${b.if} → ${b.then}`),
  "What the other side does: agrees and gives vague goals; may name someone else as owner.",
  "Stop signals: refusal to record anything; an HR meeting with no agenda.",
  `Fallback: ${GOOD_ANALYSIS_EN.plan.fallbackPlan}`,
].join("\n");

/** What a weak single-call answer looks like. Not a strawman — this is common. */
export const BANAL_BASELINE = `Понимаю, как это неприятно. В такой ситуации главное — не рубить сплеча.
Постарайтесь спокойно поговорить с руководителем и объяснить свои чувства. Возможно,
он не хотел вас обидеть. Если разговор не поможет, обратитесь к специалисту по
карьерному развитию или в HR. Удачи!`;

interface FixtureOptions {
  spy?: CompletionRequest[];
  /** Incremented on every request, so a test can prove a call did NOT happen. */
  callCount?: { n: number };
  extractReturnsGarbageFirst?: boolean;
  alwaysGarbage?: boolean;
  /** Structurally valid JSON that a validator must still refuse. */
  tooFewHypotheses?: boolean;
  emptyLeverage?: boolean;
  planWithoutWords?: boolean;
  emptyFrame?: boolean;
  /** Force one unparseable reply from the strategy stage, to exercise a retry. */
  strategiseGarbageFirst?: boolean;
  /**
   * Cut a stage's reply off at the token ceiling: finish_reason "length" and a
   * body that is real JSON up to the point it stops. Reproduces the failure
   * mode that produced an undiagnosable ENGINE_FAILED on the first complex case.
   */
  truncateStage?: "extract" | "analyse" | "strategise";
  /**
   * Reproduces the exact live failure: two optional actor claims marked
   * `reported` with no supportingFactIds, at actors[0].goals[1] and
   * actors[0].likelyReactions[0]. Everything else in the frame is complete.
   */
  unsupportedActorClaims?: boolean;
  /** Answer the merged two-call ablation schema. */
  combined?: boolean;
  /** Try to smuggle a user claim into documentedFacts. */
  documentedFactsLeak?: boolean;
  /** Answer in English regardless of the account's language. */
  wrongLanguage?: boolean;
  /** Attach a placeholder redirect to every strategy, as the live run did. */
  redirectPlaceholders?: boolean;
  /** Drop three leverage kinds, as the live run did. */
  partialLeverage?: boolean;
  /** Supply a single exact phrase, as the live run did. */
  oneExactPhrase?: boolean;
  /** Give an actor a personality with no basis. */
  inventedActor?: boolean;
  /** Make the critic pass return something unusable. */
  criticGarbage?: boolean;
  /**
   * Return a cost field that is wrong in a specific way, from the first call.
   * Wrapped in an object so that `{ value: undefined }` — a MISSING cost, which
   * is one of the cases under test — is distinguishable from "do not tamper".
   */
  brokenCost?: { value: unknown };
  /** Claim a different served model than the one requested. */
  reportedModel?: string;
  /** Throw a provider 404 at the strategy stage, as the first live run did. */
  failAtStrategise?: boolean;
  /** Report a charge far above what could have been reserved. */
  overcharge?: boolean;
  /**
   * Exact charge per stage. Used to drive a run toward a real cap without
   * tripping the overcharge check — scaling every cost blindly exceeds the
   * reservation and fails closed first, which is correct behaviour but tests
   * something else.
   */
  stageCosts?: Partial<Record<"extract" | "analyse" | "strategise", number>>;
}

/**
 * Fixture usage includes a provider-reported cost, because that is the path the
 * ledger actually takes in production. A fixture that omitted it would test only
 * the static-table fallback and leave the real path unexercised.
 */
/**
 * Default charges sit well under every configuration's per-stage reservation.
 *
 * They used to be tuned to the Sonnet configuration and broke the moment the
 * default became the cheaper Grok one: the reported cost exceeded the smaller
 * reservation and every test died on COST_ABOVE_RESERVED. A fixture whose
 * numbers depend on which model is default is a fixture that will break again.
 */
const usage = (i: number, o: number, costUsd: number | null = 0.0005) => ({
  inputTokens: i,
  cachedTokens: 0,
  reasoningTokens: 0,
  outputTokens: o,
  actualCostUsd: costUsd,
  rawCost: costUsd,
});

/** Build a usage block whose cost field is wrong in one specific way. */
export const brokenUsage = (raw: unknown) => ({
  inputTokens: 100,
  cachedTokens: 0,
  reasoningTokens: 0,
  outputTokens: 50,
  actualCostUsd: typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null,
  rawCost: raw,
});

/** A transport that never touches the network. */
export function fixtureTransport(opts: FixtureOptions): Transport {
  let extractCalls = 0;
  let strategiseCalls = 0;
  return async (req): Promise<CompletionResult> => {
    opts.spy?.push(req);
    if (opts.callCount) opts.callCount.n++;
    const tamper = <T extends { usage: { actualCostUsd: number | null; rawCost: unknown } }>(r: T): T => {
      if (opts.brokenCost) return { ...r, usage: brokenUsage(opts.brokenCost.value) };
      if (opts.overcharge) return { ...r, usage: brokenUsage(9.99) };
      const stage =
        req.jsonSchema?.name === "case_extraction" ? "extract"
        : req.jsonSchema?.name === "case_analysis" ? "analyse"
        : req.jsonSchema?.name === "case_plan" ? "strategise"
        : undefined;
      const fixed = stage ? opts.stageCosts?.[stage] : undefined;
      if (fixed !== undefined) {
        return { ...r, usage: { ...r.usage, actualCostUsd: fixed, rawCost: fixed } };
      }
      return r;
    };
    /** Realistic telemetry, so the allowlisted path is what tests exercise. */
    const tel = (): ResponseTelemetry => ({
      responseId: `gen-${Math.random().toString(16).slice(2, 10)}`,
      reportedModel: opts.reportedModel ?? req.modelSlug,
      selectedProvider: req.modelSlug.startsWith("x-ai") ? "xAI" : "Google",
      serviceTier: "default",
      routingAttempts: [{ provider: "SpaceXAI", status: "ok" }],
      // A finished answer unless a test asks for a cut-off one.
      finishReason: truncatedHere() ? "length" : "stop",
      nativeFinishReason: null,
    });

    /** True when THIS request is the stage the test wants truncated. */
    function truncatedHere(): boolean {
      if (!opts.truncateStage) return false;
      const n = req.jsonSchema?.name;
      return (
        (opts.truncateStage === "extract" && n === "case_extraction") ||
        (opts.truncateStage === "analyse" && n === "case_analysis") ||
        (opts.truncateStage === "strategise" && n === "case_plan")
      );
    }
    // Returns CompletionResult explicitly: inferring the generic from the
    // partial left telemetry off the inferred type and the compiler was right
    // to object.
    const withModel = (r: Omit<CompletionResult, "telemetry">): CompletionResult => ({
      ...r,
      telemetry: tel(),
    });
    if (opts.alwaysGarbage) return withModel(tamper({ content: "not json", usage: usage(100, 10), latencyMs: 5 }));

    // A fragment, not garbage: valid JSON that simply stops. The engine must
    // refuse it on finish_reason alone, without trying to parse it — a truncated
    // object can still close on an inner brace and validate as a smaller answer.
    if (truncatedHere()) {
      return withModel(tamper({
        content: '{"frame":{"reportedFacts":[{"id":"f1","text":"…"},{"id":"f2","te',
        usage: usage(900, 1600, 0.0009),
        latencyMs: 900,
      }));
    }

    // Behave like a real model: answer in the language the prompt demands.
    // Without this the fixture always replied in Russian and the language gate
    // — correctly — rejected every English run.
    const wantsEnglish = req.system.includes("user-facing field in English");
    const A = opts.wrongLanguage
      ? wantsEnglish ? GOOD_ANALYSIS : GOOD_ANALYSIS_EN
      : wantsEnglish ? GOOD_ANALYSIS_EN : GOOD_ANALYSIS;

    const name = req.jsonSchema?.name;
    if (name === "case_extraction") {
      extractCalls++;
      if (opts.extractReturnsGarbageFirst && extractCalls === 1) {
        return withModel(tamper({ content: "sorry, here is prose", usage: usage(900, 20), latencyMs: 5 }));
      }
      const frame = opts.emptyFrame
        ? { ...A.frame, reportedFacts: [], interpretations: [] }
        : opts.documentedFactsLeak
          ? { ...A.frame, documentedFacts: ["User has the commit history."] }
          : A.frame;
      const withUnsupported = () => {
        const first = A.actors.actors[0];
        const orphan = (v: string) => ({ value: v, basis: "reported", supportingFactIds: [] });
        return {
          actors: [
            {
              ...first,
              goals: [first.goals[0], orphan("Добиться публичного признания авторства")],
              likelyReactions: [orphan("Пойдёт напрямую к директору"), ...first.likelyReactions],
            },
            ...A.actors.actors.slice(1),
          ],
        };
      };
      const actors = opts.unsupportedActorClaims
        ? withUnsupported()
        : opts.inventedActor
        ? {
            actors: [
              ...A.actors.actors.slice(0, 2),
              {
                label: "Директор",
                // Detailed psychology with no supporting fact — the exact
                // failure this validator exists to catch.
                goals: [{ value: "Сохранить технический талант", basis: "reported", supportingFactIds: [] }],
                fears: [{ value: "Потерять инженера", basis: "reported", supportingFactIds: [] }],
                resources: [], authority: { value: "unknown", basis: "unknown", supportingFactIds: [] },
                dependencies: [], likelyReactions: [],
              },
            ],
          }
        : A.actors;
      return withModel(tamper({
        content: JSON.stringify({ frame, actors }),
        usage: usage(900, 400, 0.0005), latencyMs: 700,
      }));
    }
    if (name === "case_analysis") {
      const hypotheses = opts.tooFewHypotheses
        ? { hypotheses: A.hypotheses.hypotheses.slice(0, 2) }
        : A.hypotheses;
      const leverage = opts.emptyLeverage
        ? { points: [] }
        : opts.partialLeverage
          ? { points: A.leverage.points.slice(0, 7) }
          : A.leverage;
      return withModel(tamper({
        content: JSON.stringify({ hypotheses, leverage }),
        usage: usage(1200, 600, 0.002), latencyMs: 2200,
      }));
    }
    if (name === "light_plan") {
      return withModel(tamper({
        content: JSON.stringify({
          shortAssessment: "Роль меняется, причина неизвестна.",
          nextMove: "Запросить письменные цели на квартал.",
          oneExactPhrase: "Хочу зафиксировать цели на квартал письменно.",
          oneRisk: "Руководитель ответит формально и ничего не изменится.",
          oneQuestion: "Что именно означает «разгрузим»?",
        }),
        usage: usage(700, 300, 0.0004), latencyMs: 2400,
      }));
    }
    if (name === "case_plan") {
      if (opts.failAtStrategise) throw new ProviderHttpError(404, req.modelSlug, "404");
      strategiseCalls++;
      // The critic reuses the plan schema; the second such call is the revision.
      if (opts.criticGarbage && strategiseCalls > 1) {
        return withModel(tamper({ content: "critique in prose", usage: usage(1800, 40), latencyMs: 900 }));
      }
      if (opts.strategiseGarbageFirst && strategiseCalls === 1) {
        return withModel(tamper({ content: "прошу прощения, вот текстом", usage: usage(1800, 30), latencyMs: 900 }));
      }
      return withModel(tamper({
        content: JSON.stringify({
          strategies: opts.redirectPlaceholders
            ? {
                strategies: A.strategies.strategies.map((st) => ({
                  ...st,
                  redirect: { category: "unrelated_private_information", reason: "No unrelated leverage used.", preservedObjective: "x" },
                })),
              }
            : A.strategies,
          countermoves: A.countermoves,
          plan: opts.planWithoutWords
            ? { ...A.plan, exactWords: [] }
            : opts.oneExactPhrase
              ? { ...A.plan, exactWords: A.plan.exactWords.slice(0, 1) }
              : A.plan,
        }),
        usage: usage(1800, 1100, 0.003), latencyMs: 4100,
      }));
    }
    if (name === "case_analysis_and_plan") {
      return withModel(tamper({
        content: JSON.stringify({
          hypotheses: GOOD_ANALYSIS.hypotheses,
          leverage: GOOD_ANALYSIS.leverage,
          strategies: opts.redirectPlaceholders
            ? {
                strategies: A.strategies.strategies.map((st) => ({
                  ...st,
                  redirect: { category: "unrelated_private_information", reason: "No unrelated leverage used.", preservedObjective: "x" },
                })),
              }
            : A.strategies,
          countermoves: A.countermoves,
          plan: GOOD_ANALYSIS.plan,
        }),
        usage: usage(2500, 1600, 0.005), latencyMs: 5200,
      }));
    }

    // Baseline or judge: free text.
    return withModel(tamper({ content: BANAL_BASELINE, usage: usage(700, 200, 0.001), latencyMs: 1500 }));
  };
}
