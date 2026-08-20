import { NextRequest, NextResponse } from "next/server";
import { chatComplete, isAiConfigured, type AiMessage } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/mentalist/systemPrompt";
import { TOOL_DEFS, getTrainingCatalog, validatePlanArgs, type SavePlanArgs } from "@/lib/mentalist/tools";
import { loadMemory, extractMemory, saveMemory, loadFollowUps, markRaised } from "@/lib/mentalist/memory";
import { getServerSupabase } from "@/lib/supabase/server";
import { detectCrisis } from "@/lib/safety/detector";
import { buildCrisisReply } from "@/lib/safety/respond";

export const maxDuration = 60;

interface ChatRequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        reply:
          "No AI key configured in this environment (OPENROUTER_API_KEY). Set it to enable the conversation.",
        configured: false,
      },
      { status: 200 }
    );
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const userId = user?.id ?? null;

  // Knowledge retrieval reads the recent conversation, not just the last line —
  // the relevant lens is often set by context a few turns back.
  const recentText = body.messages
    .slice(-6)
    .map((m) => m.content)
    .join("\n");

  // SAFETY LAYER — runs before anything else, on every single message.
  // Deliberately not an instruction inside the main prompt: mid-conversation,
  // deep in a discussion about a difficult relationship, is exactly where a
  // quiet disclosure is easiest to absorb into the flow and miss. This layer
  // has one job and no other context competing for it.
  const lastUserMessage = [...body.messages].reverse().find((m) => m.role === "user");
  const crisis = await detectCrisis(body.messages);

  if (crisis.triggered && crisis.type) {
    const reply = await buildCrisisReply(crisis.type, lastUserMessage?.content ?? "");

    if (supabase && userId) {
      try {
        await supabase.from("crisis_flags").insert({
          user_id: userId,
          trigger_type: crisis.type,
          session_context: crisis.evidence,
        });
      } catch {
        /* logging must never block the handoff itself */
      }
    }

    return NextResponse.json({ reply, configured: true, crisis: true });
  }

  const memoryBlock = await loadMemory(supabase, userId);

  // Only surface unfinished business at the start of a conversation. Raising
  // it mid-thread would derail whatever they're actually working through.
  const isConversationStart = body.messages.filter((m) => m.role === "user").length === 1;
  const followUps = isConversationStart ? await loadFollowUps(supabase, userId) : [];
  if (followUps.length) await markRaised(supabase, followUps.map((f) => f.id));

  const conversation: AiMessage[] = [
    { role: "system", content: buildSystemPrompt(recentText, memoryBlock, followUps) },
    ...body.messages.map((m) => ({ role: m.role, content: m.content }) as AiMessage),
  ];

  let savedPlan: unknown = null;

  // Tool-calling loop, bounded to keep latency and cost predictable.
  for (let round = 0; round < 4; round++) {
    let result;
    try {
      result = await chatComplete(conversation, { tools: TOOL_DEFS });
    } catch (err) {
      console.error("chat route AI error:", err instanceof Error ? err.message : err);
      return NextResponse.json(
        { reply: "Can't reach me right now. Try again in a minute.", configured: true },
        { status: 200 }
      );
    }

    const { message } = result;
    conversation.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      const reply = message.content ?? "";

      // Memory extraction is awaited, not fire-and-forget: a serverless
      // container can freeze the moment the response goes out, and a write
      // that never lands is worse than one that costs 300ms.
      if (userId && supabase) {
        if (lastUserMessage) {
          const rows = await extractMemory(lastUserMessage.content, reply);
          await saveMemory(supabase, userId, rows);
        }
      }

      return NextResponse.json({ reply, configured: true, savedPlan, remembers: Boolean(memoryBlock) });
    }

    for (const call of message.tool_calls) {
      let toolResult: unknown;

      if (call.function.name === "get_training_catalog") {
        toolResult = getTrainingCatalog();
      } else if (call.function.name === "save_learning_plan") {
        let args: SavePlanArgs;
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify({ error: "Could not parse plan arguments" }),
          });
          continue;
        }

        const validationError = validatePlanArgs(args);
        if (validationError) {
          toolResult = { error: validationError };
        } else if (!userId || !supabase) {
          toolResult = {
            saved: false,
            note: "Not signed in, so the plan was shown but not saved to an account.",
          };
        } else {
          const { data, error } = await supabase
            .from("learning_plans")
            .insert({
              user_id: userId,
              goal: args.goal,
              items: args.items.map((item, i) => ({ ...item, order: i, completed: false })),
            })
            .select()
            .single();

          if (error) {
            console.error("save_learning_plan insert error:", error.message);
            toolResult = { saved: false, note: "Could not save the plan. Try again." };
          } else {
            toolResult = { saved: true, plan: data };
            savedPlan = data;
          }
        }
      } else {
        toolResult = { error: `Unknown tool: ${call.function.name}` };
      }

      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return NextResponse.json({
    reply: "Something went wrong building that answer. Rephrase and try again.",
    configured: true,
    savedPlan,
  });
}
