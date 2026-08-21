import type { CaseAnalysis } from "../schemas";
import type { CompletionRequest, CompletionResult, Transport } from "../transport";

/**
 * Fixtures for every test in this module.
 *
 * The whole point: the engine, the graders and the harness are exercised end to
 * end without a single paid call. The fixture transport returns pre-written
 * responses shaped exactly like the provider's, including a usage block, so the
 * cost ledger is tested against realistic numbers rather than zeroes.
 */

export const GOOD_ANALYSIS: CaseAnalysis = {
  frame: {
    verifiedFacts: ["История коммитов и переписка сохранены и доступны."],
    userClaims: ["Архитектуру писал пользователь.", "Руководитель не упомянул его на презентации."],
    interpretations: ["Руководитель намеренно присваивает работу."],
    unknowns: ["Что именно сказали на правлении помимо презентации.", "Что означает «разгрузим» формально."],
    constraints: ["Прямой руководитель контролирует оценку и задачи."],
    stakes: "Карьерная траектория и участие в следующем цикле оценки.",
  },
  actors: {
    actors: [
      {
        label: "Пользователь",
        goals: ["Признание вклада", "Сохранить участие в проекте"],
        fears: ["Быть отодвинутым тихо"],
        resources: ["Письменные следы работы"],
        authority: "Нет формальной власти над решением",
        dependencies: ["Оценка со стороны руководителя"],
        likelyReactions: ["Эскалация через голову при бездействии"],
      },
      {
        label: "Руководитель Р.",
        goals: ["Выглядеть владельцем результата перед правлением"],
        fears: ["Публичное оспаривание его версии"],
        resources: ["Доступ к правлению", "Контроль распределения задач"],
        authority: "Решает загрузку и оценку",
        dependencies: ["Результаты команды, которые он показывает наверх"],
        likelyReactions: ["Оборонительная реакция на письменное обвинение"],
      },
    ],
  },
  hypotheses: {
    hypotheses: [
      {
        claim: "Присвоение результата ради позиции перед правлением.",
        evidenceFor: ["Ни одного упоминания на презентации"],
        evidenceAgainst: ["Формат презентации мог не предполагать имён"],
        confidence: 45,
        discriminatingTest: "Спросить, как будет оформлено авторство в квартальном отчёте.",
      },
      {
        claim: "Пользователя готовят к другой роли, и «разгрузим» — не наказание.",
        evidenceFor: ["Формулировка про следующий квартал"],
        evidenceAgainst: ["Сокращение числа встреч"],
        confidence: 25,
        discriminatingTest: "Попросить письменно зафиксировать цели на квартал.",
      },
      {
        claim: "Собственная версия пользователя неполна: решение принималось выше руководителя.",
        evidenceFor: ["Пользователь не знает, что говорилось на правлении"],
        evidenceAgainst: ["Изменения начались сразу после презентации"],
        confidence: 30,
        discriminatingTest: "Уточнить у смежного участника, обсуждалась ли команда на правлении.",
      },
    ],
  },
  leverage: {
    points: [
      { kind: "informational", description: "История коммитов и переписка фиксируют авторство.", availableToUser: true },
      { kind: "procedural", description: "Цикл оценки требует письменных целей.", availableToUser: true },
      { kind: "temporal", description: "Квартал ещё не начался, распределение не закреплено.", availableToUser: true },
      { kind: "coalition", description: "Смежные заказчики видели, кто вёл работу.", availableToUser: true },
      { kind: "economic", description: "Прямых финансовых рычагов нет.", availableToUser: false },
    ],
  },
  strategies: {
    strategies: [
      { kind: "low_risk", summary: "Зафиксировать цели письменно.", firstMove: "Попросить встречу один на один и письменные цели на квартал.", risk: "green", reversible: true, costIfItFails: "Потеря недели." },
      { kind: "fast", summary: "Уточнить статус до распределения задач.", firstMove: "Написать руководителю короткое письмо с вопросом о роли в следующем квартале.", risk: "yellow", reversible: true, costIfItFails: "Раннее обозначение позиции." },
      { kind: "strong_negotiation", summary: "Связать участие с результатом, который он показывает наверх.", firstMove: "Обозначить, какие части системы требуют владельца, и предложить себя явно.", risk: "yellow", reversible: true, costIfItFails: "Возможный отказ в явной форме." },
      { kind: "unconventional", summary: "Сделать авторство побочным продуктом процесса.", firstMove: "Предложить формат квартального технического отчёта с указанием владельцев компонентов.", risk: "yellow", reversible: true, costIfItFails: "Предложение отклонят.", redirectedFrom: "Письмо директору через голову руководителя с приложением доказательств." },
      { kind: "exit_contingency", summary: "Подготовить альтернативу без объявления.", firstMove: "Обновить резюме и собрать рекомендателей вне прямой линии подчинения.", risk: "green", reversible: true, costIfItFails: "Потраченное время." },
    ],
  },
  countermoves: {
    countermoves: [
      { againstStrategy: "low_risk", likelyResponse: "Согласится и даст размытые цели.", denial: "«Никто ничего не присваивал».", retaliation: "Дальнейшее сокращение задач.", evidenceDestruction: "Маловероятно, следы в системе контроля версий.", escalation: "Перевод разговора в оценку личных качеств.", worstPlausibleOutcome: "Формальные цели без содержания." },
      { againstStrategy: "strong_negotiation", likelyResponse: "Отложит решение.", denial: "«Решаю не я».", retaliation: "Назначит владельцем другого.", evidenceDestruction: "Нет.", escalation: "Привлечёт HR как посредника.", worstPlausibleOutcome: "Публичная фиксация конфликта." },
      { againstStrategy: "unconventional", likelyResponse: "Примет формат, но переопределит владельцев.", denial: "Не потребуется.", retaliation: "Нет прямой.", evidenceDestruction: "Нет.", escalation: "Нет.", worstPlausibleOutcome: "Формат принят, авторство размыто." },
    ],
  },
  plan: {
    conclusion: "Из наблюдаемого следует изменение роли, но причина неизвестна, и версия о присвоении — пока интерпретация, а не факт.",
    missingInformation: ["Что обсуждалось на правлении", "Формальный смысл слова «разгрузим»"],
    recommendedMove: "Запросить письменные цели на квартал и зафиксировать зоны владения до распределения задач.",
    exactWords: [
      "Хочу зафиксировать цели на квартал письменно, чтобы мы одинаково понимали приоритеты.",
      "По биллингу я вёл архитектуру — хочу понимать, остаётся ли эта зона за мной в следующем квартале.",
      "Если роль меняется, мне важно узнать это сейчас, а не в середине квартала.",
    ],
    whatNotToSay: ["Вы присвоили мою работу.", "Я всё расскажу директору."],
    branches: [
      { condition: "цели формулируют размыто во второй раз", then: "запросить письменное описание зоны ответственности" },
      { condition: "владельцем компонента называют другого", then: "перейти к подготовке альтернативы, не объявляя об этом" },
    ],
    stopSignals: ["Отказ фиксировать что-либо письменно", "Приглашение HR на разговор без повестки"],
    fallbackPlan: "Собрать рекомендателей вне прямой линии подчинения и выйти на рынок до цикла оценки.",
    risk: "yellow",
    uncertainty: "Причина изменения роли неизвестна; вероятны как минимум три разных объяснения.",
  },
};

/** Rendered form, used to grade the engine on the same axes as free prose. */
export const GOOD_RENDER = [
  GOOD_ANALYSIS.plan.conclusion,
  "Конкурирующие версии:",
  ...GOOD_ANALYSIS.hypotheses.hypotheses.map((h) => `- ${h.claim} (${h.confidence}%). Как проверить: ${h.discriminatingTest}`),
  "Рычаги: письменная история коммитов, цикл оценки, срок до начала квартала, смежные заказчики.",
  `Рекомендуемый ход: ${GOOD_ANALYSIS.plan.recommendedMove}`,
  "Точные слова:",
  ...GOOD_ANALYSIS.plan.exactWords.map((w) => `- «${w}»`),
  "Что сделает другая сторона: согласится и даст размытые цели; может назначить владельцем другого.",
  "Сигналы остановиться: отказ фиксировать письменно; приглашение HR без повестки.",
  `Запасной план: ${GOOD_ANALYSIS.plan.fallbackPlan}`,
].join("\n");

/** What a weak single-call answer looks like. Not a strawman — this is common. */
export const BANAL_BASELINE = `Понимаю, как это неприятно. В такой ситуации главное — не рубить сплеча.
Постарайтесь спокойно поговорить с руководителем и объяснить свои чувства. Возможно,
он не хотел вас обидеть. Если разговор не поможет, обратитесь к специалисту по
карьерному развитию или в HR. Удачи!`;

interface FixtureOptions {
  spy?: CompletionRequest[];
  extractReturnsGarbageFirst?: boolean;
  alwaysGarbage?: boolean;
  /** Structurally valid JSON that a validator must still refuse. */
  tooFewHypotheses?: boolean;
  emptyLeverage?: boolean;
  planWithoutWords?: boolean;
  emptyFrame?: boolean;
  /** Force one unparseable reply from the strategy stage, to exercise a retry. */
  strategiseGarbageFirst?: boolean;
}

/**
 * Fixture usage includes a provider-reported cost, because that is the path the
 * ledger actually takes in production. A fixture that omitted it would test only
 * the static-table fallback and leave the real path unexercised.
 */
const usage = (i: number, o: number, costUsd: number | null = 0.002) => ({
  inputTokens: i,
  cachedTokens: 0,
  reasoningTokens: 0,
  outputTokens: o,
  actualCostUsd: costUsd,
});

/** A transport that never touches the network. */
export function fixtureTransport(opts: FixtureOptions): Transport {
  let extractCalls = 0;
  let strategiseCalls = 0;
  return async (req): Promise<CompletionResult> => {
    opts.spy?.push(req);
    if (opts.alwaysGarbage) return { content: "not json", usage: usage(100, 10), latencyMs: 5 };

    const name = req.jsonSchema?.name;
    if (name === "case_extraction") {
      extractCalls++;
      if (opts.extractReturnsGarbageFirst && extractCalls === 1) {
        return { content: "sorry, here is prose", usage: usage(900, 20), latencyMs: 5 };
      }
      const frame = opts.emptyFrame
        ? { ...GOOD_ANALYSIS.frame, verifiedFacts: [], userClaims: [], interpretations: [] }
        : GOOD_ANALYSIS.frame;
      return {
        content: JSON.stringify({ frame, actors: GOOD_ANALYSIS.actors }),
        usage: usage(900, 400, 0.002), latencyMs: 700,
      };
    }
    if (name === "case_analysis") {
      const hypotheses = opts.tooFewHypotheses
        ? { hypotheses: GOOD_ANALYSIS.hypotheses.hypotheses.slice(0, 2) }
        : GOOD_ANALYSIS.hypotheses;
      const leverage = opts.emptyLeverage ? { points: [] } : GOOD_ANALYSIS.leverage;
      return {
        content: JSON.stringify({ hypotheses, leverage }),
        usage: usage(1200, 600, 0.02), latencyMs: 2200,
      };
    }
    if (name === "case_plan") {
      strategiseCalls++;
      if (opts.strategiseGarbageFirst && strategiseCalls === 1) {
        return { content: "прошу прощения, вот текстом", usage: usage(1800, 30), latencyMs: 900 };
      }
      return {
        content: JSON.stringify({
          strategies: GOOD_ANALYSIS.strategies,
          countermoves: GOOD_ANALYSIS.countermoves,
          plan: opts.planWithoutWords ? { ...GOOD_ANALYSIS.plan, exactWords: [] } : GOOD_ANALYSIS.plan,
        }),
        usage: usage(1800, 1100, 0.03), latencyMs: 4100,
      };
    }
    // Baseline or judge: free text.
    return { content: BANAL_BASELINE, usage: usage(700, 200, 0.01), latencyMs: 1500 };
  };
}
