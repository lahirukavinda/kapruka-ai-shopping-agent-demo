export interface ResponseAction {
  label: string;
  text: string;
}

// Items that look like order details, prices, or payment links should not become chips
const SKIP_PATTERN = /LKR|Rs\.|මෙතනින්|https?:\/\/|checkout|pay_url|total|delivery.*fee|subtotal|grand.?total/i;

export function parseResponseActions(content: string): ResponseAction[] {
  const actions: ResponseAction[] = [];

  // Parse numbered lists: "1. Cake" or "1) Cake" — only if 2+ matches
  const numberedRegex = /(?:^|\n)\s*\d+[.)]\s+(.+)/g;
  let match: RegExpExecArray | null;
  const numberedItems: string[] = [];
  while ((match = numberedRegex.exec(content)) !== null) {
    const item = match[1].replace(/\*\*/g, "").trim();
    if (item.length > 0 && item.length < 80 && !SKIP_PATTERN.test(item)) numberedItems.push(item);
  }
  if (numberedItems.length >= 2) {
    for (const item of numberedItems.slice(0, 6)) {
      const label = item.split(/[—–-]/)[0].trim().slice(0, 30);
      actions.push({ label, text: label });
    }
    return actions;
  }

  // Parse bullet lists: "- Cake" or "• Cake"
  const bulletRegex = /(?:^|\n)\s*[-•]\s+(.+)/g;
  const bulletItems: string[] = [];
  while ((match = bulletRegex.exec(content)) !== null) {
    const item = match[1].replace(/\*\*/g, "").trim();
    if (item.length > 0 && item.length < 80 && !SKIP_PATTERN.test(item)) bulletItems.push(item);
  }
  if (bulletItems.length >= 2) {
    for (const item of bulletItems.slice(0, 6)) {
      const label = item.split(/[—–-]/)[0].trim().slice(0, 30);
      actions.push({ label, text: label });
    }
    return actions;
  }

  // Parse emoji-prefixed options: "🎂 Cake\n💐 Flowers"
  const emojiRegex = new RegExp("(?:^|\\n)\\s*([\\u{1F300}-\\u{1FAD6}\\u{2600}-\\u{27BF}])\\s+(.+)", "gu");
  const emojiItems: Array<{ emoji: string; text: string }> = [];
  while ((match = emojiRegex.exec(content)) !== null) {
    const item = match[2].replace(/\*\*/g, "").trim();
    if (item.length > 0 && item.length < 80 && !SKIP_PATTERN.test(item)) {
      emojiItems.push({ emoji: match[1], text: item });
    }
  }
  if (emojiItems.length >= 2) {
    for (const item of emojiItems.slice(0, 6)) {
      const label = `${item.emoji} ${item.text.split(/[—–-]/)[0].trim().slice(0, 28)}`;
      actions.push({ label, text: item.text.split(/[—–-]/)[0].trim() });
    }
    return actions;
  }

  return actions;
}
