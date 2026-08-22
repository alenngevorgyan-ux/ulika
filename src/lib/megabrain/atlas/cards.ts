import type { AtlasCard, AtlasCardType } from "./types";

interface Seed {
  name: string;
  family: string;
  tags?: string[];
}

const PSYCH: Seed[] = [
  ..."anchoring|framing|loss aversion|reference dependence|sunk cost|escalation of commitment|status quo bias|defaults|omission bias|ambiguity aversion|planning fallacy|availability heuristic|representativeness|base-rate neglect|confirmation bias|motivated reasoning|overconfidence|affect heuristic|hot-cold empathy gap|choice overload|endowment effect|decoy effect|peak-end rule|present bias|hyperbolic discounting|probability neglect|zero-risk bias|normalcy bias|optimism bias|pessimism bias|hindsight bias|outcome bias|survivorship bias|selection bias|regression to the mean|law of small numbers|illusory correlation|scope neglect|identifiable-victim effect|moral licensing".split("|").map(name => ({ name, family: "decision" })),
  ..."fundamental attribution error|actor-observer effect|halo effect|horns effect|expectancy effect|self-serving bias|naive realism|hostile attribution bias|projection|pluralistic ignorance|false consensus|spotlight effect|illusion of transparency|correspondence bias|ultimate attribution error|stereotype threat|self-fulfilling prophecy|thin-slice overconfidence|outgroup homogeneity|ingroup favoritism|social identity threat|perspective-taking limits".split("|").map(name => ({ name, family: "social-perception" })),
  ..."reciprocity|commitment and consistency|social proof|authority|scarcity|liking|similarity|identity and unity|foot-in-the-door|door-in-the-face|contrast effect|labeling|autonomy-supportive framing|implementation intention|salience|commitment device|messenger credibility|descriptive norms|injunctive norms|public commitment|choice architecture|mere exposure|processing fluency|goal gradient|fresh-start effect|self-persuasion|motivational interviewing stance".split("|").map(name => ({ name, family: "influence" })),
  ..."psychological reactance|inoculation|resistance to persuasion|source discounting|identity-protective cognition|defensive processing|forewarning|counterarguing|boomerang effect|third-person effect|attitude bolstering|selective exposure".split("|").map(name => ({ name, family: "resistance" })),
  ..."BATNA|reservation point|ZOPA|calibrated concessions|logrolling|package design|package decomposition|multiple equivalent simultaneous offers|contingent agreement|objective criteria|strategic silence|information exchange|negotiation sequencing|deadline pressure|coalition formation|leverage audit|face-saving|principled negotiation|option creation|interest-position separation|single-text procedure|trade low-cost high-value|nonlinear concession|agenda control|issue linkage|issue unlinking|credible commitment|walk-away discipline|authority check|implementation agreement".split("|").map(name => ({ name, family: "negotiation" })),
  ..."escalation loop|de-escalation|procedural fairness|status threat|grievance framing|effective apology|trust repair|boundary setting|conflict spiral|face threat|mutual misperception|double crux|repair attempt|cooling-off period|separate intent from impact|narrow the dispute|least-necessary escalation|process agreement|joint fact finding|acknowledge without conceding|nonviolent communication limit|shame-rage cycle".split("|").map(name => ({ name, family: "conflict" })),
  ..."conformity|groupthink|group polarization|informational influence|normative influence|minority influence|diffusion of responsibility|social loafing|coalition dynamics|authority gradient|common knowledge effect|hidden profile problem|Abilene paradox|risky shift|bystander effect|pluralistic ignorance in groups|devil's advocate|premortem dissent|independent-first voting|leader-last speaking".split("|").map(name => ({ name, family: "group" })),
  ..."competence trust|integrity trust|benevolence trust|credible commitment|costly signal|trust calibration|behavioral consistency|betrayal response|trust repair sequence|vulnerability calibration|swift trust|institutional trust|verification without insult|small-stakes trust test|reputation portability|promise specificity".split("|").map(name => ({ name, family: "trust" })),
  ..."open questions|closed questions|funnel questioning|reflective listening|paraphrasing|summarizing|tentative emotion labeling|calibrated questions|reframing|strategic silence|boundary language|tactical empathy without mystification|teach-back|specificity request|one-topic-at-a-time|observable-language|separate observation and evaluation|ask before advise|repair misunderstanding|face-saving correction".split("|").map(name => ({ name, family: "communication" })),
  ..."chronology request|firsthand versus hearsay|source-of-knowledge question|confidence calibration|concrete-example request|peripheral detail request|document request|independent accounts|triangulation|neutral verification|delayed re-asking|what would change your mind|who else knows|artifact check|version-history check|prediction log|timestamp check|policy check|contract-language check|counterfactual question|open narrative then specifics|information boundary question".split("|").map(name => ({ name, family: "elicitation" })),
  ..."anxiety is not lying|gaze is not a lie detector|posture is not proof|baseline limitation|inconsistency has alternatives|confidence is not truth|corroboration over cues|source quality|alternative explanation|verbal content over demeanor|evidence checking|cognitive load confound|culture confound|neurodiversity confound|interviewer expectancy|false-positive cost|strategic evidence disclosure|statement-evidence comparison".split("|").map(name => ({ name, family: "deception" })),
  ..."reconstructive memory|source monitoring|misinformation effect|interference|confidence-accuracy dissociation|primacy|recency|retrieval cues|eyewitness limitation|memory conformity|weapon focus|suggestive questioning|post-event information|gist versus detail|spacing effect|testing effect|encoding specificity".split("|").map(name => ({ name, family: "memory" })),
  ..."emotional contagion|anger and risk|fear and avoidance|shame and hiding|status threat arousal|cognitive reappraisal|arousal and judgment|affect heuristic|emotion differentiation|co-regulation|sleep and emotional control|time pressure arousal|somatic misattribution|cooling before commitment".split("|").map(name => ({ name, family: "emotion" })),
  ..."functional fixedness|mental set|problem decomposition|analogical transfer|constraint relaxation|incubation|divergent thinking|convergent thinking|insight|problem reframing|means-ends analysis|working backward|morphological analysis|assumption reversal|design by subtraction|constraint as resource|remote association|prototype variation".split("|").map(name => ({ name, family: "creativity" })),
];

const MENTALIST: Seed[] = [
  ..."anomaly spotting|environmental baseline|object-person association|expected versus observed|routine disruption|absence as information|timeline reconstruction|ownership traces|change detection|behavior-context mismatch|fresh versus old trace|access-path inference|who benefits from visibility|who controls the setting|what was prepared in advance|attention allocation|reaction to correction|voluntary detail|knowledge boundary|physical constraint check".split("|").map(name => ({ name, family: "observation" })),
  ..."competing hypotheses|motive alternatives|means-opportunity separation|weakest-link hypothesis|disconfirmation|reverse inference|what else must be true|convenient-story detection|narrator-error hypothesis|accident before intent|capability before motive|timeline falsification|prediction before reveal|minimum-assumption account|adversarial alternative|coordination hypothesis|independent-cause hypothesis|incentive-compatible explanation".split("|").map(name => ({ name, family: "hypotheses" })),
  ..."broad invitation|strategic silence|deliberate ambiguity|free chronology|source tracing|knowledge boundaries|independent accounts|peripheral questions|unprompted correction|ask for sequence not motive|ask what happened next|ask who initiated|ask what was visible|ask what was omitted|ask for exact wording|ask for version history|separate memory from record|confidence before feedback".split("|").map(name => ({ name, family: "elicitation" })),
  ..."observable commitment|low-risk probe|explicit trade-off|sequence change|voluntary opt-in|alternative framing|small reversible test|prediction-triggered check|third-option offer|costly-signal request|neutral choice point|commitment before information|information before commitment|private correction channel|procedural checkpoint|conditional next step".split("|").map(name => ({ name, family: "revealing-choice" })),
  ..."face-saving correction|status management|voluntary correction path|coalition awareness|controlled disclosure|expectation management|leader-last option|private-before-public|credit-sharing exit|separate person from claim|grant harmless point|offer process ownership|avoid cornering|preserve future cooperation|audience selection".split("|").map(name => ({ name, family: "positioning" })),
  ..."attention is not evidence|obvious-suspect trap|narrative dominance|salience trap|decoy issue|false urgency|framing trap|confession-shaped story|single-clue fixation|dramatic-detail overweighting|authority theatre|forced binary|deadline manufacture|publicity as proof|performance-confidence trap".split("|").map(name => ({ name, family: "misdirection" })),
  ..."corroboration|prediction testing|diagnostic event|evidence preservation|observation-inference separation|independent timestamp|artifact provenance|chain-of-custody awareness|negative-control check|source reliability ladder|claim-evidence matrix|contradiction log|reversible verification|minimum sufficient evidence|update after result".split("|").map(name => ({ name, family: "verification" })),
];

const FICTION: Seed[] = [
  ..."the conspicuous clue|the missing ordinary object|the locked-room assumption|the impossible timeline|the overhelpful witness|the convenient confession|the false identity premise|the switched object|the inherited narrative|the overlooked access route|the staged accident|the wrong unit of time|the assumed single actor|the hidden intermediary|the decoy motive|the mundane mechanism|the witness who inferred|the clue that proves opportunity only|the absent expected trace|the duplicated item".split("|").map(name => ({ name, family: "anomaly" })),
  ..."reconstruct from constraints|work backward from outcome|test the least dramatic account|separate how from why|ask who knew when|map access before motive|find the assumption shared by all|convert impossibility into hidden premise|compare independent timelines|seek the prediction that differs|treat contradiction as localization|identify information asymmetry|look for process ownership|follow the transfer chain|distinguish creation from discovery|audit the narrator's vantage|model the staging audience|search for a reversible reenactment|use negative evidence cautiously|prefer converging weak clues".split("|").map(name => ({ name, family: "reasoning-move" })),
  ..."the elegant theory that overfits|demeanor mistaken for guilt|rare method preferred over ordinary access|motive treated as identity|coincidence forbidden too early|one inconsistency treated as lie|expert authority accepted untested|the suspect chosen by salience|the solution requiring hidden powers|the clue interpreted only one way|the alibi treated as total|memory treated as recording|absence treated as certainty|the victim narrative left unaudited|the investigator causes the behavior".split("|").map(name => ({ name, family: "failed-hypothesis" })),
  ..."verify with a harmless prediction|ask for the original artifact|separate witnesses before accounts converge|preserve versions before confrontation|recreate sequence without danger|check public records lawfully|ask the source to distinguish seeing from hearing|offer a correction path|use a neutral third party|turn allegation into a document question|wait for an observable event|compare stated rule with actual process|test access with permission|seek disconfirming evidence first|stop when real life lacks story-level certainty".split("|").map(name => ({ name, family: "safe-analogue" })),
];

const LENSES = "Decompose the bundle|Remove false dichotomy|Reverse the assumption|Audit constraints|Relax assumed constraint|Change sequence|Separate reversible and irreversible|Generate third option|Pareto improvement|Incentive redesign|Face-saving alternative|Information probe|Value of information|Negative-space reasoning|Disconfirmation|Counterfactual|Role reversal|Second-order effects|Pre-mortem|Analogy transfer|Change the process|Change the unit of negotiation|Split timing from commitment|Conditional agreement|What must also be true|Remove one actor|Add a neutral third channel|Convert claim into test|Preserve optionality|Attack bottleneck not symptom".split("|").map(name => ({ name, family: "ideation" }));

const FAMILY: Record<string, { problem: string; mechanism: string; test: string; action: string; misuse: string }> = {
  decision: { problem: "judgment under uncertainty", mechanism: "changes how options or evidence are weighted", test: "restate the choice under a neutral reference point", action: "compare the decision under two equivalent framings", misuse: "treating a population tendency as a diagnosis" },
  "social-perception": { problem: "reading people without overclaiming", mechanism: "separates observed behaviour from attributed character", test: "generate a situational alternative", action: "ask for an observable example", misuse: "mind-reading" },
  influence: { problem: "lawful persuasion", mechanism: "changes attention, motivation or commitment without removing choice", test: "check whether the person can freely decline", action: "use transparent, autonomy-preserving framing", misuse: "covert coercion" },
  resistance: { problem: "pushback and persuasion failure", mechanism: "explains why pressure can strengthen opposition", test: "reduce pressure and observe whether engagement returns", action: "restore choice and invite correction", misuse: "labelling all disagreement as reactance" },
  negotiation: { problem: "creating and claiming value", mechanism: "restructures issues, sequence, alternatives or commitments", test: "map interests and walk-away points separately", action: "create a package or conditional option", misuse: "using a technique without a viable BATNA" },
  conflict: { problem: "preventing avoidable escalation", mechanism: "changes threat, fairness and repair dynamics", test: "narrow the disagreement to one verifiable issue", action: "use the least irreversible sufficient step", misuse: "appeasement disguised as de-escalation" },
  group: { problem: "collective decision distortion", mechanism: "changes what information and dissent become visible", test: "collect independent judgments before discussion", action: "alter speaking or voting order", misuse: "assuming every consensus is groupthink" },
  trust: { problem: "calibrating reliance", mechanism: "separates competence, integrity and benevolence", test: "use a small-stakes verifiable commitment", action: "match reliance to observed reliability", misuse: "demanding blind trust" },
  communication: { problem: "getting usable information and agreement", mechanism: "reduces ambiguity while preserving rapport", test: "ask the other person to correct the summary", action: "speak in short observable claims", misuse: "performative empathy" },
  elicitation: { problem: "decision-changing information", mechanism: "improves source quality without coercion", test: "separate firsthand knowledge from inference", action: "ask one neutral, answerable question", misuse: "interrogation or deceptive pretexting" },
  deception: { problem: "suspicion without pseudoscience", mechanism: "replaces demeanor cues with corroboration and alternatives", test: "compare claims with independent evidence", action: "verify content, not body language", misuse: "calling anxiety proof of lying" },
  memory: { problem: "uncertain recollection", mechanism: "treats memory as reconstructive and source-sensitive", test: "seek contemporaneous records before feedback", action: "preserve independent accounts", misuse: "equating confidence with accuracy" },
  emotion: { problem: "emotion-driven decisions", mechanism: "changes arousal, interpretation and action readiness", test: "delay commitment and reassess under lower arousal", action: "name uncertainty and preserve options", misuse: "invalidating emotion as irrational" },
  creativity: { problem: "stuck option space", mechanism: "changes representation or relaxes assumed constraints", test: "state the assumption the option depends on", action: "generate a structurally different alternative", misuse: "novelty for its own sake" },
  observation: { problem: "noticing diagnostic differences", mechanism: "compares expected and observed context", test: "record observation before interpretation", action: "verify the anomaly through a lawful source", misuse: "turning a cue into certainty" },
  hypotheses: { problem: "premature closure", mechanism: "keeps competing explanations falsifiable", test: "name a fact that differs across hypotheses", action: "run the cheapest reversible discriminating test", misuse: "inventing elaborate motives" },
  "revealing-choice": { problem: "learning through voluntary action", mechanism: "creates a low-risk choice whose outcomes differ", test: "check that declining is safe and genuinely voluntary", action: "offer a reversible opt-in", misuse: "entrapment" },
  positioning: { problem: "status and cooperation", mechanism: "lowers the social cost of correction or agreement", test: "ask whether the other side has a face-saving path", action: "make correction privately and specifically", misuse: "manipulative flattery" },
  misdirection: { problem: "attention traps", mechanism: "separates salience from diagnostic value", test: "ask what evidence would matter if the dramatic detail vanished", action: "return to timeline, access and records", misuse: "assuming every salient fact is a decoy" },
  verification: { problem: "claim validation", mechanism: "links a claim to provenance and a discriminating observation", test: "seek independent corroboration", action: "preserve evidence before confrontation", misuse: "unauthorized investigation" },
  anomaly: { problem: "generating hypotheses from anomalies", mechanism: "uses story structure as analogy, never evidence", test: "check the anomaly against real-world records", action: "translate the trope into a safe verification question", misuse: "forcing life into a detective plot" },
  "reasoning-move": { problem: "reframing an investigation", mechanism: "changes which assumption or sequence is tested", test: "derive an observable prediction", action: "perform a lawful low-risk check", misuse: "treating elegance as truth" },
  "failed-hypothesis": { problem: "avoiding detective-story errors", mechanism: "catalogues attractive but unreliable inferences", test: "look for mundane and situational alternatives", action: "withhold accusation until corroborated", misuse: "using fiction as empirical authority" },
  "safe-analogue": { problem: "translating fiction into lawful action", mechanism: "preserves the reasoning move while removing intrusion or deception", test: "verify consent, ownership and reversibility", action: "use records, direct questions or neutral channels", misuse: "imitating a fictional investigator" },
  ideation: { problem: "expanding option space", mechanism: "applies one bounded transformation before selecting action", test: "compare downside and information gain with the default", action: "keep the transformed option only if it improves risk/reward", misuse: "forcing cleverness when the ordinary move is better" },
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function make(type: AtlasCardType, seed: Seed): AtlasCard {
  if (type === "BOOK_REFERENCE") throw new Error("BOOK_REFERENCE uses the shelf schema");
  const f = FAMILY[seed.family];
  const analogy = type === "MENTALIST_PATTERN" || type === "FICTION_REASONING_PATTERN";
  return {
    id: `${type.toLowerCase()}-${slug(seed.family)}-${slug(seed.name)}`,
    type,
    name: seed.name,
    aliases: [seed.name.toLowerCase()],
    domains: [seed.family],
    problems_it_solves: [f.problem],
    core_idea: `${seed.name}: ${f.mechanism}.`,
    mechanism: f.mechanism,
    signals: ["The case contains a decision, claim or interaction matching this family."],
    possible_explanations: ["The mechanism may apply.", "A situational or accidental explanation may fit better."],
    when_useful: [f.problem],
    when_not_useful: ["When it does not change a decision or safe test."],
    information_needed: ["A concrete observation, source or constraint relevant to the mechanism."],
    how_to_test: [f.test],
    candidate_actions: [f.action],
    countermoves: ["The other side may deny the premise, delay, or change framing."],
    failure_modes: [f.misuse],
    common_misuse: [f.misuse],
    ethical_constraints: ["No coercion, unauthorized access, surveillance, impersonation or harmful deception."],
    unsafe_variant: "Use the pattern to accuse, entrap or manipulate without corroboration.",
    safe_analog: f.action,
    evidence_strength: analogy ? "analogy_only" : type === "IDEATION_LENS" ? "reasoning_tool" : "practice_candidate",
    epistemic_status: analogy ? "analogy" : "practice",
    source_ids: type === "FICTION_REASONING_PATTERN" ? ["ulika-fiction-abstractions"] : type === "MENTALIST_PATTERN" ? ["ulika-mentalist-abstractions"] : ["ulika-atlas-original"],
    license: "ULIKA original abstraction",
    provenance: "Independently authored abstraction; no copyrighted source text stored.",
    source_date: "2026-08-22",
    example: `Use ${seed.name} only to generate a hypothesis or reversible next step, never to prove a fact.`,
    tags: [seed.family, ...(seed.tags ?? []), ...seed.name.toLowerCase().split(/\s+/).filter((x) => x.length > 3)],
  };
}

// The source catalogue is intentionally broader than the served Atlas. Keep a
// bounded, reviewable first wave instead of claiming every label is a distinct
// intervention merely to maximise a count.
export const PSYCH_TACTICS = PSYCH.slice(0, 240).map((seed) => make("PSYCH_TACTIC", seed));
export const MENTALIST_PATTERNS = MENTALIST.map((seed) => make("MENTALIST_PATTERN", seed));
export const FICTION_REASONING_PATTERNS = FICTION.map((seed) => make("FICTION_REASONING_PATTERN", seed));
export const IDEATION_LENSES = LENSES.map((seed) => make("IDEATION_LENS", seed));

const SCENARIO_TITLES = "Baseline-калибровка|Отклонение от базовой линии|Микровыражения|Мелкие детали|Речевые заминки|Асимметрия лица|Темп речи под давлением|Направление взгляда|Несоответствие слов и интонации|Жесты самоуспокоения|Rainbow Ruse|Эффект Барнума|Fine Flattery|Sherlock Scan|Push Statement|Vanishing Negative|Категориальное утверждение|Расплывчатый эмоциональный язык|Имя как усилитель|Явная деконструкция после демонстрации|1089|Форс через умножение на 9|Мгновенный квадрат двузначного числа|День недели по дате|Числовая пирамида-предсказание|Ряд с гарантированной кратностью|Магический квадрат|Мгновенный процент|Временная мисдирекция|Социальная мисдирекция|Юмор как окно|Крупное и мелкое|Мисдирекция вопросом|Ложная кульминация|Off-beat момент|Направленная мисдирекция звуком|Прайминг словами|Иллюзия выбора|Пресуппозиция в вопросе|Якорение числом|Зеркалирование речи|Тактическая пауза|Именование эмоции|Общий принцип форса|Групповое чтение через статистику|Раппорт через темп|Отражение позы|Горячее чтение|Эффект хозяина комнаты|Разоблачение как акт доверия".split("|");

export const ULIKA_CASE_PATTERNS: AtlasCard[] = SCENARIO_TITLES.map((name, index) => ({
  ...make("MENTALIST_PATTERN", { name, family: index < 10 ? "observation" : index < 20 ? "elicitation" : index < 29 ? "reasoning-move" : index < 37 ? "misdirection" : "positioning" }),
  id: `ulika-case-${String(index + 1).padStart(2, "0")}`,
  type: "ULIKA_CASE_PATTERN",
  epistemic_status: "analogy",
  evidence_strength: "authored_scenario_only",
  source_ids: ["ulika-50-scenarios"],
  provenance: `ULIKA-authored scenario ${index + 1}; scenario pattern, never empirical evidence.`,
}));

/** Populated only from per-article licensed scientific synthesis. Never inferred from tactics. */
export const EVIDENCE_CARDS: AtlasCard[] = [];

export const ATLAS_CARDS: AtlasCard[] = [
  ...PSYCH_TACTICS,
  ...MENTALIST_PATTERNS,
  ...FICTION_REASONING_PATTERNS,
  ...IDEATION_LENSES,
  ...ULIKA_CASE_PATTERNS,
  ...EVIDENCE_CARDS,
];
