import { assessResponses, structuralSignals, decide, type ResponseRecord } from "../src/lib/training/assess";

const mk = (r: string, p = "What happened when you walked the route backwards?"): ResponseRecord =>
  ({ skill_id: "memory-palace", prompt: p, response: r, created_at: new Date().toISOString() });

const CASES: [string, ResponseRecord[], string][] = [
  ["all one-word", [mk("ok"), mk("done"), mk("yes")], "expect struggling / repeat"],
  ["short but specific", [mk("The piano image fell apart, the other four held")], "expect solid — length is not the signal"],
  ["long but restating", [mk("The memory palace is a technique where you use a route you know well and place vivid images at each location, which works because spatial memory is stronger than abstract memory, and you walk the route to recall them in order.")], "expect struggling — restating the lesson"],
  ["honest failure w/ detail", [mk("Got 3 of 5. The two I lost were the ones I made polite instead of violent — the anchor was just sitting there, not smashing anything.")], "expect solid — noticing the failure IS the learning"],
  ["thin but engaged", [mk("I tried it, it kind of worked")], "expect partial"],
];

(async () => {
  console.log("=== pure decision table (no model) ===");
  for (const g of ["struggling","partial","solid"] as const)
    for (const d of ["core","deepening","mastery"] as const)
      console.log(`  ${g.padEnd(11)} @ ${d.padEnd(10)} -> ${JSON.stringify(decide(g, d))}`);

  console.log("\n=== classifier on fixtures ===");
  for (const [name, rs, expect] of CASES) {
    const s = structuralSignals(rs);
    const a = await assessResponses(rs, "core");
    console.log(`\n${name}  (${expect})`);
    console.log(`  signals: median=${s.medianWords}w allShort=${s.allShort} substantive=${s.anySubstantive}`);
    console.log(`  -> grasp=${a.grasp} action=${a.action} next=${a.nextDepth}`);
    console.log(`     ${a.reason}`);
  }
})();
