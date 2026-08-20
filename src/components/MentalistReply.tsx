import { parseReply } from "@/lib/mentalist/parseReply";

/**
 * Renders a reply as distinct sections rather than a wall of prose.
 *
 * The structure IS the product difference: what he noticed, what he still
 * needs, and what he actually thinks are three different kinds of statement
 * and shouldn't look identical on screen.
 */
export default function MentalistReply({ content }: { content: string }) {
  const { noticed, asking, saying, plain } = parseReply(content);

  if (plain) {
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{saying}</p>;
  }

  return (
    <div className="space-y-5">
      {noticed.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-2.5">
            What I noticed
          </p>
          <div className="space-y-1.5">
            {noticed.map((line, i) => (
              <p key={i} className="text-sm leading-relaxed pl-3 border-l border-accent/30">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {asking.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-2.5">
            What I need to know
          </p>
          <ol className="space-y-2">
            {asking.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="font-mono text-xs text-accent shrink-0 pt-0.5">{i + 1}</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {saying && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap border-t border-panel-border pt-4">
          {saying}
        </p>
      )}
    </div>
  );
}
