// Ruby Liquid behaviours Shopify relies on that LiquidJS does not have:
//
// 1. bug_compatible_whitespace_trimming: when `{%-` / `{{-` strips a text node that consisted only of
//    whitespace, Ruby Liquid keeps its first character (Shopify renders themes in this mode).
// 2. remove_blank_strings: the whitespace text inside an if / unless / case / for whose whole body is
//    "blank" (only whitespace, assign, capture, comments…) is not output.
import {
  AssignTag,
  CaptureTag,
  CaseTag,
  CommentTag,
  ForTag,
  IfTag,
  InlineCommentTag,
  LiquidTag,
  TokenKind,
  Tokenizer,
  TypeGuards,
  UnlessTag,
  type Liquid,
  type Template,
} from "liquidjs";

type Tok = {
  kind: number;
  input: string;
  begin: number;
  end: number;
  trimLeft: number | boolean;
  trimRight: number | boolean;
  name?: string;
};

const RSTRIP = /[\t\n\v\f\r \0]/;
const LSTRIP = /[\t\n\v\f\r ]/;

function rstrip(tok: Tok | undefined) {
  if (!tok || !TypeGuards.isHTMLToken(tok)) return;
  const t = tok as unknown as { input: string; begin: number; end: number; trimLeft: number; trimRight: number };
  const start = t.begin + t.trimLeft;
  if (t.end - t.trimRight <= start) return; // already empty → nothing to restore (Ruby: first_byte nil)
  while (t.end - t.trimRight > start && RSTRIP.test(t.input[t.end - 1 - t.trimRight])) t.trimRight++;
  if (t.end - t.trimRight === start) t.trimRight--; // keep the first byte
}

function lstrip(tok: Tok | undefined) {
  if (!tok || !TypeGuards.isHTMLToken(tok)) return;
  const t = tok as unknown as { input: string; begin: number; end: number; trimLeft: number; trimRight: number };
  while (t.begin + t.trimLeft < t.end - t.trimRight && LSTRIP.test(t.input[t.begin + t.trimLeft])) t.trimLeft++;
}

let patched = false;
export function patchTokenizer() {
  if (patched) return;
  patched = true;
  const proto = Tokenizer.prototype as unknown as {
    readTopLevelTokens(options: unknown): Tok[];
    readTopLevelToken(options: unknown): Tok;
    p: number;
    N: number;
  };
  proto.readTopLevelTokens = function (this: typeof proto, options: unknown) {
    const tokens: Tok[] = [];
    while (this.p < this.N) tokens.push(this.readTopLevelToken(options));
    let inRaw = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!TypeGuards.isDelimitedToken(token)) continue;
      if (!inRaw && token.trimLeft) rstrip(tokens[i - 1]);
      if (TypeGuards.isTagToken(token)) {
        if (token.name === "raw") inRaw = true;
        else if (token.name === "endraw") inRaw = false;
      }
      if (!inRaw && token.trimRight) lstrip(tokens[i + 1]);
    }
    return tokens;
  };
}

// ---------------------------------------------------------------------------------------------

type Node = Template & Record<string, unknown>;

function isHtml(n: Node): boolean {
  const tok = n.token as { kind?: number } | undefined;
  return !!tok && tok.kind === TokenKind.HTML;
}
function htmlText(n: Node): string {
  return String((n as unknown as { str: string }).str ?? "");
}

const BLANK_TAGS = new Set(["schema", "javascript", "stylesheet", "layout"]);

function bodies(n: Node): Template[][] {
  if (n instanceof IfTag || n instanceof UnlessTag || n instanceof CaseTag) {
    const b = (n as unknown as { branches: { templates: Template[] }[]; elseTemplates?: Template[] }).branches.map((x) => x.templates);
    const e = (n as unknown as { elseTemplates?: Template[] }).elseTemplates;
    return e ? [...b, e] : b;
  }
  if (n instanceof ForTag) {
    const f = n as unknown as { templates: Template[]; elseTemplates: Template[] };
    return [f.templates, f.elseTemplates].filter(Boolean);
  }
  if (n instanceof CaptureTag || n instanceof LiquidTag) return [(n as unknown as { templates: Template[] }).templates];
  const t = (n as unknown as { templates?: Template[] }).templates;
  return Array.isArray(t) ? [t] : [];
}

const blankCache = new WeakMap<object, boolean>();

function isBlank(n: Node): boolean {
  if (blankCache.has(n)) return blankCache.get(n)!;
  let r: boolean;
  if (isHtml(n)) r = /^\s*$/.test(htmlText(n));
  else if (n instanceof AssignTag || n instanceof CaptureTag || n instanceof CommentTag || n instanceof InlineCommentTag) r = true;
  else if (n instanceof IfTag || n instanceof UnlessTag || n instanceof CaseTag || n instanceof ForTag || n instanceof LiquidTag) {
    r = bodies(n).every((list) => list.every((x) => isBlank(x as Node)));
  } else {
    const name = (n as { name?: string }).name;
    r = !!name && BLANK_TAGS.has(name);
  }
  blankCache.set(n, r);
  return r;
}

function walk(list: Template[]) {
  for (const t of list) {
    const n = t as Node;
    for (const body of bodies(n)) walk(body);
    if ((n instanceof IfTag || n instanceof UnlessTag || n instanceof CaseTag || n instanceof ForTag) && isBlank(n)) {
      for (const body of bodies(n)) {
        for (let i = body.length - 1; i >= 0; i--) if (isHtml(body[i] as Node)) body.splice(i, 1);
      }
    }
  }
}

export function removeBlankStrings(templates: Template[]): Template[] {
  walk(templates);
  return templates;
}

export function installCompat(liquid: Liquid) {
  patchTokenizer();
  const parser = liquid.parser as unknown as { parse(html: string, filepath?: string): Template[] };
  const orig = parser.parse.bind(parser);
  parser.parse = (html: string, filepath?: string) => removeBlankStrings(orig(html, filepath));
}
