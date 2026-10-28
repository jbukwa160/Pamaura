// Shopify-specific Liquid tags.
import { Hash, RenderTag, Tag, Value, evalToken, toValue, type Context, type Emitter, type Liquid, type TagToken, type TopLevelToken, type Template } from "liquidjs";
import type { Env } from "./settings";
import { BlockDrop } from "./settings";
import { CollectionDrop, BlogDrop, ProductDrop } from "./drops/catalog";
import { localePath, returnTo } from "./state";
import { escapeHtml } from "./filters";
import { renderAppBlock } from "./apps";

const envOf = (ctx: Context): Env => ctx.globals.__env as Env;

/** Skips everything up to the end tag without parsing it (schema, javascript, stylesheet). */
function skipTo(remainTokens: TopLevelToken[], endName: string) {
  while (remainTokens.length) {
    const t = remainTokens.shift()!;
    if ((t as TagToken).name === endName) return;
  }
}

class SchemaTag extends Tag {
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    skipTo(remainTokens, "endschema");
  }
  *render() {}
}
class JavascriptTag extends Tag {
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    skipTo(remainTokens, "endjavascript");
  }
  *render() {}
}
class StylesheetTag extends Tag {
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    skipTo(remainTokens, "endstylesheet");
  }
  *render() {}
}

/** Block tag base: parses the body until end<name>. */
abstract class BlockBase extends Tag {
  templates: Template[] = [];
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, endName: string) {
    super(token, remainTokens, liquid);
    const stream = liquid.parser.parseStream(remainTokens);
    stream
      .on(`tag:${endName}`, () => stream.stop())
      .on("template", (tpl: Template) => this.templates.push(tpl))
      .on("end", () => {
        throw new Error(`tag ${token.getText()} not closed`);
      });
    stream.start();
  }
}

class StyleTag extends BlockBase {
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid, "endstyle");
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    emitter.write("<style data-shopify>");
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    emitter.write("</style>");
  }
}

// ---------------------------------------------------------------------------------------------
// {% form %}

interface FormDef {
  action: (env: Env, obj: unknown) => string;
  id?: string;
  cls?: string;
  enctype?: boolean;
  hidden?: (env: Env, obj: unknown) => string;
}

const FORMS: Record<string, FormDef> = {
  product: { action: (e) => localePath(e.s, "/cart/add"), cls: "shopify-product-form", enctype: true },
  cart: { action: (e) => localePath(e.s, "/cart"), id: "cart_form", cls: "shopify-cart-form", enctype: true },
  contact: { action: (e) => localePath(e.s, "/contact"), id: "contact_form", cls: "contact-form" },
  customer: { action: (e) => localePath(e.s, "/contact"), id: "customer_form" },
  customer_login: { action: (e) => localePath(e.s, "/account/login"), id: "customer_login" },
  create_customer: { action: (e) => localePath(e.s, "/account"), id: "create_customer" },
  recover_customer_password: { action: (e) => localePath(e.s, "/account/recover") },
  guest_login: { action: (e) => localePath(e.s, "/account/login"), id: "customer_login_guest", hidden: () => '<input type="hidden" name="guest" value="true" />' },
  activate_customer_password: {
    action: (e) => localePath(e.s, "/account/activate"),
    hidden: (e) => {
      const m = e.s.path.match(/\/account\/activate\/(\d+)\/([^/?#]+)/);
      return m ? `<input type="hidden" name="customer_id" value="${m[1]}" /><input type="hidden" name="token" value="${escapeHtml(m[2])}" />` : "";
    },
  },
  reset_customer_password: {
    action: (e) => localePath(e.s, "/account/reset"),
    hidden: (e) => {
      const m = e.s.path.match(/\/account\/reset\/(\d+)\/([^/?#]+)/);
      return m ? `<input type="hidden" name="customer_id" value="${m[1]}" /><input type="hidden" name="token" value="${escapeHtml(m[2])}" />` : "";
    },
  },
  customer_address: {
    action: (e, obj) => {
      const id = (obj as { id?: unknown })?.id;
      return localePath(e.s, id ? `/account/addresses/${toValue(id)}` : "/account/addresses");
    },
    hidden: (_e, obj) => ((obj as { id?: unknown })?.id ? '<input type="hidden" name="_method" value="put" />' : ""),
  },
  storefront_password: { action: (e) => localePath(e.s, "/password"), id: "login_form" },
  new_comment: {
    action: (e, obj) => `${String((obj as { url?: unknown })?.url ?? "")}/comments`,
    id: "comment_form",
    cls: "comment-form",
  },
  localization: {
    action: (e) => localePath(e.s, "/localization"),
    id: "localization_form",
    cls: "shopify-localization-form",
    enctype: true,
    hidden: (e) => `<input type="hidden" name="_method" value="put" /><input type="hidden" name="return_to" value="${escapeHtml(returnTo(e.s))}" />`,
  },
  currency: {
    action: (e) => localePath(e.s, "/cart/update"),
    id: "currency_form",
    cls: "shopify-currency-form",
    enctype: true,
    hidden: (e) => `<input type="hidden" name="return_to" value="${escapeHtml(returnTo(e.s))}" />`,
  },
};

export class FormObject {
  constructor(public data: Record<string, unknown>) {}
}

class FormTag extends BlockBase {
  private typeValue: Value | null = null;
  private objValue: Value | null = null;
  private hash: Hash;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid, "endform");
    const tk = this.tokenizer;
    tk.skipBlank();
    const typeTok = tk.readValue();
    if (typeTok) this.typeValue = new Value(typeTok.getText(), liquid);
    tk.skipBlank();
    if (tk.peek() === ",") {
      tk.advance();
      tk.skipBlank();
      // second positional argument (product / address / article) unless it is key: value
      const save = tk.p;
      const ident = tk.readIdentifier();
      tk.skipBlank();
      if (ident.content && tk.peek() !== ":") {
        tk.p = save;
        const objTok = tk.readValue();
        if (objTok) this.objValue = new Value(objTok.getText(), liquid);
        tk.skipBlank();
        if (tk.peek() === ",") tk.advance();
      } else tk.p = save;
    }
    this.hash = new Hash(tk, liquid.options.keyValueSeparator);
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const env = envOf(ctx);
    const type = String(toValue(this.typeValue ? yield this.typeValue.value(ctx, false) : ""));
    const obj = this.objValue ? yield this.objValue.value(ctx, false) : null;
    const hash = (yield this.hash.render(ctx)) as Record<string, unknown>;
    const def = FORMS[type] || { action: () => localePath(env.s, "/") };
    const attrs: [string, string][] = [];
    const id = hash.id !== undefined ? String(toValue(hash.id)) : def.id;
    let action = def.action(env, obj);
    if ((type === "customer" || type === "contact") && hash.id !== undefined) action += `#${id}`;
    attrs.push(["method", "post"], ["action", action]);
    if (id) attrs.push(["id", id]);
    attrs.push(["accept-charset", "UTF-8"]);
    const cls = hash.class !== undefined ? String(toValue(hash.class)) : def.cls;
    if (cls) attrs.push(["class", cls]);
    if (def.enctype) attrs.push(["enctype", "multipart/form-data"]);
    for (const [k, v] of Object.entries(hash)) {
      if (k === "id" || k === "class" || k === "return_to") continue;
      attrs.push([k, String(toValue(v))]);
    }
    let html = `<form ${attrs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(" ")}><input type="hidden" name="form_type" value="${type}" /><input type="hidden" name="utf8" value="✓" />`;
    if (def.hidden) html += def.hidden(env, obj);
    if (hash.return_to !== undefined) html += `<input type="hidden" name="return_to" value="${escapeAttr(String(toValue(hash.return_to)))}" />`;
    emitter.write(html);

    // the `form` object inside the block
    const posted = env.s.postedForm && env.s.postedForm.type === type ? env.s.postedForm : null;
    const flag = type === "customer" ? env.s.query.get("customer_posted") === "true" : type === "contact" ? env.s.query.get("contact_posted") === "true" : false;
    const formObj: Record<string, unknown> = {
      id: id ?? null,
      errors: posted?.errors ? formErrors(posted.errors) : null,
      posted_successfully: !!(posted?.posted_successfully || flag),
      "posted_successfully?": !!(posted?.posted_successfully || flag),
      password_needed: type === "customer_login" ? true : undefined,
      ...(posted?.values || {}),
    };
    if (type === "customer_address" && obj) {
      for (const k of ["first_name", "last_name", "company", "address1", "address2", "city", "country", "province", "zip", "phone", "id"]) {
        formObj[k] = (obj as Record<string, unknown>)[k] ?? formObj[k] ?? null;
      }
      formObj.set_as_default_checkbox = `<input type="checkbox" id="address_default_address_${(obj as { id?: unknown }).id ?? "new"}" name="address[default]" value="1">`;
    }
    ctx.push({ form: formObj });
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    ctx.pop();
    if (type === "product") {
      // Shopify adds these to every product form
      const pid = obj && typeof obj === "object" ? toValue((obj as { id?: unknown }).id) : null;
      const sectionId = (env as Env & { currentSectionId?: string }).currentSectionId;
      if (pid) emitter.write(`<input type="hidden" name="product-id" value="${pid}" />`);
      if (sectionId) emitter.write(`<input type="hidden" name="section-id" value="${escapeAttr(sectionId)}" />`);
    }
    emitter.write("</form>");
  }
}

function escapeAttr(s: string) {
  return s.replace(/&(?![a-z#0-9]+;)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** form.errors: iterates field names; .messages[field]; .translated_fields[field] */
function formErrors(errors: Record<string, string[]>) {
  const fields = Object.keys(errors);
  const messages: Record<string, string> = {};
  const translated: Record<string, string> = {};
  for (const f of fields) {
    messages[f] = errors[f].join(", ");
    translated[f] = f === "form" ? "" : f.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
  const arr = [...fields] as unknown as string[] & { messages: Record<string, string>; translated_fields: Record<string, string> };
  arr.messages = messages;
  arr.translated_fields = translated;
  return arr;
}

// ---------------------------------------------------------------------------------------------
// {% paginate x.y by n %}

export interface Paginatable {
  pageSize: number | null;
  page: number;
  paginateTotal(): number;
}

class PaginateTag extends BlockBase {
  private target: string;
  private by: Value;
  private windowSize = 3;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid, "endpaginate");
    const m = token.args.match(/^\s*([\w.[\]'"-]+)\s+by\s+([^\s,]+)(.*)$/);
    if (!m) throw new Error(`invalid paginate: ${token.args}`);
    this.target = m[1];
    this.by = new Value(m[2], liquid);
    const ws = m[3].match(/window_size:\s*(\d+)/);
    if (ws) this.windowSize = Number(ws[1]);
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const env = envOf(ctx);
    const size = Math.max(1, Math.min(250, Number(toValue(yield this.by.value(ctx, false))) || 50));
    const page = Math.max(1, parseInt(env.s.query.get("page") || "1", 10) || 1);
    const dot = this.target.lastIndexOf(".");
    const parentExpr = dot > 0 ? this.target.slice(0, dot) : this.target;
    const parent = yield new Value(parentExpr, this.liquid).value(ctx, false);
    let total = 0;
    if (parent instanceof CollectionDrop || parent instanceof BlogDrop || (parent && typeof (parent as Paginatable).paginateTotal === "function")) {
      const p = parent as unknown as Paginatable;
      p.pageSize = size;
      p.page = page;
      total = p.paginateTotal();
    } else {
      const arr = toValue(yield new Value(this.target, this.liquid).value(ctx, false));
      total = Array.isArray(arr) ? arr.length : 0;
    }
    const pages = Math.max(1, Math.ceil(total / size));
    const url = (n: number) => pageUrl(env, n);
    const parts: { is_link: boolean; title: string; url?: string }[] = [];
    if (pages > 1) {
      const w = this.windowSize;
      let prevShown = 0;
      for (let i = 1; i <= pages; i++) {
        const show = i === 1 || i === pages || Math.abs(i - page) < w;
        if (!show) continue;
        if (i - prevShown > 1) parts.push({ is_link: false, title: "&hellip;" });
        parts.push(i === page ? { is_link: false, title: String(i) } : { is_link: true, title: String(i), url: url(i) });
        prevShown = i;
      }
    }
    const paginate = {
      current_offset: (page - 1) * size,
      current_page: page,
      items: total,
      page_size: size,
      pages,
      parts,
      previous: page > 1 ? { is_link: true, title: "&laquo; Previous", url: url(page - 1) } : null,
      next: page < pages ? { is_link: true, title: "Next &raquo;", url: url(page + 1) } : null,
      page_param: "page",
    };
    ctx.globals.current_page = page;
    ctx.push({ paginate });
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    ctx.pop();
  }
}

function pageUrl(env: Env, n: number) {
  const q = new URLSearchParams();
  env.s.query.forEach((v, k) => {
    if (k !== "page" && k !== "section_id" && k !== "sections") q.append(k, v);
  });
  q.set("page", String(n));
  return `${env.s.fullPath}?${q.toString()}`;
}

// ---------------------------------------------------------------------------------------------
// {% section 'name' %}, {% sections 'group' %}, {% layout %}

class SectionTag extends Tag {
  private sectionName: string;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    this.sectionName = token.args.trim().replace(/^['"]|['"]$/g, "");
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const env = envOf(ctx);
    const html = yield (env as unknown as { renderStatic: (n: string) => Promise<string> }).renderStatic(this.sectionName);
    emitter.write(html as string);
  }
}

class SectionsTag extends Tag {
  private groupName: string;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    this.groupName = token.args.trim().replace(/^['"]|['"]$/g, "");
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const env = envOf(ctx);
    const html = yield (env as unknown as { renderGroup: (n: string) => Promise<string> }).renderGroup(this.groupName);
    emitter.write(html as string);
  }
}

class LayoutTag extends Tag {
  private value: string;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    this.value = token.args.trim().replace(/^['"]|['"]$/g, "");
  }
  *render(ctx: Context) {
    const env = envOf(ctx) as Env & { layout?: string | null };
    env.layout = this.value === "none" ? null : this.value;
  }
}

/** {% render block %} renders an app block; everything else is LiquidJS' render. */
class ShopifyRenderTag extends RenderTag {
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const file = (this as unknown as { file: unknown }).file;
    if (file && typeof file === "object" && typeof (file as { getText?: unknown }).getText === "function" && !Array.isArray(file)) {
      const v = yield evalToken(file as never, ctx);
      if (v instanceof BlockDrop) {
        if (v.isApp) emitter.write(renderAppBlock(envOf(ctx), v));
        return;
      }
    }
    yield* super.render(ctx, emitter) as Generator<unknown, void, unknown>;
  }
}

export function registerTags(liquid: Liquid) {
  liquid.registerTag("schema", SchemaTag);
  liquid.registerTag("javascript", JavascriptTag);
  liquid.registerTag("stylesheet", StylesheetTag);
  liquid.registerTag("style", StyleTag);
  liquid.registerTag("form", FormTag);
  liquid.registerTag("paginate", PaginateTag);
  liquid.registerTag("section", SectionTag);
  liquid.registerTag("sections", SectionsTag);
  liquid.registerTag("layout", LayoutTag);
  liquid.registerTag("render", ShopifyRenderTag);
}

export { ProductDrop };
