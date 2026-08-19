import { NextRequest, NextResponse } from "next/server";
import { chatComplete, isAiConfigured, type AiMessage } from "@/lib/ai/provider";
import { MENTALIST_SYSTEM_PROMPT } from "@/lib/mentalist/systemPrompt";
import { TOOL_DEFS, getTrainingCatalog, validatePlanArgs, type SavePlanArgs } from "@/lib/mentalist/tools";
import { getServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;

interface ChatRequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        reply:
          "Марк пока молчит — ключ AI-провайдера (OPENROUTER_API_KEY) не настроен в этом окружении. Добавь его в переменные окружения, чтобы включить диалог.",
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

  const conversation: AiMessage[] = [
    { role: "system", content: MENTALIST_SYSTEM_PROMPT },
    ...body.messages.map((m) => ({ role: m.role, content: m.content }) as AiMessage),
  ];

  let savedPlan: unknown = null;

  // Tool-calling loop: at most 4 round-trips to keep latency/cost bounded.
  for (let round = 0; round < 4; round++) {
    let result;
    try {
      result = await chatComplete(conversation, { tools: TOOL_DEFS });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown AI error";
      console.error("chat route AI error:", message);
      return NextResponse.json(
        { reply: "Марк сейчас недоступен — попробуй ещё раз через минуту.", configured: true },
        { status: 200 }
      );
    }

    const { message } = result;
    conversation.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return NextResponse.json({
        reply: message.content,
        configured: true,
        savedPlan,
      });
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
          toolResult = { error: "Could not parse plan arguments" };
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(toolResult),
          });
          continue;
        }

        const validationError = validatePlanArgs(args);
        if (validationError) {
          toolResult = { error: validationError };
        } else if (!user || !supabase) {
          toolResult = {
            saved: false,
            note: "Пользователь не авторизован — план показан, но не сохранён в аккаунте.",
          };
        } else {
          const { data, error } = await supabase
            .from("learning_plans")
            .insert({
              user_id: user.id,
              goal: args.goal,
              items: args.items.map((item, i) => ({ ...item, order: i, completed: false })),
            })
            .select()
            .single();

          if (error) {
            console.error("save_learning_plan insert error:", error.message);
            toolResult = { saved: false, note: "Не удалось сохранить план — попробуй ещё раз." };
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
    reply: "Что-то пошло не так при сборке ответа — переформулируй запрос.",
    configured: true,
    savedPlan,
  });
}
