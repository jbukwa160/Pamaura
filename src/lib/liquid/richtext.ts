// Shopify rich_text_field values: either Shopify's JSON tree or (imported / admin-edited) HTML.

interface Node {
  type: string;
  value?: string;
  bold?: boolean;
  italic?: boolean;
  level?: number;
  listType?: string;
  url?: string;
  title?: string;
  target?: string;
  children?: Node[];
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(n: Node): string {
  const kids = (n.children || []).map(render).join("");
  switch (n.type) {
    case "root":
      return kids;
    case "paragraph":
      return `<p>${kids}</p>`;
    case "heading":
      return `<h${n.level || 2}>${kids}</h${n.level || 2}>`;
    case "list":
      return n.listType === "ordered" ? `<ol>${kids}</ol>` : `<ul>${kids}</ul>`;
    case "list-item":
      return `<li>${kids}</li>`;
    case "link":
      return `<a href="${esc(n.url || "")}"${n.title ? ` title="${esc(n.title)}"` : ""}${n.target ? ` target="${esc(n.target)}"` : ""}>${kids}</a>`;
    case "text": {
      let t = esc(n.value || "").replace(/\n/g, "<br>");
      if (n.italic) t = `<em>${t}</em>`;
      if (n.bold) t = `<strong>${t}</strong>`;
      return t;
    }
    default:
      return kids;
  }
}

export function richTextToHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const s = value.trim();
    if (s.startsWith("{")) {
      try {
        return render(JSON.parse(s) as Node);
      } catch {
        return s;
      }
    }
    return value;
  }
  if (typeof value === "object") return render(value as Node);
  return String(value);
}
