export function extractXmlContent(tag: string, input: string): string | null {
  try {
    const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
    const match = input.match(regex);
    return match ? (match[1] as string).trim() : null;
  } catch {
    return "";
  }
}

/**
 * If the content is wrapped in <![CDATA[ ... ]]>, return the inner content
 * EXACTLY (whitespace preserved). Otherwise return the content trimmed.
 * CDATA is how the model preserves exact whitespace / multi-line text.
 */
export function unwrapCdata(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
    return trimmed.slice("<![CDATA[".length, -"]]>".length);
  }
  return trimmed;
}

/**
 * Like extractXmlContent, but CDATA-aware: CDATA content is returned exactly
 * as-is (no trimming), non-CDATA content is trimmed.
 */
export function extractXmlText(tag: string, input: string): string | null {
  try {
    const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
    const match = input.match(regex);
    return match ? unwrapCdata(match[1] as string) : null;
  } catch {
    return null;
  }
}

/**
 * Extract ALL occurrences of a tag (CDATA-aware, same semantics as
 * extractXmlText). Used for repeated blocks like <TOOL>, <FILE>, <PATCH>.
 */
export function extractAllXmlContent(tag: string, input: string): string[] {
  const results: string[] = [];
  try {
    const regex = new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
      "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = regex.exec(input)) !== null) {
      results.push(unwrapCdata(match[1] as string));
    }
  } catch {}
  return results;
}
