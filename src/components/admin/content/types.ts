// Data passed between the content pages (pages, blog, menus), their editors and server actions.
import type { BgRo } from "../ui";

export interface TemplateChoice {
  /** template suffix; "" = the default template */
  value: string;
  label: string;
  /** false when the template hides the page / article text (its content comes from the theme sections) */
  showsText: boolean;
}

export interface PageForm {
  id: number | null;
  title: BgRo;
  handle: string;
  body: BgRo;
  template: string;
  published: boolean;
  seoTitle: BgRo;
  seoDescription: BgRo;
}

export interface ArticleForm {
  id: number | null;
  blogId: number;
  title: BgRo;
  handle: string;
  author: string;
  body: BgRo;
  excerpt: BgRo;
  /** files-table key of the picture ("" = none) */
  image: string;
  imageAlt: string;
  tags: string[];
  template: string;
  published: boolean;
  /** "YYYY-MM-DDTHH:mm" in Sofia time; "" = when it is first published */
  publishedAt: string;
  seoTitle: BgRo;
  seoDescription: BgRo;
}

/** Where a menu item can point to (as the storefront links them). */
export interface LinkTargets {
  collections: { handle: string; title: string }[];
  products: { handle: string; title: string }[];
  pages: { handle: string; title: string }[];
  blogs: { handle: string; title: string }[];
  articles: { blog: string; handle: string; title: string }[];
}

export interface MenuItemForm {
  title: string;
  /** Romanian title ("" = the Bulgarian one is shown) */
  ro: string;
  /** stored as-is: "/", "/collections/all", "/pages/<handle>", "https://…" */
  url: string;
  /** position path of the item when the editor was opened ("0", "2.1"), to carry its other translations along */
  orig: string | null;
  items: MenuItemForm[];
}

export interface MenuInfo {
  handle: string;
  title: string;
  label: string;
  description: string;
  /** how many levels the theme shows for this menu */
  maxDepth: number;
  items: MenuItemForm[];
}

export type SaveResult = { ok?: boolean; error?: string; id?: number };

/** Longest blog tag (characters). */
export const TAG_MAX = 60;
